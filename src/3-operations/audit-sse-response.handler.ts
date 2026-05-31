import * as path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import type { IWorkflowRepository } from '../1-domain/repositories/IWorkflowRepository.js';
import type { IEventBus } from '../1-domain/repositories/IEventBus.js';
import type { ISseAuditWriter } from '../2-services/ports/sse-audit-writer.port.js';
import type { ISseReconstructor } from '../2-services/ports/sse-reconstructor.port.js';
import type { AssembledInference, IStepAssembler } from '../2-services/ports/step-assembler.port.js';
import { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';
import { JsonValue } from '../1-domain/types/json.types.js';
import {
  AuditInteractionContext,
  SseReconstructResult,
  SsePhase,
} from '../1-domain/types/audit.types.js';
import type { IWorkflow } from '../1-domain/interfaces/gateway/IWorkflow.js';
import type { IToolUse } from '../1-domain/interfaces/gateway/IToolUse.js';
import type { Logger } from '../1-domain/types/logger.types.js';
import { PAD_STEP } from '../1-domain/constants/audit-paths.js';
import {
  buildInferenceRequestSnapshot,
  buildWireStep,
  registerWireStepInCorrelator,
} from './gateway-wire-step.util.js';

/**
 * Handler para orquestar la auditoría de respuestas SSE.
 * Escribe SSE raw/jsonl en steps/{N}/response/ (@deprecated-p2) y registra el step
 * en el correlador para que SessionPersistence proyecte meta.json vía bus.
 */
export class AuditSseResponseHandler {
  constructor(
    /** @deprecated-p2 Escrituras SSE inline: sse.jsonl, sse.txt, thought/content.md */
    private auditWriter: ISseAuditWriter,
    private sseReconstruct: ISseReconstructor,
    private config: ProxyEnvironmentConfig,
    private createStepAssembler: () => IStepAssembler,
    private workflowRepo: IWorkflowRepository,
    private eventBus: IEventBus,
    private logger?: Logger,
  ) {}

  public execute(
    stream: NodeJS.ReadableStream,
    context: AuditInteractionContext,
    responseHeaders: Record<string, string | string[] | undefined>,
  ): void {
    const workflow = this.workflowRepo.getWorkflowBySessionId(context.auditSessionId);
    if (!workflow) return;

    const coalescedAgentContinuation = context.coalescedAgentContinuation;
    const stepNumber = coalescedAgentContinuation?.targetStepIndex ?? context.assignedStepIndex;
    const isCoalescedAgentContinuation = coalescedAgentContinuation !== undefined;
    // @deprecated-p2 Rutas legacy para escrituras SSE inline
    const stepDir = path.join(
      context.auditInteractionDir,
      'steps',
      String(stepNumber).padStart(PAD_STEP, '0'),
    );
    const responseDir = path.join(stepDir, 'response');
    const sseJsonlPath = path.join(responseDir, 'sse.jsonl');
    const sseRawPath = isCoalescedAgentContinuation ? null : path.join(responseDir, 'sse.txt');
    const currentPhase: SsePhase = isCoalescedAgentContinuation ? 'continuation' : 'delegation';
    const assembler = this.createStepAssembler();

    // @deprecated-p2
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
    const agentBlockTracker = new Map<number, { toolUseId: string; jsonAcc: string }>();
    // Tool uses que necesitan registro pending (agent, web_search, web_fetch)
    const pendingToolUseKinds = new Map<string, 'agent' | 'web_search' | 'web_fetch'>();

    stream.on('error', (err) => {
      streamError = true;
      console.error('Error en stream SSE:', err);
    });

    stream.on('data', (chunk: Buffer) => {
      // @deprecated-p2 Captura SSE cruda
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

      lineBuffer += decoder.write(chunk);
      let idx;
      while ((idx = lineBuffer.indexOf('\n')) >= 0) {
        const line = lineBuffer.slice(0, idx);
        lineBuffer = lineBuffer.slice(idx + 1);
        const trimmed = line.replace(/\r$/, '').trim();

        if (trimmed !== '') {
          sseLineIndex++;
          // @deprecated-p2
          this.auditWriter.appendSseLine(sseJsonlPath, {
            i: sseLineIndex,
            ts: new Date().toISOString(),
            line: trimmed,
            phase: isCoalescedAgentContinuation ? currentPhase : 'delegation',
          });

          if (trimmed.startsWith('data: ')) {
            try {
              const evt = JSON.parse(trimmed.slice(6));
              assembler.onEvent(evt);
              if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
                const toolUseId = evt.content_block.id;
                if (typeof toolUseId === 'string') {
                  const toolName =
                    typeof evt.content_block.name === 'string'
                      ? evt.content_block.name.toLowerCase()
                      : '';

                  if (toolName === 'agent' && typeof evt.index === 'number') {
                    pendingToolUseKinds.set(toolUseId, 'agent');
                    agentBlockTracker.set(evt.index, { toolUseId, jsonAcc: '' });
                  }

                  if (toolName === 'websearch' || toolName === 'web_search') {
                    pendingToolUseKinds.set(toolUseId, 'web_search');
                  }

                  if (toolName === 'webfetch' || toolName === 'web_fetch') {
                    pendingToolUseKinds.set(toolUseId, 'web_fetch');
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
                agentBlockTracker.delete(evt.index);
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
          // @deprecated-p2
          this.auditWriter.appendSseLine(sseJsonlPath, {
            i: sseLineIndex,
            ts: new Date().toISOString(),
            line: finalTrimmed,
          });
        }

        const assembled = assembler.result();
        const wireStep = this.registerWireInference(workflow, assembled);

        if (wireStep) {
          // Registrar tool uses pendientes en el correlador
          for (const block of assembled.toolUseBlocks) {
            if (pendingToolUseKinds.has(block.id)) {
              const toolUse: IToolUse = {
                id: block.id,
                stepId: wireStep.id,
                name: block.name,
                arguments: block.input,
                status: 'running',
                toolUseBlock: { type: 'tool_use', id: block.id, name: block.name, input: block.input },
              };
              this.workflowRepo.registerPendingToolUse(workflow.id, wireStep.id, toolUse);
            }
          }

          // Emitir step_response para que SessionPersistence lo persista
          this.eventBus.publish({
            type: 'step_response',
            sessionId: workflow.sessionId,
            workflowId: workflow.id,
            timestamp: new Date().toISOString(),
            payload: {
              workflowId: workflow.id,
              stepIndex: wireStep.index,
              response: assembled.assistantMessage,
            },
          });
        }

        const thinkingBlocks = assembled.thinkingTexts;
        const stopReason = assembled.stopReason ?? null;

        // @deprecated-p2
        if (thinkingBlocks.length > 0) {
          this.auditWriter.writeStepThought(stepDir, thinkingBlocks).catch((e) => {
            console.error('Error al escribir thought del step:', e);
          });
        }

        if (context.interactionType === 'client-preflight') {
          // Preflight: no hay workflow activo (guard ya filtró arriba), nada más que hacer
          return;
        }

        if (isCoalescedAgentContinuation) {
          await this.handleCoalescedEnd({
            context,
            workflow,
            assembled,
            stepNumber,
            sseJsonlPath,
            stepDir,
            responseHeaders,
            sseRawBytesWritten,
            sseRawTruncated,
            streamError,
            sseErrorMessage,
            sseErrorType,
          });
          return;
        }

        // Agentic: reconstruir markdown del step
        // @deprecated-p2
        try {
          const stepMessage = await this.sseReconstruct.reconstructStepMessage(stepDir);
          await this.auditWriter.writeStepResponseMarkdown(stepDir, stepMessage as unknown as JsonValue, {
            stepIndex: stepNumber,
            stepCount: workflow.steps.length,
            modelId: workflow.languageModelId,
            thoughtContentPath: thinkingBlocks.length > 0 ? 'thought/content.md' : undefined,
          });
        } catch (reconstructErr) {
          console.error('Error reconstruyendo mensaje del step:', reconstructErr);
        }

        if (stopReason === 'tool_use' || context.isInternalToolStep) {
          // No terminal — la interacción continúa
          return;
        }

        // Terminal: reconstruir body SSE completo
        // @deprecated-p2
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
              stepCount: workflow.steps.length,
              modelId: workflow.languageModelId,
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

        if (sseReconstructResult?.sseResponseBodyWritten === true) {
          // @deprecated-p2
          this.auditWriter
            .writeTopLevelResponseHeaders(context.auditInteractionDir, responseHeaders)
            .catch((e) => console.error('Error al escribir cabeceras top-level:', e));
        }
      } catch (err) {
        console.error('Error al procesar fin de stream SSE:', err);
      }
    });
  }

  private registerWireInference(
    workflow: IWorkflow,
    assembled: AssembledInference,
  ) {
    const inferenceRequest = buildInferenceRequestSnapshot(workflow, assembled);
    const now = new Date();
    const wireStep = buildWireStep({
      workflow,
      inferenceRequest,
      assistantMessage: assembled.assistantMessage,
      usage: assembled.usage,
      stopReason: assembled.stopReason,
      startedAt: now,
      closedAt: now,
    });
    registerWireStepInCorrelator(this.workflowRepo, wireStep, assembled.stopReason);
    return wireStep;
  }

  // @deprecated-p2 Manejo de coalesced agent SSE (multi-fase)
  private async handleCoalescedEnd(params: {
    context: AuditInteractionContext;
    workflow: IWorkflow;
    assembled: AssembledInference;
    stepNumber: number;
    sseJsonlPath: string;
    stepDir: string;
    responseHeaders: Record<string, string | string[] | undefined>;
    sseRawBytesWritten: number;
    sseRawTruncated: boolean;
    streamError: boolean;
    sseErrorMessage: string | null;
    sseErrorType: string | null;
  }): Promise<void> {
    const {
      context, workflow, assembled, stepNumber,
      sseJsonlPath, stepDir, responseHeaders,
      sseRawBytesWritten, sseRawTruncated, streamError,
    } = params;
    const coalescedAgentContinuation = context.coalescedAgentContinuation!;
    const stopReason = assembled.stopReason ?? null;

    let sseReconstructResult: SseReconstructResult | undefined;
    try {
      const initialMessage = await this.sseReconstruct.reconstructSseJsonlPhaseMessage(
        sseJsonlPath,
        'delegation',
      );
      const finalMessage = await this.sseReconstruct.reconstructSseJsonlPhaseMessage(
        sseJsonlPath,
        'continuation',
      );
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
          stepCount: workflow.steps.length,
          modelId: workflow.languageModelId,
        },
      });
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
          stepCount: workflow.steps.length,
          modelId: workflow.languageModelId,
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

    const outcome =
      stopReason === 'max_tokens' ? 'truncated' : streamError ? 'upstream-error' : 'completed';
    this.logger?.info({ sessionId: context.auditSessionId, outcome }, 'coalesced SSE interaction finalizada');
  }
}
