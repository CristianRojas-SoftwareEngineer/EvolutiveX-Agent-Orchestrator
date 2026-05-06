import * as path from 'node:path';
import type { IAuditWriter } from '../2-services/ports/audit-writer.port.js';
import type { ISessionStore } from '../2-services/ports/session-store.port.js';
import { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';
import {
  AuditInteractionContext,
  ActiveInteraction,
  StepMeta,
  InteractionMetadata,
  InteractionOutcome,
  computeTokenTotals,
} from '../1-domain/types/audit.types.js';
import { PAD_STEP } from '../1-domain/constants/audit-paths.js';

/**
 * Handler para orquestar la auditoría de respuestas estándar (no-SSE).
 * Para agentic: aplica heurística terminal-por-defecto.
 * Para client-preflight: escribe step sin cerrar la interacción.
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

    const _activeInteraction = this.sessionStore.getInteractionByDirSync(context.auditInteractionDir);
    const stepNumber = context.assignedStepIndex;
    const stepDir = path.join(
      context.auditInteractionDir,
      'steps',
      String(stepNumber).padStart(PAD_STEP, '0'),
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

        // Extraer usage del body en caso de error (best-effort)
        let errorBodyUsage:
          | {
              input_tokens?: number;
              output_tokens?: number;
              cache_creation_input_tokens?: number;
              cache_read_input_tokens?: number;
            }
          | undefined;
        if (buf.length > 0) {
          try {
            const errorJson = JSON.parse(buf.toString('utf8'));
            if (errorJson.usage) {
              errorBodyUsage = errorJson.usage;
            }
          } catch {
            /* Body no es JSON válido — sin usage */
          }
        }

        const stepMeta: StepMeta = {
          stepIndex: stepNumber,
          sse: false,
          statusCode: context.responseStatusCode,
          ...(errorBodyUsage?.input_tokens ? { inputTokens: errorBodyUsage.input_tokens } : {}),
          ...(errorBodyUsage?.output_tokens ? { outputTokens: errorBodyUsage.output_tokens } : {}),
          ...(errorBodyUsage?.cache_creation_input_tokens
            ? { cacheCreationInputTokens: errorBodyUsage.cache_creation_input_tokens }
            : {}),
          ...(errorBodyUsage?.cache_read_input_tokens
            ? { cacheReadInputTokens: errorBodyUsage.cache_read_input_tokens }
            : {}),
        };

        const interaction = await this.sessionStore.getInteractionByDir(context.auditInteractionDir);
        await this.sessionStore.pushStepMetaByDir(context.auditInteractionDir, stepMeta);

        if (context.interactionType !== 'client-preflight') {
          // Cerrar interacción con error
          this.sessionStore.closeInteraction(context.auditInteractionDir);
          if (interaction) {
            await this.writeInteractionMeta(
              interaction,
              context,
              'upstream-error' as InteractionOutcome,
              false,
              totalBytes,
            );
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

        // Extraer anthropicMessageId y usage del body para correlación con logs de Claude Code
        let anthropicMessageId: string | undefined;
        let bodyUsage:
          | {
              input_tokens?: number;
              output_tokens?: number;
              cache_creation_input_tokens?: number;
              cache_read_input_tokens?: number;
            }
          | undefined;
        try {
          const json = JSON.parse(buf.toString('utf8'));
          anthropicMessageId = json.id;
          if (json.usage) {
            bodyUsage = json.usage;
          }
        } catch {
          // Body no es JSON válido — sin messageId ni usage
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
            label:
              context.requestClassification?.type === 'preflight-quota' ? 'quota-check' : undefined,
            sse: false,
            statusCode: context.responseStatusCode,
            ...(anthropicMessageId ? { anthropicMessageId } : {}),
            ...(bodyUsage?.input_tokens ? { inputTokens: bodyUsage.input_tokens } : {}),
            ...(bodyUsage?.output_tokens ? { outputTokens: bodyUsage.output_tokens } : {}),
            ...(bodyUsage?.cache_creation_input_tokens
              ? { cacheCreationInputTokens: bodyUsage.cache_creation_input_tokens }
              : {}),
            ...(bodyUsage?.cache_read_input_tokens
              ? { cacheReadInputTokens: bodyUsage.cache_read_input_tokens }
              : {}),
          };
          await this.sessionStore.pushStepMetaByDir(context.auditInteractionDir, stepMeta);

          // Cerrar preflight inmediatamente
          const preflightInteraction = await this.sessionStore.getInteractionByDir(context.auditInteractionDir);
          this.sessionStore.closeInteraction(context.auditInteractionDir);
          if (preflightInteraction) {
            await this.writeInteractionMeta(preflightInteraction, context, 'completed', false, totalBytes);
          }
          return;
        }

        // Agentic: heurística terminal-por-defecto
        const terminalStatus = checkTerminal(buf);

        const stepMeta: StepMeta = {
          stepIndex: stepNumber,
          sse: false,
          statusCode: context.responseStatusCode,
          stopReason: terminalStatus === 'non-terminal' ? 'tool_use' : undefined,
          ...(anthropicMessageId ? { anthropicMessageId } : {}),
          ...(bodyUsage?.input_tokens ? { inputTokens: bodyUsage.input_tokens } : {}),
          ...(bodyUsage?.output_tokens ? { outputTokens: bodyUsage.output_tokens } : {}),
          ...(bodyUsage?.cache_creation_input_tokens
            ? { cacheCreationInputTokens: bodyUsage.cache_creation_input_tokens }
            : {}),
          ...(bodyUsage?.cache_read_input_tokens
            ? { cacheReadInputTokens: bodyUsage.cache_read_input_tokens }
            : {}),
        };
        await this.sessionStore.pushStepMetaByDir(context.auditInteractionDir, stepMeta);

        // Actualizar métricas de sesión per-step
        const currentInteraction = this.sessionStore.getInteractionByDirSync(context.auditInteractionDir);
        if (currentInteraction?.modelId) {
          const sessionDir = path.join(this.sessionStore.getBaseDir(), currentInteraction.sessionId);
          const stepTotals = computeTokenTotals([stepMeta]);
          await this.sessionStore.withSessionLock(currentInteraction.sessionId, async () => {
            await this.auditWriter
              .updateSessionMetrics(sessionDir, currentInteraction.modelId!, stepTotals, 1)
              .catch(() => { /* error no crítico */ });
          });
        }

        if (terminalStatus !== 'terminal') {
          // Raro: non-SSE con stop_reason=tool_use — mantener interacción abierta
          return;
        }

        // Terminal: combinar steps y escribir top-level response
        const topLevel = await this.auditWriter.writeTopLevelMultiStepResponse(
          context.auditInteractionDir,
          stepNumber,
          {
            interactionType: context.interactionType,
            stepCount: stepNumber,
          },
        );
        if (!topLevel.written) {
          console.error('Error al escribir top-level multi-step non-SSE:', topLevel.error);
        }

        if (responseHeaders) {
          await this.auditWriter.writeTopLevelResponseHeaders(
            context.auditInteractionDir,
            responseHeaders,
          );
        }

        const interaction = await this.sessionStore.getInteractionByDir(context.auditInteractionDir);
        this.sessionStore.closeInteraction(context.auditInteractionDir);

        if (interaction) {
          const outcome = this.computeInteractionOutcome(context.responseStatusCode);
          await this.writeInteractionMeta(interaction, context, outcome, false, totalBytes);
        }
      } catch (err) {
        console.error('Error al escribir meta final de respuesta estándar:', err);
      }
    });
  }

  private async writeInteractionMeta(
    interaction: ActiveInteraction,
    context: AuditInteractionContext,
    interactionOutcome: InteractionOutcome,
    sse: boolean,
    totalResponseBytes: number,
  ): Promise<void> {
    const endedAt = Date.now();

    const totals =
      interaction.interactionType !== 'client-preflight' ? computeTokenTotals(interaction.stepsMeta) : null;

    const meta: InteractionMetadata = {
      interactionType: interaction.interactionType,
      ...(interaction.modelId ? { modelId: interaction.modelId } : {}),
      outcome: interactionOutcome,
      stepCount: interaction.stepsMeta.length,
      startedAt: new Date(interaction.startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      durationMs: endedAt - interaction.startedAt,
      statusCode: context.responseStatusCode,
      sse,
      steps: interaction.stepsMeta,
      totals,
      sseResponseBodyAttempted: false,
      sseResponseBodyWritten: false,
      sseResponseBodyError: null,
      sseResponseBodySource: null,
      errorMessage: null,
      errorCode: null,
      ...(interaction.parentContext ? { parentContext: interaction.parentContext } : {}),
      ...(interaction.resolvedInternalTools.length > 0 ? { resolvedInternalTools: interaction.resolvedInternalTools } : {}),
      truncation: {
        requestBodyOmitted: interaction.requestBodyOmitted,
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

    await this.auditWriter.writeInteractionMeta(interaction.interactionDir, meta);

    // Eliminar state.json al cerrar interacción
    await this.auditWriter.removeInteractionState(interaction.interactionDir);
  }

  /**
   * Computa el outcome de la interacción basado en el status code HTTP.
   * - 2xx → completed
   * - 4xx → client-error (error del cliente/request)
   * - 5xx → upstream-error (error del servidor upstream)
   * - null → upstream-error (fallo de conexión)
   */
  private computeInteractionOutcome(statusCode: number | null): InteractionOutcome {
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
