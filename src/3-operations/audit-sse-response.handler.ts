import * as path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import type { IAuditWriter } from '../2-services/ports/audit-writer.port.js';
import type { ISseReconstructor } from '../2-services/ports/sse-reconstructor.port.js';
import type { ISessionStore } from '../2-services/ports/session-store.port.js';
import { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';
import { JsonValue } from '../1-domain/types/json.types.js';
import {
  AuditInteractionContext,
  ActiveTurn,
  SseReconstructResult,
  StepMeta,
  TurnMetadata,
  TurnOutcome,
  computeTokenTotals,
  computeSseRawBytesTotal,
} from '../1-domain/types/audit.types.js';

/**
 * Handler para orquestar la auditoría de respuestas SSE.
 * Escribe SSE raw en steps/{N}/response/ y reconstruye el body en response/ top-level al cerrar el turno.
 */
export class AuditSseResponseHandler {
  constructor(
    private auditWriter: IAuditWriter,
    private sseReconstruct: ISseReconstructor,
    private config: ProxyEnvironmentConfig,
    private sessionStore: ISessionStore,
  ) {}

  public execute(
    stream: NodeJS.ReadableStream,
    context: AuditInteractionContext,
    responseHeaders: Record<string, string | string[] | undefined>,
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

    this.auditWriter.writeResponseHeadersAudit(stepDir, responseHeaders).catch((e) => {
      console.error('Error al escribir cabeceras de step SSE:', e);
    });

    const maxSseRaw = this.config.MAX_AUDIT_SSE_RAW_BYTES;
    const decoder = new StringDecoder('utf8');
    let lineBuffer = '';
    let sseLineIndex = 0;
    let streamError = false;
    let sseRawBytesWritten = 0;
    let sseRawTruncated = false;
    let stopReason: string | null = null;
    let anthropicMessageId: string | undefined;
    const toolCalls: string[] = [];
    const stepUsage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    };

    stream.on('error', (err) => {
      streamError = true;
      console.error('Error en stream SSE:', err);
    });

    stream.on('data', (chunk: Buffer) => {
      // Captura cruda: siempre activa, acotada por MAX_AUDIT_SSE_RAW_BYTES.
      // Síncrona (ver AuditWriterService.appendSseRawChunk) para preservar
      // el orden de los chunks. Raw dump puro: la reconstrucción se basa en
      // sse.jsonl, no en sse.txt.
      if (!sseRawTruncated) {
        if (sseRawBytesWritten + chunk.length <= maxSseRaw) {
          try {
            this.auditWriter.appendSseRawChunk(stepDir, chunk);
            sseRawBytesWritten += chunk.length;
          } catch (e) {
            console.error('Error al escribir SSE crudo:', e);
          }
        } else {
          const remaining = maxSseRaw - sseRawBytesWritten;
          if (remaining > 0 && Number.isFinite(remaining)) {
            try {
              this.auditWriter.appendSseRawChunk(stepDir, chunk.subarray(0, remaining));
              sseRawBytesWritten += remaining;
            } catch (e) {
              console.error('Error al escribir fragmento final de SSE crudo:', e);
            }
          }
          sseRawTruncated = true;
        }
      }

      // Extracción de líneas SSE
      lineBuffer += decoder.write(chunk);
      let idx;
      while ((idx = lineBuffer.indexOf('\n')) >= 0) {
        const line = lineBuffer.slice(0, idx);
        lineBuffer = lineBuffer.slice(idx + 1);
        const trimmed = line.replace(/\r$/, '').trim();

        if (trimmed !== '') {
          sseLineIndex++;
          this.auditWriter.appendSseLine(stepDir, {
            i: sseLineIndex,
            ts: new Date().toISOString(),
            line: trimmed,
          });

          // Parsear eventos clave para metadata del turno
          if (trimmed.startsWith('data: ')) {
            try {
              const evt = JSON.parse(trimmed.slice(6));
              if (evt.type === 'message_delta' && evt.delta?.stop_reason) {
                stopReason = evt.delta.stop_reason;
              }
              if (evt.type === 'message_stop' && !stopReason && evt.stop_reason) {
                stopReason = evt.stop_reason;
              }
              if (evt.type === 'message_start' && evt.message) {
                // Extraer message.id para correlación con logs de Claude Code
                anthropicMessageId = evt.message.id;
                if (evt.message.usage) {
                  stepUsage.input_tokens = evt.message.usage.input_tokens ?? 0;
                  stepUsage.cache_creation_input_tokens =
                    evt.message.usage.cache_creation_input_tokens ?? 0;
                  stepUsage.cache_read_input_tokens =
                    evt.message.usage.cache_read_input_tokens ?? 0;
                }
              }
              if (evt.type === 'message_delta' && evt.usage) {
                stepUsage.output_tokens = evt.usage.output_tokens ?? 0;
              }
              if (
                evt.type === 'content_block_start' &&
                evt.content_block?.type === 'tool_use'
              ) {
                toolCalls.push(evt.content_block.name);
              }
            } catch {
              /* línea no JSON, ignorar */
            }
          }
        }
      }
    });

    stream.on('end', async () => {
      try {
        lineBuffer += decoder.end();
        const finalTrimmed = lineBuffer.replace(/\r$/, '').trim();
        if (finalTrimmed !== '') {
          sseLineIndex++;
          this.auditWriter.appendSseLine(stepDir, {
            i: sseLineIndex,
            ts: new Date().toISOString(),
            line: finalTrimmed,
          });
        }

        // Registrar sseRawBytesWritten y sseRawTruncatedByLimit por step
        const stepMeta: StepMeta = {
          stepIndex: stepNumber,
          sse: true,
          statusCode: context.responseStatusCode,
          sseLineCount: sseLineIndex,
          stopReason: stopReason ?? undefined,
          ...(toolCalls.length > 0 ? { toolCalls } : {}),
          ...(stepUsage.input_tokens ? { inputTokens: stepUsage.input_tokens } : {}),
          ...(stepUsage.output_tokens ? { outputTokens: stepUsage.output_tokens } : {}),
          ...(stepUsage.cache_creation_input_tokens
            ? { cacheCreationInputTokens: stepUsage.cache_creation_input_tokens }
            : {}),
          ...(stepUsage.cache_read_input_tokens
            ? { cacheReadInputTokens: stepUsage.cache_read_input_tokens }
            : {}),
          ...(sseRawBytesWritten > 0 ? { sseRawBytesWritten } : {}),
          ...(sseRawTruncated ? { sseRawTruncatedByLimit: true } : {}),
          ...(anthropicMessageId ? { anthropicMessageId } : {}),
        };

        if (context.interactionType === 'client-preflight') {
          await this.handlePreflightStepEnd(context, stepMeta, streamError);
          return;
        }

        // Agentic turn o side-request
        await this.sessionStore.pushStepMetaByDir(context.auditInteractionDir, stepMeta);

        // Reconstruir mensaje del step y generar archivos markdown (best-effort)
        try {
          const stepMessage = await this.sseReconstruct.reconstructStepMessage(stepDir);
          await this.auditWriter.writeStepResponseMarkdown(
            stepDir,
            stepMessage as unknown as JsonValue,
          );
        } catch (reconstructErr) {
          // No fallar el step si la reconstrucción falla; solo loggear
          console.error('Error reconstruyendo mensaje del step:', reconstructErr);
        }

        if (stopReason === 'tool_use') {
          // Turno no terminal — continúa con el próximo step (continuation)
          return;
        }

        // Terminal: end_turn, max_tokens, null/error
        const turnOutcome: TurnOutcome = stopReason === 'end_turn'
          ? 'completed'
          : stopReason === 'max_tokens'
            ? 'truncated'
            : streamError
              ? 'upstream-error'
              : 'completed';

        let sseReconstructResult: SseReconstructResult | undefined;
        try {
          sseReconstructResult = await this.sseReconstruct.runReconstruction({
            stepDir,
            interactionDir: context.auditInteractionDir,
            originalUrl: context.url,
            headers: {},
            sseRawBytesWritten,
            sseRawTruncatedByLimit: sseRawTruncated,
            sseRawWriteError: streamError,
          });
        } catch (err) {
          console.error('Error en reconstrucción SSE:', err);
          sseReconstructResult = {
            sseResponseBodyAttempted: true,
            sseResponseBodyWritten: false,
            sseResponseBodyError: err instanceof Error ? err.message : String(err),
          };
        }

        // Escribir headers top-level solo si la reconstrucción produjo body
        if (sseReconstructResult?.sseResponseBodyWritten === true) {
          this.auditWriter
            .writeResponseHeadersAudit(context.auditInteractionDir, responseHeaders)
            .catch((e) => console.error('Error al escribir cabeceras top-level:', e));
        }

        const turn = await this.sessionStore.getTurnByDir(context.auditInteractionDir);
        await this.sessionStore.closeTurn(context.auditInteractionDir, context.auditSessionId);

        if (turn) {
          await this.writeTurnMeta(
            turn,
            context,
            turnOutcome,
            true,
            streamError,
            sseReconstructResult,
          );
        }
      } catch (err) {
        console.error('Error al procesar fin de stream SSE:', err);
      }
    });
  }

  private async handlePreflightStepEnd(
    context: AuditInteractionContext,
    stepMeta: StepMeta,
    streamError: boolean,
  ): Promise<void> {
    const isWarmup = context.turnClassification?.type === 'preflight-warmup';
    const meta: StepMeta = {
      ...stepMeta,
      ...(isWarmup ? { label: 'cache-warmup' } : {}),
    };

    await this.sessionStore.pushStepMetaByDir(context.auditInteractionDir, meta);

    if (!isWarmup) {
      // Preflights no-warmup: cerrar inmediatamente (quota-check no llega por SSE
      // normalmente pero mantenemos simetría con standard handler).
      const turn = await this.sessionStore.getTurnByDir(context.auditInteractionDir);
      await this.sessionStore.closeTurn(context.auditInteractionDir, context.auditSessionId);
      if (turn) {
        await this.writeTurnMeta(turn, context, 'completed', false, streamError);
      }
      return;
    }

    // El warmup solo cierra el turno si éste es realmente un client-preflight.
    // Si el turno subyacente es agentic (warmup dentro de un turno activo),
    // no se cierra aquí: se cerrará por el flujo terminal.
    const turn = await this.sessionStore.getTurnByDir(context.auditInteractionDir);
    if (turn?.interactionType === 'client-preflight') {
      await this.sessionStore.closeTurn(context.auditInteractionDir, context.auditSessionId);
      await this.writeTurnMeta(turn, context, 'completed', false, streamError);
    }
    // Si el turno es agentic-turn o side-request, sólo registramos el step
    // (ya hecho arriba) y mantenemos el turno abierto.
  }

  private async writeTurnMeta(
    turn: ActiveTurn,
    context: AuditInteractionContext,
    turnOutcome: TurnOutcome,
    sse: boolean,
    streamError: boolean,
    sseResult?: SseReconstructResult,
  ): Promise<void> {
    const endedAt = Date.now();
    const sseRawBytesLimit = Number.isFinite(this.config.MAX_AUDIT_SSE_RAW_BYTES)
      ? this.config.MAX_AUDIT_SSE_RAW_BYTES
      : null;

    // Agregar bytes crudos SSE de todos los steps
    const sseRawBytesTotal = computeSseRawBytesTotal(turn.stepsMeta);
    const sseRawTruncatedAny = turn.stepsMeta.some((s) => s.sseRawTruncatedByLimit === true);

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
      sseResponseBodyAttempted: sseResult?.sseResponseBodyAttempted ?? false,
      sseResponseBodyWritten: sseResult?.sseResponseBodyWritten ?? false,
      sseResponseBodyError: sseResult?.sseResponseBodyError ?? null,
      sseResponseBodySource: sseResult?.sseResponseBodySource ?? null,
      errorMessage: null,
      errorCode: null,
      truncation: {
        requestBodyOmitted: turn.requestBodyOmitted,
        responseBodyBytesTotal: null,
        responseBodyBytesAudited: null,
        responseTruncatedByProxyBuffer: false,
        responseTruncatedByAuditLimit: false,
        sseRawBytesAudited: sseRawBytesTotal || null,
        sseRawBytesLimit,
        sseRawTruncatedByLimit: sseRawTruncatedAny,
        sseRawWriteError: streamError,
      },
    };

    await this.auditWriter.writeTurnMeta(turn.interactionDir, meta);
    // Eliminar state.json al cerrar turno
    await this.auditWriter.removeInteractionState(turn.interactionDir);
  }
}
