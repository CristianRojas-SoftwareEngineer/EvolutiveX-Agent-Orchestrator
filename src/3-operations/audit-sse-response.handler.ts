import * as path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import type { IAuditWriter } from '../2-services/ports/audit-writer.port.js';
import type { ISseReconstructor } from '../2-services/ports/sse-reconstructor.port.js';
import type { ISessionStore } from '../2-services/ports/session-store.port.js';
import { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';
import { JsonValue } from '../1-domain/types/json.types.js';
import {
  AuditInteractionContext,
  ActiveInteraction,
  SseReconstructResult,
  StepMeta,
  InteractionMetadata,
  InteractionOutcome,
  computeTokenTotals,
  computeSseRawBytesTotal,
} from '../1-domain/types/audit.types.js';
import type { Logger } from '../1-domain/types/logger.types.js';

/**
 * Handler para orquestar la auditoría de respuestas SSE.
 * Escribe SSE raw en steps/{N}/response/ y reconstruye el body en response/ top-level al cerrar la interacción.
 */
export class AuditSseResponseHandler {
  constructor(
    private auditWriter: IAuditWriter,
    private sseReconstruct: ISseReconstructor,
    private config: ProxyEnvironmentConfig,
    private sessionStore: ISessionStore,
    private logger?: Logger,
  ) {}

  /**
   * Detecta si un tool_use es de tipo built-in (web_search, web_fetch, text_editor)
   * y retorna el tipo correspondiente, o null si no es built-in.
   */
  private detectBuiltinToolType(
    toolName: string | undefined,
  ): 'web_search' | 'web_fetch' | 'text_editor' | null {
    if (!toolName) return null;
    const name = toolName.toLowerCase();
    if (name === 'web_search' || name === 'websearch') return 'web_search';
    if (name === 'web_fetch' || name === 'webfetch') return 'web_fetch';
    if (name === 'text_editor' || name === 'texteditor') return 'text_editor';
    return null;
  }

  public execute(
    stream: NodeJS.ReadableStream,
    context: AuditInteractionContext,
    responseHeaders: Record<string, string | string[] | undefined>,
  ): void {
    if (!context.auditInteractionDir) {
      return;
    }

    const activeInteraction = this.sessionStore.getInteractionByDirSync(context.auditInteractionDir);
    const stepNumber = activeInteraction?.stepCount ?? 1;
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
    let sseErrorMessage: string | null = null;
    let sseErrorType: string | null = null;
    const toolCalls: string[] = [];
    const toolUseIds: string[] = [];
    /**
     * Tracker de bloques tool_use cuyo `name` es `Agent`. Indexado por el
     * `index` del content_block para acumular el JSON parcial del input
     * (vía `input_json_delta`) y, al recibir `content_block_stop`, extraer
     * `subagent_type` para enriquecer la entrada en `pendingAgentToolUses`.
     */
    const agentBlockTracker = new Map<number, { toolUseId: string; jsonAcc: string }>();
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

          // Parsear eventos clave para metadata de la interacción
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
                // Fallback: proveedores como Xiaomi envían input tokens solo en message_delta
                if (!stepUsage.input_tokens && evt.usage.input_tokens) {
                  stepUsage.input_tokens = evt.usage.input_tokens;
                }
                if (!stepUsage.cache_creation_input_tokens && evt.usage.cache_creation_input_tokens) {
                  stepUsage.cache_creation_input_tokens = evt.usage.cache_creation_input_tokens;
                }
                if (!stepUsage.cache_read_input_tokens && evt.usage.cache_read_input_tokens) {
                  stepUsage.cache_read_input_tokens = evt.usage.cache_read_input_tokens;
                }
              }
              if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
                toolCalls.push(evt.content_block.name);
                if (typeof evt.content_block.id === 'string') {
                  toolUseIds.push(evt.content_block.id);
                  this.sessionStore.registerToolUseId(
                    evt.content_block.id,
                    context.auditInteractionDir,
                  );

                  // Detección de Agent: registrar pending para que la siguiente
                  // fresh request en la misma sesión se clasifique como subagente.
                  // El subagent_type llegará después vía input_json_delta y se
                  // enriquecerá al cierre del bloque.
                  if (
                    typeof evt.content_block.name === 'string' &&
                    evt.content_block.name.toLowerCase() === 'agent' &&
                    typeof evt.index === 'number'
                  ) {
                    this.sessionStore.registerPendingAgentToolUse(
                      context.auditInteractionDir,
                      stepNumber,
                      evt.content_block.id,
                    );
                    agentBlockTracker.set(evt.index, {
                      toolUseId: evt.content_block.id,
                      jsonAcc: '',
                    });
                  }

                  // Detección de built-in tools: registrar pending para que la
                  // siguiente builtin-tool-execution request se anide correctamente.
                  const builtinToolType = this.detectBuiltinToolType(evt.content_block.name);
                  if (builtinToolType) {
                    this.sessionStore.registerPendingBuiltinToolUse(
                      context.auditInteractionDir,
                      stepNumber,
                      evt.content_block.id,
                      builtinToolType,
                    );
                  }
                }
              }
              if (
                evt.type === 'content_block_delta' &&
                evt.delta?.type === 'input_json_delta' &&
                typeof evt.index === 'number' &&
                typeof evt.delta.partial_json === 'string'
              ) {
                const tracked = agentBlockTracker.get(evt.index);
                if (tracked) {
                  tracked.jsonAcc += evt.delta.partial_json;
                }
              }
              if (evt.type === 'error') {
                streamError = true;
                sseErrorMessage = evt.error?.message ?? String(evt);
                sseErrorType = evt.error?.type ?? null;
              }
              if (evt.type === 'content_block_stop' && typeof evt.index === 'number') {
                const tracked = agentBlockTracker.get(evt.index);
                if (tracked) {
                  let subagentType: string | undefined;
                  try {
                    const inputObj = JSON.parse(tracked.jsonAcc) as Record<string, unknown>;
                    if (typeof inputObj.subagent_type === 'string') {
                      subagentType = inputObj.subagent_type;
                    }
                  } catch {
                    /* JSON parcial inválido — sin subagent_type */
                  }
                  if (subagentType) {
                    this.sessionStore.registerPendingAgentToolUse(
                      context.auditInteractionDir,
                      stepNumber,
                      tracked.toolUseId,
                      subagentType,
                    );
                  }
                  agentBlockTracker.delete(evt.index);
                }
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
          ...(toolUseIds.length > 0 ? { toolUseIds } : {}),
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

        // Agentic interaction o side-request
        await this.sessionStore.pushStepMetaByDir(context.auditInteractionDir, stepMeta);

        // Actualizar métricas de sesión per-step
        if (activeInteraction?.modelId) {
          const sessionDir = path.join(this.sessionStore.getBaseDir(), activeInteraction.sessionId);
          const stepTotals = computeTokenTotals([stepMeta]);
          await this.sessionStore.withSessionLock(activeInteraction.sessionId, async () => {
            await this.auditWriter
              .updateSessionMetrics(sessionDir, activeInteraction.modelId!, stepTotals, 1)
              .catch(() => { /* error no crítico */ });
          });
        }

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
          // Interacción no terminal — continúa con el próximo step (continuation).
          // Marcar la interacción como awaiting para que el cleanup pueda detectar
          // orphans cuya continuation nunca llegó.
          const awaitInteraction = this.sessionStore.getInteractionByDirSync(context.auditInteractionDir);
          if (awaitInteraction) {
            awaitInteraction.awaitingContinuation = true;
            awaitInteraction.awaitingSince = Date.now();
          }
          return;
        }

        // Terminal: end_turn, max_tokens, null/error
        const outcome: InteractionOutcome =
          stopReason === 'end_turn'
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
            stepCount: stepNumber,
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

        const turn = await this.sessionStore.getInteractionByDir(context.auditInteractionDir);
        this.sessionStore.closeInteraction(context.auditInteractionDir);

        if (turn) {
          await this.writeInteractionMeta(
            turn,
            context,
            outcome,
            true,
            streamError,
            sseReconstructResult,
            sseErrorMessage,
            sseErrorType,
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
    const isWarmup = context.requestClassification?.type === 'preflight-warmup';
    const meta: StepMeta = {
      ...stepMeta,
      ...(isWarmup ? { label: 'cache-warmup' } : {}),
    };

    await this.sessionStore.pushStepMetaByDir(context.auditInteractionDir, meta);

    if (!isWarmup) {
      // Preflights no-warmup: cerrar inmediatamente (quota-check no llega por SSE
      // normalmente pero mantenemos simetría con standard handler).
      const turn = await this.sessionStore.getInteractionByDir(context.auditInteractionDir);
      this.sessionStore.closeInteraction(context.auditInteractionDir);
      if (turn) {
        await this.writeInteractionMeta(turn, context, 'completed', false, streamError);
      }
      return;
    }

    // El warmup solo cierra la interacción si ésta es realmente un client-preflight.
    // Si la interacción subyacente es agentic (warmup dentro de una interacción activa),
    // no se cierra aquí: se cerrará por el flujo terminal.
    const turn = await this.sessionStore.getInteractionByDir(context.auditInteractionDir);
    if (turn?.interactionType === 'client-preflight') {
      this.sessionStore.closeInteraction(context.auditInteractionDir);
      await this.writeInteractionMeta(turn, context, 'completed', false, streamError);
    }
    // Si la interacción es agentic o side-request, sólo registramos el step
    // (ya hecho arriba) y mantenemos la interacción abierta.
  }

  private async writeInteractionMeta(
    turn: ActiveInteraction,
    context: AuditInteractionContext,
    outcome: InteractionOutcome,
    sse: boolean,
    streamError: boolean,
    sseResult?: SseReconstructResult,
    sseErrorMessage?: string | null,
    sseErrorType?: string | null,
  ): Promise<void> {
    const endedAt = Date.now();
    const sseRawBytesLimit = Number.isFinite(this.config.MAX_AUDIT_SSE_RAW_BYTES)
      ? this.config.MAX_AUDIT_SSE_RAW_BYTES
      : null;

    // Agregar bytes crudos SSE de todos los steps
    const sseRawBytesTotal = computeSseRawBytesTotal(turn.stepsMeta);
    const sseRawTruncatedAny = turn.stepsMeta.some((s) => s.sseRawTruncatedByLimit === true);

    const totals =
      turn.interactionType !== 'client-preflight' ? computeTokenTotals(turn.stepsMeta) : null;

    // Información forense: pending agents no consumidos al cierre
    const lostPendings =
      turn.pendingAgentToolUses.length > 0 ? turn.pendingAgentToolUses : undefined;
    // Información forense: pending builtin tools no consumidos al cierre
    const lostBuiltinPendings =
      turn.pendingBuiltinToolUses.length > 0 ? turn.pendingBuiltinToolUses : undefined;

    const meta: InteractionMetadata = {
      interactionType: turn.interactionType,
      ...(turn.modelId ? { modelId: turn.modelId } : {}),
      outcome,
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
      errorMessage: sseErrorMessage ?? null,
      errorCode: sseErrorType ?? null,
      ...(turn.parentContext ? { parentContext: turn.parentContext } : {}),
      ...(lostPendings ? { lostPendingAgents: lostPendings } : {}),
      ...(lostBuiltinPendings ? { lostPendingBuiltinTools: lostBuiltinPendings } : {}),
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

    await this.auditWriter.writeInteractionMeta(turn.interactionDir, meta);

    // Eliminar state.json al cerrar la interacción
    await this.auditWriter.removeInteractionState(turn.interactionDir);
  }
}
