import {
  ActiveInteraction,
  PendingAgentToolUse,
  PendingBuiltinToolUse,
  StepMeta,
} from '../../1-domain/types/audit.types.js';

/**
 * Port que define el contrato público de almacenamiento de sesiones.
 * Consumido por los handlers de Capa 3.
 */
export interface ISessionStore {
  getBaseDir(): string;
  ensureAuditSessionsRoot(): Promise<void>;
  nextAuditInteractionSequence(sessionId: string): Promise<number>;
  registerInteraction(interaction: ActiveInteraction): void;
  registerToolUseId(toolUseId: string, interactionDir: string): void;
  getInteractionByToolUseId(toolUseId: string): ActiveInteraction | null;
  getInteractionByDir(dir: string): Promise<ActiveInteraction | null>;
  getInteractionByDirSync(dir: string): ActiveInteraction | null;
  incrementStepCountByDir(dir: string): number;
  pushStepMetaByDir(dir: string, meta: StepMeta): Promise<void>;
  closeInteraction(dir: string): void;
  /**
   * Registra un tool_use `Agent` emitido por el SSE de la interacción padre cuyo
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
   * Busca en la sesión la primera interacción elegible como padre de subagentes:
   * `agentic`, sin `parentContext` (refuerza profundidad ≤ 2) y con
   * `pendingAgentToolUses` no vacío. Devuelve copia del array de pendings
   * para que el caller decida ambigüedad sin mutar la interacción por accidente.
   */
  findInteractionWithPendingAgents(
    sessionId: string,
  ): { interaction: ActiveInteraction; pendings: PendingAgentToolUse[] } | null;
  /**
   * Consume (elimina) la entrada de `pendingAgentToolUses` cuyo `toolUseId`
   * coincide en la interacción registrada. Idempotente: no-op si la interacción o la
   * entrada no existen.
   */
  consumePendingAgentToolUse(interactionDir: string, toolUseId: string): void;
  /**
   * Registra un tool_use de built-in tool (web_search, web_fetch, text_editor)
   * emitido por el SSE de la interacción cuya ejecución aún no ha llegado.
   * Idempotente: si la entrada ya existe, no hace nada.
   */
  registerPendingBuiltinToolUse(
    interactionDir: string,
    stepIndex: number,
    toolUseId: string,
    toolType: 'web_search' | 'web_fetch' | 'text_editor',
  ): void;
  /**
   * Busca en la sesión la primera interacción con `pendingBuiltinToolUses` no vacío.
   * A diferencia de `findInteractionWithPendingAgents`, este método SÍ considera
   * interacciones con `parentContext` (subagentes pueden ser padres de builtin tools).
   * Devuelve copia del array de pendings.
   */
  findInteractionWithPendingBuiltinTools(
    sessionId: string,
  ): { interaction: ActiveInteraction; pendings: PendingBuiltinToolUse[] } | null;
  /**
   * Consume (elimina) la entrada de `pendingBuiltinToolUses` cuyo `toolUseId`
   * coincide en la interacción registrada. Idempotente.
   */
  consumePendingBuiltinToolUse(interactionDir: string, toolUseId: string): void;
  /**
   * Busca en la sesión interacciones con `awaitingContinuation === true` cuyo
   * `awaitingSince` supera `maxAgeMs` milisegundos. Devuelve las interacciones
   * stale para que el caller las cierre como orphans.
   */
  findStaleInteractionsAwaitingContinuation(sessionId: string, maxAgeMs: number): ActiveInteraction[];
  /**
   * Devuelve todas las interacciones actualmente abiertas en el registry.
   * Usado para graceful shutdown.
   */
  getAllOpenInteractions(): ActiveInteraction[];
  /**
   * Registra una respuesta de WebFetch en el caché de Context Sync.
   * Key: ${htmlHash}:${promptHash}, TTL: 5 minutos.
   */
  registerContextSyncCache(htmlHash: string, promptHash: string, response: string): void;
  /**
   * Busca una respuesta cacheada de Context Sync por hashes.
   * Retorna null si no existe o si expiró.
   */
  resolveContextSyncCache(htmlHash: string, promptHash: string): string | null;
  /**
   * Ejecuta `fn` serializado por sesión. Garantiza que dos llamadas
   * concurrentes con el mismo `sessionId` se ejecuten en orden, lo cual
   * permite serializar la asignación de secuencia local de subagentes
   * paralelos sin colisiones de directorio.
   */
  withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T>;
}
