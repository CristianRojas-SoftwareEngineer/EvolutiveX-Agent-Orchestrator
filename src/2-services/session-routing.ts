/**
 * Funciones puras de mapeo de eventos a rutas del layout `causal-workflows-v1`.
 * Reemplazan las constantes flat de `audit-paths.ts`.
 *
 * Las rutas se construyen con separador `/` (no `path.join`) para producir
 * salidas deterministas e independientes de la plataforma; `fs` en Windows
 * acepta `/` sin problema.
 */

const SESSIONS_ROOT = 'sessions';
const PAD = 2;

/** Índice con zero-padding a 2 dígitos (sin padding adicional para >= 100). */
function pad(n: number): string {
  return String(n).padStart(PAD, '0');
}

/**
 * Normaliza el nombre de un tool para el slug del directorio:
 * reemplaza secuencias no alfanuméricas por un guion, recorta guiones de los
 * extremos y trunca a 32 caracteres. Preserva el case original (p. ej. `Read`).
 */
export function slugifyToolName(toolName: string): string {
  return toolName
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

/** `sessions/<sessionId>/workflows/<NN>/` — `workflowIndex` base 1 (primer turno → `01`). */
export function getWorkflowDir(sessionId: string, workflowIndex: number): string {
  return `${SESSIONS_ROOT}/${sessionId}/workflows/${pad(workflowIndex)}/`;
}

/** `sessions/<sessionId>/workflows/<NN>/steps/<MM>/` — índices base 1. */
export function getStepDir(sessionId: string, workflowIndex: number, stepIndex: number): string {
  return `${getWorkflowDir(sessionId, workflowIndex)}steps/${pad(stepIndex)}/`;
}

/** `sessions/<sessionId>/workflows/<NN>/steps/<MM>/tools/`. */
export function getToolsDir(sessionId: string, workflowIndex: number, stepIndex: number): string {
  return `${getStepDir(sessionId, workflowIndex, stepIndex)}tools/`;
}

/** `sessions/<sessionId>/workflows/<NN>/steps/<MM>/tools/<KK-slug>/` — índices base 1. */
export function getToolDir(
  sessionId: string,
  workflowIndex: number,
  stepIndex: number,
  toolIndex: number,
  toolName: string,
): string {
  const slug = slugifyToolName(toolName);
  return `${getToolsDir(sessionId, workflowIndex, stepIndex)}${pad(toolIndex)}-${slug}/`;
}
