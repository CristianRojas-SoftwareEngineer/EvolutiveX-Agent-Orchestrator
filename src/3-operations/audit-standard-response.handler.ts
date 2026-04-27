import * as path from 'node:path';
import type { IAuditWriter } from '../2-services/ports/audit-writer.port.js';
import type { ISessionStore } from '../2-services/ports/session-store.port.js';
import { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';
import {
  AuditInteractionContext,
  ActiveTurn,
  StepMeta,
  TurnMetadata,
  TurnOutcome,
  computeTokenTotals,
} from '../1-domain/types/audit.types.js';

/**
 * Handler para orquestar la auditoría de respuestas estándar (no-SSE).
 * Para agentic-turn: aplica heurística terminal-por-defecto.
 * Para client-preflight: escribe step sin cerrar el turno.
 */
export class AuditStandardResponseHandler {
  constructor(
    private auditWriter: IAuditWriter,
    private config: ProxyEnvironmentConfig,
    private sessionStore: ISessionStore,
  ) {}

  public execute(
    stream: NodeJS.ReadableStream,
    context: AuditInteractionContext,
    contentType: string,
    responseHeaders?: Record<string, string | string[] | undefined>,
  ): void {
    if (!context.auditInteractionDir) {
      return;
    }

    const activeTurn = this.sessionStore.getTurnByDirSync(context.auditInteractionDir);
    const stepNumber = activeTurn?.stepCount ?? 1;
    const stepDir = path.join(
      context.auditInteractionDir,
      'steps',
      String(stepNumber).padStart(3, '0'),
    );

    const chunks: Buffer[] = [];
    const maxBuffer = this.config.MAX_RESPONSE_BUFFER_BYTES;
    let totalBytes = 0;

    stream.on('error', async (err) => {
      console.error('Error en stream no-SSE:', err);
      try {
        const buf = Buffer.concat(chunks);
        await this.auditWriter.finalizeNonSseResponseAuditOnStreamError({
          interactionDir: stepDir,
          bodyBuffer: buf,
          totalBytes,
          maxAuditResponseBytes: this.config.MAX_AUDIT_RESPONSE_BODY_BYTES,
          maxBufferBytes: maxBuffer,
          contentType,
          streamErrorMessage: err?.message || String(err),
        });

        const stepMeta: StepMeta = {
          stepIndex: stepNumber,
          sse: false,
          statusCode: context.responseStatusCode,
        };

        const turn = await this.sessionStore.getTurnByDir(context.auditInteractionDir);
        await this.sessionStore.pushStepMetaByDir(context.auditInteractionDir, stepMeta);

        if (context.interactionType !== 'client-preflight') {
          // Cerrar turno con error
          this.sessionStore.closeTurn(context.auditInteractionDir);
          if (turn) {
            await this.writeTurnMeta(turn, context, 'upstream-error' as TurnOutcome, false, totalBytes);
          }
        }
      } catch (writeErr) {
        console.error('Error al escribir meta de stream error:', writeErr);
      }
    });

    stream.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes <= maxBuffer) {
        chunks.push(chunk);
      }
    });

    stream.on('end', async () => {
      try {
        const buf = Buffer.concat(chunks);

        // Extraer anthropicMessageId del body para correlación con logs de Claude Code
        let anthropicMessageId: string | undefined;
        try {
          const json = JSON.parse(buf.toString('utf8'));
          anthropicMessageId = json.id;
        } catch {
          // Body no es JSON válido — sin messageId
        }

        // Escribir body en el step dir
        await this.auditWriter.finalizeNonSseResponseAudit({
          interactionDir: stepDir,
          bodyBuffer: buf,
          totalBytes,
          maxAuditResponseBytes: this.config.MAX_AUDIT_RESPONSE_BODY_BYTES,
          maxBufferBytes: maxBuffer,
          contentType,
        });

        // Nota: No escribimos response/headers.json a nivel de step para non-SSE
        // Los headers del step son idénticos a los del top-level y no aportan valor adicional

        if (context.interactionType === 'client-preflight') {
          // Preflight: solo acumular step meta, sin heurística terminal
          const stepMeta: StepMeta = {
            stepIndex: stepNumber,
            label: context.turnClassification?.type === 'preflight-quota' ? 'quota-check' : undefined,
            sse: false,
            statusCode: context.responseStatusCode,
            ...(anthropicMessageId ? { anthropicMessageId } : {}),
          };
          await this.sessionStore.pushStepMetaByDir(context.auditInteractionDir, stepMeta);

          // Cerrar preflight inmediatamente
          const preflightTurn = await this.sessionStore.getTurnByDir(context.auditInteractionDir);
          this.sessionStore.closeTurn(context.auditInteractionDir);
          if (preflightTurn) {
            await this.writeTurnMeta(preflightTurn, context, 'completed', false, totalBytes);
          }
          return;
        }

        // Agentic turn: heurística terminal-por-defecto
        const terminalStatus = checkTerminal(buf);

        const stepMeta: StepMeta = {
          stepIndex: stepNumber,
          sse: false,
          statusCode: context.responseStatusCode,
          stopReason: terminalStatus === 'non-terminal' ? 'tool_use' : undefined,
          ...(anthropicMessageId ? { anthropicMessageId } : {}),
        };
        await this.sessionStore.pushStepMetaByDir(context.auditInteractionDir, stepMeta);

        if (terminalStatus !== 'terminal') {
          // Raro: non-SSE con stop_reason=tool_use — mantener turno abierto
          return;
        }

        // Terminal: combinar steps y escribir top-level response
        const topLevel = await this.auditWriter.writeTopLevelMultiStepResponse(
          context.auditInteractionDir,
          stepNumber,
        );
        if (!topLevel.written) {
          console.error('Error al escribir top-level multi-step non-SSE:', topLevel.error);
        }

        if (responseHeaders) {
          await this.auditWriter.writeResponseHeadersAudit(
            context.auditInteractionDir,
            responseHeaders,
          );
        }

        const turn = await this.sessionStore.getTurnByDir(context.auditInteractionDir);
        this.sessionStore.closeTurn(context.auditInteractionDir);

        if (turn) {
          const turnOutcome = this.computeTurnOutcome(context.responseStatusCode);
          await this.writeTurnMeta(turn, context, turnOutcome, false, totalBytes);
        }
      } catch (err) {
        console.error('Error al escribir meta final de respuesta estándar:', err);
      }
    });
  }

  private async writeTurnMeta(
    turn: ActiveTurn,
    context: AuditInteractionContext,
    turnOutcome: TurnOutcome,
    sse: boolean,
    totalResponseBytes: number,
  ): Promise<void> {
    const endedAt = Date.now();

    const totals =
      turn.interactionType !== 'client-preflight'
        ? computeTokenTotals(turn.stepsMeta)
        : null;

    const meta: TurnMetadata = {
      interactionType: turn.interactionType,
      turnOutcome,
      stepCount: turn.stepsMeta.length,
      startedAt: new Date(turn.startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      durationMs: endedAt - turn.startedAt,
      statusCode: context.responseStatusCode,
      sse,
      steps: turn.stepsMeta,
      totals,
      sseResponseBodyAttempted: false,
      sseResponseBodyWritten: false,
      sseResponseBodyError: null,
      sseResponseBodySource: null,
      errorMessage: null,
      errorCode: null,
      ...(turn.parentContext ? { parentContext: turn.parentContext } : {}),
      truncation: {
        requestBodyOmitted: turn.requestBodyOmitted,
        responseBodyBytesTotal: totalResponseBytes,
        responseBodyBytesAudited: Math.min(
          totalResponseBytes,
          this.config.MAX_AUDIT_RESPONSE_BODY_BYTES,
        ),
        responseTruncatedByProxyBuffer: totalResponseBytes > this.config.MAX_RESPONSE_BUFFER_BYTES,
        responseTruncatedByAuditLimit:
          totalResponseBytes > this.config.MAX_AUDIT_RESPONSE_BODY_BYTES,
        sseRawBytesAudited: null,
        sseRawBytesLimit: null,
        sseRawTruncatedByLimit: false,
        sseRawWriteError: false,
      },
    };

    await this.auditWriter.writeTurnMeta(turn.interactionDir, meta);
    // Eliminar state.json al cerrar turno
    await this.auditWriter.removeInteractionState(turn.interactionDir);
  }

  /**
   * Computa el outcome del turno basado en el status code HTTP.
   * - 2xx → completed
   * - 4xx → client-error (error del cliente/request)
   * - 5xx → upstream-error (error del servidor upstream)
   * - null → upstream-error (fallo de conexión)
   */
  private computeTurnOutcome(statusCode: number | null): TurnOutcome {
    if (!statusCode || statusCode < 400) {
      return 'completed';
    }
    if (statusCode >= 500) {
      return 'upstream-error';
    }
    return 'client-error';
  }
}

/**
 * Determina si una respuesta non-SSE es terminal.
 * Heurística: si no contiene "tool_use" → terminal.
 * Si contiene "tool_use" → parsear y verificar stop_reason.
 */
function checkTerminal(buf: Buffer): 'terminal' | 'non-terminal' {
  try {
    const str = buf.toString('utf8');
    if (!str.includes('"tool_use"')) return 'terminal';
    const json = JSON.parse(str);
    if (json.stop_reason === 'tool_use') return 'non-terminal';
  } catch {
    /* JSON inválido → asumir terminal */
  }
  return 'terminal';
}
