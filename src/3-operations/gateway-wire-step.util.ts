import { randomUUID } from 'node:crypto';
import type { IWorkflowRepository } from '../1-domain/repositories/IWorkflowRepository.js';
import type { IStep } from '../1-domain/interfaces/gateway/IStep.js';
import type { ActiveInteraction } from '../1-domain/types/audit.types.js';
import type { AnthropicMessage, AnthropicRequest, AnthropicUsage } from '../1-domain/types/anthropic.types.js';
import type { AssembledInference } from '../2-services/ports/step-assembler.port.js';

export interface BuildWireStepParams {
  interaction: ActiveInteraction;
  inferenceRequest: AnthropicRequest;
  assistantMessage: AnthropicMessage;
  usage: AnthropicUsage;
  stopReason?: string;
  startedAt: Date;
  closedAt: Date;
}

/** Resuelve el workflowId para correlación wire (main o subagente). */
export function resolveWorkflowIdForInteraction(interaction: ActiveInteraction): string {
  return interaction.parentContext?.wireAgentId ?? interaction.sessionId;
}

/** Snapshot mínimo del request para el correlador (modelo desde ensamblaje o turno). */
export function buildInferenceRequestSnapshot(
  interaction: ActiveInteraction,
  assembled?: Pick<AssembledInference, 'model'>,
): AnthropicRequest {
  const model = assembled?.model ?? interaction.modelId ?? 'unknown';
  return {
    model,
    messages: [],
    max_tokens: 8192,
  };
}

/** Construye un `IStep` desde el resultado de inferencia wire. */
export function buildWireStep(params: BuildWireStepParams): IStep {
  const workflowId = resolveWorkflowIdForInteraction(params.interaction);
  return {
    id: randomUUID(),
    workflowId,
    index: 0,
    inferenceRequest: params.inferenceRequest,
    assistantMessage: params.assistantMessage,
    toolUses: [],
    usage: params.usage,
    stopReason: params.stopReason,
    startedAt: params.startedAt,
    closedAt: params.closedAt,
  };
}

/**
 * Registra el step en el correlador; cierra si el stopReason es terminal.
 * No-op si el workflow no existe.
 */
export function registerWireStepInCorrelator(
  repo: IWorkflowRepository,
  step: IStep,
  stopReason: string | undefined,
): void {
  const workflow = repo.getWorkflow(step.workflowId);
  if (!workflow) return;

  step.index = workflow.steps.length;
  repo.registerStep(step.workflowId, step);

  if (stopReason === 'tool_use') {
    return;
  }

  const isTerminal =
    stopReason === 'end_turn' ||
    stopReason === 'max_tokens' ||
    stopReason == null ||
    stopReason === '';

  if (isTerminal) {
    repo.closeStep(step.workflowId, step.id);
  }
}

/** Indica si el cierre de meta.json debe ir por hooks (workflow abierto en correlador). */
export function shouldDeferMetaCloseToHooks(
  repo: IWorkflowRepository,
  workflowId: string,
): boolean {
  const wf = repo.getWorkflow(workflowId);
  return wf != null && wf.result == null;
}
