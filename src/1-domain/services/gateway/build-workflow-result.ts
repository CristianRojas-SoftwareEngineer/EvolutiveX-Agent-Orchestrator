import type { ClaudeHookEvent } from '../../types/hook.types.js';
import type { WorkflowClosedByEvent } from '../../types/gateway/workflow.types.js';
import type { IWorkflow } from '../../interfaces/gateway/IWorkflow.js';
import type { IStep } from '../../interfaces/gateway/IStep.js';
import type { IWorkflowResult } from '../../interfaces/gateway/IWorkflowResult.js';
import { aggregateWorkflowUsage } from './aggregate-workflow-usage.js';
import { deriveOutcome } from './derive-outcome.js';
import { deriveFinalText } from './derive-final-text.js';

const VALID_CLOSED_BY: ReadonlySet<string> = new Set(['Stop', 'SubagentStop', 'StopFailure']);

/**
 * Construye el IWorkflowResult al cierre del workflow.
 * Función pura invocada desde el handler de capa 3 en lugar de un método con efectos.
 * `totalCostUsd` queda `undefined` en G1 (cálculo de coste diferido a fase posterior).
 */
export function buildWorkflowResult(
  workflow: IWorkflow,
  closedSteps: IStep[],
  childResults: IWorkflowResult[],
  hook: ClaudeHookEvent,
): IWorkflowResult {
  const closedByEvent: WorkflowClosedByEvent = VALID_CLOSED_BY.has(hook.eventName)
    ? (hook.eventName as WorkflowClosedByEvent)
    : 'StopFailure'; // fallback conservador: evento desconocido se trata como fallo

  return {
    outcome: deriveOutcome(hook),
    finalText: deriveFinalText(hook),
    usage: aggregateWorkflowUsage(closedSteps, childResults),
    totalCostUsd: undefined,
    stepCount: closedSteps.length,
    closedByEvent,
    sessionId: hook.sessionId,
  };
}
