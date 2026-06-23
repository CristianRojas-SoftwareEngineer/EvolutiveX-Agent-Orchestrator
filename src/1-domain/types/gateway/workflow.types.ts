/** Clasificación del workflow: principal del usuario o subagente. */
export type WorkflowKind = 'main' | 'subagent';

/** Estado del ciclo de vida del workflow. */
export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'aborted';

/** Resultado global al cierre del workflow. */
export type WorkflowOutcome =
  | 'success'
  | 'api_error'
  | 'aborted'
  | 'unknown'
  | 'upstream-error'
  | 'orphaned';

/** Evento del hook de Claude Code que disparó el cierre del workflow. */
export type WorkflowClosedByEvent = 'Stop' | 'SubagentStop' | 'StopFailure';

/**
 * Autoridad que cierra el workflow E2E. Declarada explícitamente en la creación,
 * reemplaza la heurística basada en el esquema de `id` (`id === sessionId`).
 * - `'stop-hook'`: cierra por hook `Stop`/`SubagentStop`/`StopFailure` (turnos E2E y subagentes).
 * - `'sse'`: cierra por stop terminal SSE vía `forceClose` (workflows wire huérfanos de continuation).
 */
export type WorkflowCloseAuthority = 'stop-hook' | 'sse';
