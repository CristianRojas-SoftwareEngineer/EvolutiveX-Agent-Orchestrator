import {
  ActiveTurn,
  PendingAgentToolUse,
  PendingBuiltinToolUse,
  StepMeta,
  WebFetchStepResolution,
} from '../../1-domain/types/audit.types.js';

/**
 * Port que define el contrato público de almacenamiento de sesiones.
 * Consumido por los handlers de Capa 3.
 */
export interface ISessionStore {
  getBaseDir(): string;
  ensureAuditSessionsRoot(): Promise<void>;
  nextAuditInteractionSequence(sessionId: string): Promise<number>;
  registerTurn(turn: ActiveTurn): void;
  registerToolUseId(toolUseId: string, interactionDir: string): void;
  getTurnByToolUseId(toolUseId: string): ActiveTurn | null;
  getTurnByDir(dir: string): Promise<ActiveTurn | null>;
  getTurnByDirSync(dir: string): ActiveTurn | null;
  incrementStepCountByDir(dir: string): number;
  pushStepMetaByDir(dir: string, meta: StepMeta): Promise<void>;
  closeTurn(dir: string): void;
  /**
   * Registra un tool_use `Agent` emitido por el SSE del turn padre cuyo
   * `tool_result` aún no ha llegado. Si la entrada con el mismo `toolUseId`
   * ya existe, actualiza `subagentType` cuando se aporta y deja el resto
   * intacto (idempotente para dobles llamadas desde el SSE handler).
   */
  registerPendingAgentToolUse(
    interactionDir: string,
    stepIndex: number,
    toolUseId: string,
    subagentType?: string,
  ): void;
  /**
   * Busca en la sesión el primer turn elegible como padre de subagentes:
   * `agentic-turn`, sin `parentContext` (refuerza profundidad ≤ 2) y con
   * `pendingAgentToolUses` no vacío. Devuelve copia del array de pendings
   * para que el caller decida ambigüedad sin mutar el turn por accidente.
   */
  findTurnWithPendingAgents(
    sessionId: string,
  ): { turn: ActiveTurn; pendings: PendingAgentToolUse[] } | null;
  /**
   * Consume (elimina) la entrada de `pendingAgentToolUses` cuyo `toolUseId`
   * coincide en el turn registrado. Idempotente: no-op si el turn o la
   * entrada no existen.
   */
  consumePendingAgentToolUse(interactionDir: string, toolUseId: string): void;
  /**
   * Registra un tool_use de built-in tool (web_search, web_fetch, text_editor)
   * emitido por el SSE del turn cuya ejecución aún no ha llegado.
   * Idempotente: si la entrada ya existe, no hace nada.
   */
  registerPendingBuiltinToolUse(
    interactionDir: string,
    stepIndex: number,
    toolUseId: string,
    toolType: 'web_search' | 'web_fetch' | 'text_editor',
  ): void;
  /**
   * Busca en la sesión el primer turn con `pendingBuiltinToolUses` no vacío.
   * A diferencia de `findTurnWithPendingAgents`, este método SÍ considera
   * turns con `parentContext` (subagentes pueden ser padres de builtin tools).
   * Devuelve copia del array de pendings.
   */
  findTurnWithPendingBuiltinTools(
    sessionId: string,
  ): { turn: ActiveTurn; pendings: PendingBuiltinToolUse[] } | null;
  /**
   * Consume (elimina) la entrada de `pendingBuiltinToolUses` cuyo `toolUseId`
   * coincide en el turn registrado. Idempotente.
   */
  consumePendingBuiltinToolUse(interactionDir: string, toolUseId: string): void;
  /**
   * Busca en la sesión turnos con `awaitingContinuation === true` cuyo
   * `awaitingSince` supera `maxAgeMs` milisegundos. Devuelve los turnos
   * stale para que el caller los cierre como orphans.
   */
  findStaleTurnsAwaitingContinuation(sessionId: string, maxAgeMs: number): ActiveTurn[];
  /**
   * Devuelve todos los turnos actualmente abiertos en el registry.
   * Usado para graceful shutdown.
   */
  getAllOpenTurns(): ActiveTurn[];
  /**
   * Registra correlación tool_use_id -> URL para built-in web_fetch.
   * Se consume luego al detectar el step del subagente que recibe el tool_result.
   */
  registerWebFetchToolUseUrl(toolUseId: string, sessionId: string, url: string): void;
  /**
   * Devuelve la correlación URL de un tool_use_id de web_fetch, si existe.
   */
  getWebFetchUrlByToolUseId(toolUseId: string): { sessionId: string; url: string } | null;
  /**
   * Registra la resolución (sessionId + url -> stepDir) del step que ya
   * procesó y resumió un WebFetch.
   */
  registerWebFetchStepResolution(entry: WebFetchStepResolution): void;
  /**
   * Busca una resolución de step para (sessionId, url).
   */
  resolveWebFetchStep(sessionId: string, url: string): WebFetchStepResolution | null;
  /**
   * Espera (event-driven) la resolución de step para (sessionId, url).
   */
  onceWebFetchStepResolved(
    sessionId: string,
    url: string,
    timeoutMs: number,
  ): Promise<WebFetchStepResolution | null>;
  /**
   * Ejecuta `fn` serializado por sesión. Garantiza que dos llamadas
   * concurrentes con el mismo `sessionId` se ejecuten en orden, lo cual
   * permite serializar la asignación de secuencia local de subagentes
   * paralelos sin colisiones de directorio.
   */
  withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T>;
}
