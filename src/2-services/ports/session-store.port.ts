import { ActiveTurn, PendingAgentToolUse, StepMeta } from '../../1-domain/types/audit.types.js';

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
   * Ejecuta `fn` serializado por sesión. Garantiza que dos llamadas
   * concurrentes con el mismo `sessionId` se ejecuten en orden, lo cual
   * permite serializar la asignación de secuencia local de subagentes
   * paralelos sin colisiones de directorio.
   */
  withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T>;
}
