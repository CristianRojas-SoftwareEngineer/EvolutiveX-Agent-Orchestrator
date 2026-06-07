import type { IWorkflow } from '../../interfaces/gateway/IWorkflow.js';

/**
 * Invariante G5: un sub-workflow requiere `parentWorkflowId` y `parentToolUseId`.
 * Devuelve `true` si el workflow satisface el invariante; `false` si lo viola.
 */
export function isValidSubWorkflow(
  workflow: Pick<IWorkflow, 'kind' | 'parentWorkflowId' | 'parentToolUseId'>,
): boolean {
  if (workflow.kind !== 'subagent') return true;
  return (
    workflow.parentWorkflowId != null &&
    workflow.parentWorkflowId !== '' &&
    workflow.parentToolUseId != null &&
    workflow.parentToolUseId !== ''
  );
}

/**
 * Lanza un `Error` si el workflow viola el invariante G5.
 */
export function assertValidSubWorkflow(
  workflow: Pick<IWorkflow, 'kind' | 'parentWorkflowId' | 'parentToolUseId'>,
): void {
  if (!isValidSubWorkflow(workflow)) {
    throw new Error(
      `Invariante G5 violado: sub-workflow requiere parentWorkflowId y parentToolUseId no nulos.`,
    );
  }
}
