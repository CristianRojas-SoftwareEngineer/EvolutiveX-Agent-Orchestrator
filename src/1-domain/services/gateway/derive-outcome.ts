import type { ClaudeHookEvent } from '../../types/hook.types.js';
import type { WorkflowOutcome } from '../../types/gateway/workflow.types.js';

/**
 * Deriva el WorkflowOutcome a partir del eventName del hook de cierre.
 * `Stop | SubagentStop → 'success'`; `StopFailure → 'api_error'`; resto → `'unknown'`.
 * La rama `'aborted'` (PostToolBatch con decision:block) se difiere a fase posterior
 * porque no tiene campo en ClaudeHookEvent v1.
 */
export function deriveOutcome(hook: ClaudeHookEvent): WorkflowOutcome {
  switch (hook.eventName) {
    case 'Stop':
    case 'SubagentStop':
      return 'success';
    case 'StopFailure':
      return 'api_error';
    default:
      return 'unknown';
  }
}
