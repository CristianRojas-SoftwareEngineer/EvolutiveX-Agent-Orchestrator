import { randomUUID } from 'node:crypto';
import type { IWorkflowRepository } from '../1-domain/repositories/IWorkflowRepository.js';
import type { IStep } from '../1-domain/interfaces/gateway/IStep.js';
import type { IWorkflow } from '../1-domain/interfaces/gateway/IWorkflow.js';
import type {
  AnthropicMessage,
  AnthropicRequest,
  AnthropicUsage,
} from '../1-domain/types/anthropic.types.js';
import type { AssembledInference } from '../2-services/ports/step-assembler.port.js';
import { aggregateWorkflowUsage } from '../1-domain/services/gateway/aggregate-workflow-usage.js';

export interface BuildWireStepParams {
  workflow: IWorkflow;
  inferenceRequest: AnthropicRequest;
  assistantMessage: AnthropicMessage;
  usage?: AnthropicUsage;
  stopReason?: string;
  startedAt: Date;
  closedAt: Date;
}

/** Resuelve el workflowId para correlación wire (main o subagente). */
export function resolveWorkflowIdForInteraction(workflow: IWorkflow): string {
  return workflow.id;
}

export interface BuildInferenceRequestSnapshotOptions {
  assembled?: Pick<AssembledInference, 'model'>;
  /** Step abierto en correlador (p. ej. por `assignedStepIndex` en ingress). */
  step?: IStep;
  /** Modelo extraído del body HTTP del hop actual. */
  requestModel?: string;
}

/** Snapshot mínimo del request para el correlador (D8: sin agregado en workflow). */
export function buildInferenceRequestSnapshot(
  _workflow: IWorkflow,
  options?: BuildInferenceRequestSnapshotOptions,
): AnthropicRequest {
  const model =
    options?.assembled?.model ??
    options?.step?.inferenceRequest.model ??
    options?.requestModel ??
    'unknown';
  return {
    model,
    messages: [],
    max_tokens: 8192,
  };
}

/** Construye un `IStep` desde el resultado de inferencia wire. */
export function buildWireStep(params: BuildWireStepParams): IStep {
  const workflowId = resolveWorkflowIdForInteraction(params.workflow);
  return {
    id: randomUUID(),
    workflowId,
    index: 1,
    inferenceRequest: params.inferenceRequest,
    assistantMessage: params.assistantMessage,
    toolUses: [],
    usage: params.usage,
    stopReason: params.stopReason,
    startedAt: params.startedAt,
    closedAt: params.closedAt,
  };
}

/** Datos de respuesta HTTP para enriquecer el step abierto en egress. */
export interface WireStepResponsePatch {
  assistantMessage: AnthropicMessage;
  usage?: AnthropicUsage;
  stopReason?: string;
  closedAt: Date;
}

/** Aplica patch de respuesta wire a un step ya abierto y ejecuta cierre según stopReason. */
function applyWireStepResponseToStep(
  repo: IWorkflowRepository,
  workflow: IWorkflow,
  openStep: IStep,
  patch: WireStepResponsePatch,
  stopReason: string | undefined,
): IStep {
  openStep.assistantMessage = patch.assistantMessage;
  openStep.usage = patch.usage;
  openStep.stopReason = patch.stopReason;

  if (stopReason === 'tool_use') {
    openStep.closedAt = patch.closedAt;
    repo.closeStep(workflow.id, openStep.id);
    repo.patchWireMeta(workflow.id, { awaitingContinuation: true, awaitingSince: Date.now() });
    return openStep;
  }

  const isTerminal =
    stopReason === 'end_turn' ||
    stopReason === 'max_tokens' ||
    stopReason == null ||
    stopReason === '';

  if (isTerminal) {
    openStep.closedAt = patch.closedAt;
    repo.closeStep(workflow.id, openStep.id);
    closeWireWorkflowOnTerminalStop(repo, workflow, stopReason, openStep);
  }

  return openStep;
}

/**
 * Enriquece el step abierto en el índice asignado en ingress (`assignedStepIndex`).
 * Evita cross-wiring cuando varios hops del mismo workflow están abiertos en paralelo.
 */
export function enrichWireStepWithResponseByIndex(
  repo: IWorkflowRepository,
  workflowId: string,
  stepIndex: number,
  patch: WireStepResponsePatch,
  stopReason: string | undefined,
): IStep | undefined {
  const workflow = repo.getWorkflow(workflowId);
  if (!workflow) return undefined;

  const openStep = workflow.steps.find((s) => s.index === stepIndex && s.closedAt == null);
  if (!openStep) return undefined;

  return applyWireStepResponseToStep(repo, workflow, openStep, patch, stopReason);
}

/**
 * Enriquece el último step abierto del workflow con la respuesta HTTP.
 * Alineado a session-audit-model: un hop → un `steps/MM/` con request/ y response/.
 * Fallback cuando no hay step en el índice asignado (edge case sin ingress previo).
 */
export function enrichOpenWireStepWithResponse(
  repo: IWorkflowRepository,
  workflowId: string,
  patch: WireStepResponsePatch,
  stopReason: string | undefined,
): IStep | undefined {
  const workflow = repo.getWorkflow(workflowId);
  if (!workflow) return undefined;

  const openStep = [...workflow.steps].reverse().find((s) => s.closedAt == null);
  if (!openStep) return undefined;

  return applyWireStepResponseToStep(repo, workflow, openStep, patch, stopReason);
}

/**
 * Registra la respuesta wire en el correlador enriqueciendo el step abierto por ingress.
 * Fallback: registra un step nuevo si no hay step abierto (edge case).
 */
export function registerWireStepInCorrelator(
  repo: IWorkflowRepository,
  step: IStep,
  stopReason: string | undefined,
): IStep | undefined {
  const workflow = repo.getWorkflow(step.workflowId);
  if (!workflow) return undefined;

  const enriched = enrichOpenWireStepWithResponse(
    repo,
    step.workflowId,
    {
      assistantMessage: step.assistantMessage,
      usage: step.usage,
      stopReason: step.stopReason,
      closedAt: step.closedAt ?? new Date(),
    },
    stopReason,
  );
  if (enriched) return enriched;

  step.index = workflow.steps.length + 1;
  repo.registerStep(step.workflowId, step);

  if (stopReason === 'tool_use') {
    step.closedAt = step.closedAt ?? new Date();
    repo.closeStep(step.workflowId, step.id);
    repo.patchWireMeta(step.workflowId, { awaitingContinuation: true, awaitingSince: Date.now() });
    return step;
  }

  const isTerminal =
    stopReason === 'end_turn' ||
    stopReason === 'max_tokens' ||
    stopReason == null ||
    stopReason === '';

  if (isTerminal) {
    step.closedAt = step.closedAt ?? new Date();
    repo.closeStep(step.workflowId, step.id);
    closeWireWorkflowOnTerminalStop(repo, workflow, stopReason, step);
  }

  return step;
}

/** Índice del step abierto para proyección SSE (request ya registrado en ingress). */
export function resolveOpenWireStepIndex(workflow: IWorkflow): number {
  const openStep = [...workflow.steps].reverse().find((s) => s.closedAt == null);
  return openStep?.index ?? workflow.steps.length + 1;
}

/** Extrae texto plano de bloques `text` del mensaje assistant ensamblado. */
function extractTextFromAssistantMessage(message: AnthropicMessage): string | undefined {
  if (!Array.isArray(message.content)) return undefined;
  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
      parts.push(block.text);
    }
  }
  return parts.length > 0 ? parts.join('') : undefined;
}

/**
 * Tras stop terminal en SSE: el step ya cerró. La autoridad de cierre la declara
 * `workflow.closeAuthority` (fijada en la creación), no el esquema de `id`:
 * - `'stop-hook'` (turnos E2E —primero y `-turn-N`— y subagentes): no hacen forceClose
 *   aquí; cierran vía hook Stop / SubagentStop / StopFailure.
 * - `'sse'` (workflows wire huérfanos de continuation): cierran aquí vía forceClose,
 *   siempre con el step ya cerrado por `closeStep` (nunca un cierre de 0 steps).
 */
function closeWireWorkflowOnTerminalStop(
  repo: IWorkflowRepository,
  workflow: IWorkflow,
  stopReason: string | undefined,
  step: IStep,
): void {
  if (workflow.closeAuthority !== 'sse') return;
  if (workflow.result != null) return;
  // I1: el stop_reason de un side-request nunca decide el destino del workflow padre.
  if (step.stepKind === 'side-request') return;

  const closedSteps = workflow.steps.filter((s) => s.closedAt != null);
  const finalText = extractTextFromAssistantMessage(step.assistantMessage);
  repo.forceClose(workflow.id, 'success', {
    stepCount: closedSteps.length,
    ...(finalText ? { finalText } : {}),
    usage: aggregateWorkflowUsage(closedSteps, []),
    closedByStopReason: stopReason,
  });
}

/** Indica si el cierre de meta.json debe ir por hooks (workflow abierto en correlador). */
export function shouldDeferMetaCloseToHooks(
  repo: IWorkflowRepository,
  workflowId: string,
): boolean {
  const wf = repo.getWorkflow(workflowId);
  return wf != null && wf.result == null;
}
