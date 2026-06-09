import { StringDecoder } from 'node:string_decoder';
import type { IWorkflowRepository } from '../1-domain/repositories/IWorkflowRepository.js';
import type { IEventBus } from '../1-domain/repositories/IEventBus.js';
import type {
  AssembledInference,
  IStepAssembler,
} from '../2-services/ports/step-assembler.port.js';
import { SessionMetricsService } from '../2-services/session-metrics.service.js';
import { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';
import { AuditWorkflowContext, SsePhase } from '../1-domain/types/audit.types.js';
import type { IWorkflow } from '../1-domain/interfaces/gateway/IWorkflow.js';
import type { IToolUse } from '../1-domain/interfaces/gateway/IToolUse.js';
import type { Logger } from '../1-domain/types/logger.types.js';
import {
  buildInferenceRequestSnapshot,
  buildWireStep,
  enrichOpenWireStepWithResponse,
  enrichWireStepWithResponseByIndex,
  registerWireStepInCorrelator,
} from './gateway-wire-step.util.js';
import { persistBillableStepMetricsIfNeeded } from './persist-billable-step-metrics.util.js';
import { resolveSessionDir } from './audit-workflow-closure.handler.js';

/** Fase de un chunk SSE según el rol en el step coalesced. */
type ChunkPhase = SsePhase;

/**
 * Handler para orquestar la auditoría de respuestas SSE.
 * Emite eventos `stream_chunk` al bus por cada línea SSE y `step_response` al
 * finalizar el stream. La persistencia física la realiza `SessionPersistence`.
 */
export class AuditSseResponseHandler {
  constructor(
    private config: ProxyEnvironmentConfig,
    private createStepAssembler: () => IStepAssembler,
    private workflowRepo: IWorkflowRepository,
    private eventBus: IEventBus,
    private auditBaseDir: string,
    private sessionMetrics: SessionMetricsService,
    private logger?: Logger,
  ) {}

  public execute(
    stream: NodeJS.ReadableStream,
    context: AuditWorkflowContext,
    _responseHeaders: Record<string, string | string[] | undefined>,
  ): void {
    const workflow = this.workflowRepo.getWorkflow(context.workflowId);
    if (!workflow) return;

    const isCoalescedAgentContinuation = context.coalescedAgentContinuation !== undefined;
    // Índice fijado en ingress para esta request HTTP (estable bajo hops concurrentes)
    const projectedStepIndex = context.assignedStepIndex;
    const chunkPhase: ChunkPhase = isCoalescedAgentContinuation ? 'continuation' : 'delegation';
    const assembler = this.createStepAssembler();

    const decoder = new StringDecoder('utf8');
    let lineBuffer = '';
    let sseLineIndex = 0;
    let streamError = false;
    const agentBlockTracker = new Map<number, { toolUseId: string; jsonAcc: string }>();
    const pendingToolUseKinds = new Map<string, 'agent' | 'web_search' | 'web_fetch'>();

    stream.on('error', (err) => {
      this.workflowRepo.clearToolUseIndexFor(workflow.id);
      streamError = true;
      console.error('Error en stream SSE:', err);
    });

    stream.on('data', (chunk: Buffer) => {
      lineBuffer += decoder.write(chunk);
      let idx;
      while ((idx = lineBuffer.indexOf('\n')) >= 0) {
        const line = lineBuffer.slice(0, idx);
        lineBuffer = lineBuffer.slice(idx + 1);
        const trimmed = line.replace(/\r$/, '').trim();

        if (trimmed !== '') {
          sseLineIndex++;
          const ts = new Date().toISOString();
          this.eventBus.publish({
            type: 'stream_chunk',
            sessionId: workflow.sessionId,
            workflowId: workflow.id,
            timestamp: ts,
            payload: {
              seq: sseLineIndex,
              stepIndex: projectedStepIndex,
              workflowId: workflow.id,
              chunk: { i: sseLineIndex, ts, line: trimmed, phase: chunkPhase },
            },
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
          const ts = new Date().toISOString();
          this.eventBus.publish({
            type: 'stream_chunk',
            sessionId: workflow.sessionId,
            workflowId: workflow.id,
            timestamp: ts,
            payload: {
              seq: sseLineIndex,
              stepIndex: projectedStepIndex,
              workflowId: workflow.id,
              chunk: { i: sseLineIndex, ts, line: finalTrimmed, phase: chunkPhase },
            },
          });
        }

        const assembled = assembler.result();
        const wireStep = this.registerWireInference(workflow, assembled, context.assignedStepIndex);

        if (wireStep) {
          for (const block of assembled.toolUseBlocks) {
            const toolUse: IToolUse = {
              id: block.id,
              stepId: wireStep.id,
              name: block.name,
              arguments: block.input,
              status: 'running',
              toolUseBlock: {
                type: 'tool_use',
                id: block.id,
                name: block.name,
                input: block.input,
              },
            };
            if (pendingToolUseKinds.has(block.id)) {
              this.workflowRepo.registerPendingToolUse(workflow.id, wireStep.id, toolUse);
            } else {
              // Tool client-side (Read/Edit/Bash/…): registrar para emitir `tool_call`,
              // poblar `step.toolUses` (que habilita `completeToolUse` del hook PostToolUse)
              // e indexar el linkage para que la continuation con su `tool_result`
              // encuentre el workflow padre (sin orphan ni warning).
              this.workflowRepo.registerToolUse(workflow.id, toolUse);
            }
          }

          this.eventBus.publish({
            type: 'step_response',
            sessionId: workflow.sessionId,
            workflowId: workflow.id,
            timestamp: new Date().toISOString(),
            payload: {
              workflowId: workflow.id,
              stepIndex: wireStep.index,
              response: assembled.assistantMessage,
              ...(isCoalescedAgentContinuation
                ? { coalescedDelegationStepIndex: wireStep.index - 1 }
                : {}),
            },
          });
        }

        if (isCoalescedAgentContinuation) {
          const stopReason = assembled.stopReason ?? null;
          const outcome =
            stopReason === 'max_tokens'
              ? 'truncated'
              : streamError
                ? 'upstream-error'
                : 'completed';
          this.logger?.info(
            { sessionId: context.auditSessionId, outcome },
            'coalesced SSE interaction finalizada',
          );
        }
      } catch (err) {
        console.error('Error al procesar fin de stream SSE:', err);
      }
    });
  }

  private registerWireInference(
    workflow: IWorkflow,
    assembled: AssembledInference,
    assignedStepIndex: number,
  ) {
    const inferenceRequest = buildInferenceRequestSnapshot(workflow, { assembled });
    const now = new Date();
    const responsePatch = {
      assistantMessage: assembled.assistantMessage,
      usage: assembled.usage,
      stopReason: assembled.stopReason,
      closedAt: now,
    };
    const wireStep =
      enrichWireStepWithResponseByIndex(
        this.workflowRepo,
        workflow.id,
        assignedStepIndex,
        responsePatch,
        assembled.stopReason,
      ) ??
      enrichOpenWireStepWithResponse(
        this.workflowRepo,
        workflow.id,
        responsePatch,
        assembled.stopReason,
      ) ??
      (() => {
        const fallback = buildWireStep({
          workflow,
          inferenceRequest,
          assistantMessage: assembled.assistantMessage,
          usage: assembled.usage,
          stopReason: assembled.stopReason,
          startedAt: now,
          closedAt: now,
        });
        return registerWireStepInCorrelator(
          this.workflowRepo,
          fallback,
          assembled.stopReason,
        );
      })();
    if (wireStep) {
      void persistBillableStepMetricsIfNeeded(
        this.sessionMetrics,
        this.auditBaseDir,
        workflow,
        wireStep,
        assembled.stopReason,
      );
    }
    const workflowAfterClose = this.workflowRepo.getWorkflow(workflow.id);
    if (workflowAfterClose?.result != null) {
      const sessionDir = resolveSessionDir(this.auditBaseDir, workflow.sessionId);
      const closedSteps = workflowAfterClose.steps.filter((s) => s.closedAt != null);
      void this.sessionMetrics.finalizeWorkflowMetrics(
        sessionDir,
        workflow.id,
        closedSteps,
      );
    }
    return wireStep;
  }
}
