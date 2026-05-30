import * as path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import type { IWorkflowRepository } from '../1-domain/repositories/IWorkflowRepository.js';
import type { IAuditWriter } from '../2-services/ports/audit-writer.port.js';
import type { ISseReconstructor } from '../2-services/ports/sse-reconstructor.port.js';
import type { ISessionStore } from '../2-services/ports/session-store.port.js';
import type { AssembledInference, IStepAssembler } from '../2-services/ports/step-assembler.port.js';
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
  SsePhase,
} from '../1-domain/types/audit.types.js';
import type { Logger } from '../1-domain/types/logger.types.js';
import { PAD_STEP } from '../1-domain/constants/audit-paths.js';
import {
  buildInferenceRequestSnapshot,
  buildWireStep,
  registerWireStepInCorrelator,
  resolveWorkflowIdForInteraction,
  shouldDeferMetaCloseToHooks,
} from './gateway-wire-step.util.js';

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
    private createStepAssembler: () => IStepAssembler,
    private workflowRepo: IWorkflowRepository,
    private logger?: Logger,
  ) {}

  public execute(
    stream: NodeJS.ReadableStream,
    context: AuditInteractionContext,
    responseHeaders: Record<string, string | string[] | undefined>,
  ): void {
    if (!context.auditInteractionDir) {
      return;
    }

    const activeInteraction = this.sessionStore.getInteractionByDirSync(
      context.auditInteractionDir,
    );
    const coalescedAgentContinuation = context.coalescedAgentContinuation;
    const stepNumber = coalescedAgentContinuation?.targetStepIndex ?? context.assignedStepIndex;
    const isCoalescedAgentContinuation = coalescedAgentContinuation !== undefined;
    const stepDir = path.join(
      context.auditInteractionDir,
      'steps',
      String(stepNumber).padStart(PAD_STEP, '0'),
    );
    const responseDir = path.join(stepDir, 'response');
    // Para steps coalesced de Agent, usamos un único sse.jsonl multi-fase
    const sseJsonlPath = path.join(responseDir, 'sse.jsonl');
    // Eliminamos sse.txt para steps coalesced (solo body.json y sse.jsonl son canónicos)
    const sseRawPath = isCoalescedAgentContinuation ? null : path.join(responseDir, 'sse.txt');
    const currentPhase: SsePhase = isCoalescedAgentContinuation ? 'continuation' : 'delegation';
    const assembler = this.createStepAssembler();

    this.auditWriter.writeResponseHeadersAudit(stepDir, responseHeaders).catch((e) => {
      console.error('Error al escribir cabeceras de step SSE:', e);
    });

    const maxSseRaw = this.config.MAX_AUDIT_BYTES;
    const decoder = new StringDecoder('utf8');
    let lineBuffer = '';
    let sseLineIndex = 0;
    let streamError = false;
    let sseRawBytesWritten = 0;
    let sseRawTruncated = false;
    let sseErrorMessage: string | null = null;
    let sseErrorType: string | null = null;
    /**
     * Tracker de bloques tool_use cuyo `name` es `Agent`. Indexado por el
     * `index` del content_block para acumular el JSON parcial del input
     * (vía `input_json_delta`) y, al recibir `content_block_stop`, extraer
     * `subagent_type` para enriquecer la entrada en `pendingAgentToolUses`.
     */
    const agentBlockTracker = new Map<number, { toolUseId: string; jsonAcc: string }>();

    stream.on('error', (err) => {
      streamError = true;
      console.error('Error en stream SSE:', err);
    });

    stream.on('data', (chunk: Buffer) => {
      // Captura cruda: siempre activa, acotada por MAX_AUDIT_BYTES.
      // Síncrona (ver AuditWriterService.appendSseRawChunk) para preservar
      // el orden de los chunks. Raw dump puro: la reconstrucción se basa en
      // sse.jsonl, no en sse.txt.
      if (!sseRawTruncated && sseRawPath !== null) {
        if (sseRawBytesWritten + chunk.length <= maxSseRaw) {
          try {
            this.auditWriter.appendSseRawChunk(sseRawPath, chunk);
            sseRawBytesWritten += chunk.length;
          } catch (e) {
            console.error('Error al escribir SSE crudo:', e);
          }
        } else {
          const remaining = maxSseRaw - sseRawBytesWritten;
          if (remaining > 0 && Number.isFinite(remaining)) {
            try {
              this.auditWriter.appendSseRawChunk(sseRawPath, chunk.subarray(0, remaining));
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
          this.auditWriter.appendSseLine(sseJsonlPath, {
            i: sseLineIndex,
            ts: new Date().toISOString(),
            line: trimmed,
            phase: isCoalescedAgentContinuation ? currentPhase : 'delegation',
          });

          // Parsear eventos clave para metadata de la interacción
          if (trimmed.startsWith('data: ')) {
            try {
              const evt = JSON.parse(trimmed.slice(6));
              assembler.onEvent(evt);
              if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
                if (typeof evt.content_block.id === 'string') {
                  this.sessionStore.registerToolUseId(
                    evt.content_block.id,
                    context.auditInteractionDir,
                  );

                  const toolName =
                    typeof evt.content_block.name === 'string'
                      ? evt.content_block.name.toLowerCase()
                      : '';

                  // Detección de Agent: registrar pending para que la siguiente
                  // fresh request en la misma sesión se clasifique como subagente.
                  if (toolName === 'agent' && typeof evt.index === 'number') {
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

                  // Detección de WebSearch: Claude Code usa 'WebSearch' (websearch),
                  // otros proveedores pueden usar 'web_search'.
                  if (
                    (toolName === 'websearch' || toolName === 'web_search') &&
                    typeof evt.content_block.id === 'string'
                  ) {
                    this.sessionStore.registerPendingWebSearchToolUse(
                      context.auditInteractionDir,
                      stepNumber,
                      evt.content_block.id,
                    );
                  }

                  // Detección de WebFetch: Claude Code usa 'WebFetch' (webfetch),
                  // otros proveedores pueden usar 'web_fetch'.
                  if (
                    (toolName === 'webfetch' || toolName === 'web_fetch') &&
                    typeof evt.content_block.id === 'string'
                  ) {
                    this.sessionStore.registerPendingWebFetchToolUse(
                      context.auditInteractionDir,
                      stepNumber,
                      evt.content_block.id,
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
                  let description: string | undefined;
                  let prompt: string | undefined;
                  try {
                    const inputObj = JSON.parse(tracked.jsonAcc) as Record<string, unknown>;
                    if (typeof inputObj.subagent_type === 'string') {
                      subagentType = inputObj.subagent_type;
                    }
                    if (typeof inputObj.description === 'string') {
                      description = inputObj.description;
                    }
                    if (typeof inputObj.prompt === 'string') {
                      prompt = inputObj.prompt;
                    }
                  } catch {
                    /* JSON parcial inválido — sin metadata */
                  }
                  if (subagentType || description || prompt) {
                    this.sessionStore.registerPendingAgentToolUse(
                      context.auditInteractionDir,
                      stepNumber,
                      tracked.toolUseId,
                      { subagentType, description, prompt },
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
          this.auditWriter.appendSseLine(sseJsonlPath, {
            i: sseLineIndex,
            ts: new Date().toISOString(),
            line: finalTrimmed,
          });
        }

        const assembled = assembler.result();
        this.propagateWorkflowModel(activeInteraction);
        this.registerWireInference(activeInteraction, assembled);

        const thinkingBlocks = assembled.thinkingTexts;
        const stopReason = assembled.stopReason ?? null;

        // Escribir extended thinking si se detectaron bloques
        if (thinkingBlocks.length > 0) {
          this.auditWriter.writeStepThought(stepDir, thinkingBlocks).catch((e) => {
            console.error('Error al escribir thought del step:', e);
          });
        }

        const stepMeta = this.buildStepMeta(
          assembled,
          stepNumber,
          context.responseStatusCode,
          sseLineIndex,
          sseRawBytesWritten,
          sseRawTruncated,
        );

        if (context.interactionType === 'client-preflight') {
          await this.handlePreflightStepEnd(context, stepMeta, streamError);
          return;
        }

        if (isCoalescedAgentContinuation) {
          const turn = await this.sessionStore.getInteractionByDir(context.auditInteractionDir);
          if (!turn) return;

          const targetMeta = turn.stepsMeta.find((s) => s.stepIndex === stepNumber);
          const continuationMeta = {
            toolUseIds: coalescedAgentContinuation.toolUseIds,
            sseLineCount: sseLineIndex,
            stopReason: stopReason ?? undefined,
            statusCode: context.responseStatusCode,
            ...(assembled.usage.input_tokens ? { inputTokens: assembled.usage.input_tokens } : {}),
            ...(assembled.usage.output_tokens ? { outputTokens: assembled.usage.output_tokens } : {}),
            ...(assembled.usage.cache_creation_input_tokens
              ? { cacheCreationInputTokens: assembled.usage.cache_creation_input_tokens }
              : {}),
            ...(assembled.usage.cache_read_input_tokens
              ? { cacheReadInputTokens: assembled.usage.cache_read_input_tokens }
              : {}),
            ...(sseRawBytesWritten > 0 ? { sseRawBytesWritten } : {}),
            ...(sseRawTruncated ? { sseRawTruncatedByLimit: true } : {}),
            ...(assembled.anthropicMessageId ? { anthropicMessageId: assembled.anthropicMessageId } : {}),
          };

          if (targetMeta) {
            targetMeta.coalescedAgentContinuation = continuationMeta;
            targetMeta.stopReason = stopReason ?? targetMeta.stopReason;
          } else {
            await this.sessionStore.pushStepMetaByDir(context.auditInteractionDir, {
              stepIndex: stepNumber,
              sse: true,
              statusCode: context.responseStatusCode,
              stopReason: stopReason ?? undefined,
              coalescedAgentContinuation: continuationMeta,
            });
          }

          let sseReconstructResult: SseReconstructResult | undefined;
          try {
            // Para steps coalesced, reconstruir initialMessage desde la fase "delegation"
            const initialMessage = await this.sseReconstruct.reconstructSseJsonlPhaseMessage(
              sseJsonlPath,
              'delegation',
            );
            // Reconstruir finalMessage desde la fase "continuation"
            const finalMessage = await this.sseReconstruct.reconstructSseJsonlPhaseMessage(
              sseJsonlPath,
              'continuation',
            );
            // La request de continuation viene del contexto en memoria, no de archivos
            const continuationRequest = coalescedAgentContinuation?.continuationRequest ?? null;
            const continuationHeaders = coalescedAgentContinuation?.continuationHeaders;
            await this.auditWriter.writeCoalescedAgentStepResponse({
              stepDir,
              initialMessage: initialMessage as unknown as JsonValue,
              continuationRequest,
              continuationHeaders,
              finalMessage: finalMessage as unknown as JsonValue,
              toolUseIds: coalescedAgentContinuation.toolUseIds,
              context: {
                interactionType: context.interactionType,
                stepIndex: stepNumber,
                stepCount: activeInteraction?.stepCount,
                modelId: activeInteraction?.modelId,
              },
            });
            sseReconstructResult = await this.sseReconstruct.runReconstruction({
              stepDir,
              interactionDir: context.auditInteractionDir,
              stepCount: activeInteraction?.stepCount ?? stepNumber,
              originalUrl: context.url,
              headers: {},
              sseRawBytesWritten,
              sseRawTruncatedByLimit: sseRawTruncated,
              sseRawWriteError: streamError,
              context: {
                interactionType: context.interactionType,
                stepIndex: stepNumber,
                stepCount: activeInteraction?.stepCount,
                modelId: activeInteraction?.modelId,
              },
            });
          } catch (err) {
            console.error('Error en reconstrucción SSE coalesced:', err);
            sseReconstructResult = {
              sseResponseBodyAttempted: true,
              sseResponseBodyWritten: false,
              sseResponseBodyError: err instanceof Error ? err.message : String(err),
            };
          }

          if (sseReconstructResult?.sseResponseBodyWritten === true) {
            this.auditWriter
              .writeTopLevelResponseHeaders(context.auditInteractionDir, responseHeaders)
              .catch((e) => console.error('Error al escribir cabeceras top-level:', e));
          }

          const outcome: InteractionOutcome =
            stopReason === 'max_tokens'
              ? 'truncated'
              : streamError
                ? 'upstream-error'
                : 'completed';

          turn.coalescedAgentContinuation = undefined;
          await this.finishTerminalSseInteraction({
            context,
            activeInteraction: turn,
            outcome,
            streamError,
            sseReconstructResult,
            sseErrorMessage,
            sseErrorType,
          });
          return;
        }

        // Agentic interaction o side-request
        await this.sessionStore.pushStepMetaByDir(context.auditInteractionDir, stepMeta);

        // Reconstruir mensaje del step y generar archivos markdown (best-effort)
        try {
          const stepMessage = await this.sseReconstruct.reconstructStepMessage(stepDir);
          await this.auditWriter.writeStepResponseMarkdown(
            stepDir,
            stepMessage as unknown as JsonValue,
            {
              stepIndex: stepNumber,
              stepCount: activeInteraction?.stepCount,
              modelId: activeInteraction?.modelId,
              thoughtContentPath: thinkingBlocks.length > 0 ? 'thought/content.md' : undefined,
            },
          );
        } catch (reconstructErr) {
          // No fallar el step si la reconstrucción falla; solo loggear
          console.error('Error reconstruyendo mensaje del step:', reconstructErr);
        }

        if (stopReason === 'tool_use') {
          // Interacción no terminal — continúa con el próximo step (continuation).
          // Marcar la interacción como awaiting para que el cleanup pueda detectar
          // orphans cuya continuation nunca llegó.
          const awaitInteraction = this.sessionStore.getInteractionByDirSync(
            context.auditInteractionDir,
          );
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
            context: {
              interactionType: context.interactionType,
              stepIndex: stepNumber,
              stepCount: activeInteraction?.stepCount,
              modelId: activeInteraction?.modelId,
              thoughtContentPath: thinkingBlocks.length > 0 ? 'thought/content.md' : undefined,
            },
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
            .writeTopLevelResponseHeaders(context.auditInteractionDir, responseHeaders)
            .catch((e) => console.error('Error al escribir cabeceras top-level:', e));
        }

        if (context.isInternalToolStep) {
          // Es un step interno (WebSearch/WebFetch). No cerrar la interacción padre.
          // Marcarla como awaitingContinuation para que la próxima continuation no la considere huérfana.
          const awaitInteraction = this.sessionStore.getInteractionByDirSync(
            context.auditInteractionDir,
          );
          if (awaitInteraction) {
            awaitInteraction.awaitingContinuation = true;
            awaitInteraction.awaitingSince = Date.now();
          }
          return;
        }

        await this.finishTerminalSseInteraction({
          context,
          activeInteraction,
          outcome,
          streamError,
          sseReconstructResult,
          sseErrorMessage,
          sseErrorType,
        });
      } catch (err) {
        console.error('Error al procesar fin de stream SSE:', err);
      }
    });
  }

  private registerWireInference(
    interaction: ActiveInteraction | null | undefined,
    assembled: AssembledInference,
  ): void {
    if (!interaction || interaction.interactionType === 'client-preflight') return;

    const inferenceRequest = buildInferenceRequestSnapshot(interaction, assembled);
    const now = new Date();
    const wireStep = buildWireStep({
      interaction,
      inferenceRequest,
      assistantMessage: assembled.assistantMessage,
      usage: assembled.usage,
      stopReason: assembled.stopReason,
      startedAt: now,
      closedAt: now,
    });
    registerWireStepInCorrelator(this.workflowRepo, wireStep, assembled.stopReason);
  }

  /**
   * Cierra el turno en store y escribe meta, o difiere al hook Stop si el correlador está abierto.
   */
  private async finishTerminalSseInteraction(params: {
    context: AuditInteractionContext;
    activeInteraction: ActiveInteraction | null | undefined;
    outcome: InteractionOutcome;
    streamError: boolean;
    sseReconstructResult?: SseReconstructResult;
    sseErrorMessage?: string | null;
    sseErrorType?: string | null;
  }): Promise<void> {
    const { context, activeInteraction, outcome } = params;

    if (activeInteraction) {
      const workflowId = resolveWorkflowIdForInteraction(activeInteraction);
      const wf = this.workflowRepo.getWorkflow(workflowId);
      if (wf?.result != null) {
        const turn = await this.sessionStore.getInteractionByDir(context.auditInteractionDir);
        if (turn) this.sessionStore.closeInteraction(context.auditInteractionDir);
        return;
      }
      if (shouldDeferMetaCloseToHooks(this.workflowRepo, workflowId)) {
        return;
      }
    }

    const turn = await this.sessionStore.getInteractionByDir(context.auditInteractionDir);
    this.sessionStore.closeInteraction(context.auditInteractionDir);

    if (turn) {
      // @deprecated-fallback — sin hooks o workflow ausente en correlador
      await this.writeInteractionMeta(
        turn,
        context,
        outcome,
        true,
        params.streamError,
        params.sseReconstructResult,
        params.sseErrorMessage,
        params.sseErrorType,
      );
    }
  }

  private propagateWorkflowModel(interaction: ActiveInteraction | null | undefined): void {
    if (!interaction?.modelId) return;
    const workflowId = interaction.parentContext?.wireAgentId ?? interaction.sessionId;
    this.workflowRepo.setWorkflowModel(workflowId, interaction.modelId);
  }

  private buildStepMeta(
    assembled: AssembledInference,
    stepIndex: number,
    statusCode: number | null,
    sseLineCount: number,
    sseRawBytesWritten: number,
    sseRawTruncated: boolean,
  ): StepMeta {
    const toolCalls = assembled.toolUseBlocks.map((b) => b.name);
    const toolUseIds = assembled.toolUseBlocks.map((b) => b.id);
    const usage = assembled.usage;

    return {
      stepIndex,
      sse: true,
      statusCode,
      sseLineCount,
      stopReason: assembled.stopReason,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      ...(toolUseIds.length > 0 ? { toolUseIds } : {}),
      ...(usage.input_tokens ? { inputTokens: usage.input_tokens } : {}),
      ...(usage.output_tokens ? { outputTokens: usage.output_tokens } : {}),
      ...(usage.cache_creation_input_tokens
        ? { cacheCreationInputTokens: usage.cache_creation_input_tokens }
        : {}),
      ...(usage.cache_read_input_tokens ? { cacheReadInputTokens: usage.cache_read_input_tokens } : {}),
      ...(sseRawBytesWritten > 0 ? { sseRawBytesWritten } : {}),
      ...(sseRawTruncated ? { sseRawTruncatedByLimit: true } : {}),
      ...(assembled.anthropicMessageId ? { anthropicMessageId: assembled.anthropicMessageId } : {}),
      ...(assembled.thinkingTexts.length > 0
        ? { hasThinking: true, thinkingBlockCount: assembled.thinkingTexts.length }
        : {}),
    };
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
    const sseRawBytesLimit = this.config.MAX_AUDIT_BYTES;

    // Agregar bytes crudos SSE de todos los steps
    const sseRawBytesTotal = computeSseRawBytesTotal(turn.stepsMeta);
    const sseRawTruncatedAny = turn.stepsMeta.some((s) => s.sseRawTruncatedByLimit === true);

    const totals =
      turn.interactionType !== 'client-preflight' ? computeTokenTotals(turn.stepsMeta) : null;

    // Información forense: pending agents no consumidos al cierre
    const lostPendings =
      turn.pendingAgentToolUses.length > 0 ? turn.pendingAgentToolUses : undefined;
    const lostPendingsWebSearch =
      turn.pendingWebSearchToolUses.length > 0 ? turn.pendingWebSearchToolUses : undefined;
    const lostPendingsWebFetch =
      turn.pendingWebFetchToolUses.length > 0 ? turn.pendingWebFetchToolUses : undefined;

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
      ...(turn.sideRequestKind ? { sideRequestKind: turn.sideRequestKind } : {}),
      ...(lostPendings ? { lostPendingAgents: lostPendings } : {}),
      ...(lostPendingsWebSearch ? { lostPendingWebSearch: lostPendingsWebSearch } : {}),
      ...(lostPendingsWebFetch ? { lostPendingWebFetch: lostPendingsWebFetch } : {}),
      ...(turn.resolvedInternalTools.length > 0
        ? { resolvedInternalTools: turn.resolvedInternalTools }
        : {}),
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
