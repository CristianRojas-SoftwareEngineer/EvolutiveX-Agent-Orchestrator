import {
  ActiveInteraction,
  PendingAgentToolUse,
  PendingWebFetchToolUse,
  PendingWebSearchToolUse,
  ResolvedInternalTool,
  StepMeta,
} from '../../1-domain/types/audit.types.js';

/**
 * Port que define el contrato público de almacenamiento de sesiones.
 * Consumido por los handlers de Capa 3.
 */
export interface ISessionStore {
  getBaseDir(): string;
  ensureAuditSessionsRoot(): Promise<void>;
  nextMainAgentSequence(sessionId: string): Promise<number>;
  nextSideInteractionSequence(sessionId: string): Promise<number>;
  registerInteraction(interaction: ActiveInteraction): void;
  registerToolUseId(toolUseId: string, interactionDir: string): void;
  getInteractionByToolUseId(toolUseId: string): ActiveInteraction | null;
  getInteractionByDir(dir: string): Promise<ActiveInteraction | null>;
  getInteractionByDirSync(dir: string): ActiveInteraction | null;
  incrementStepCountByDir(dir: string): number;
  /**
   * Agrega metadata de step a la interacción. Append estricto para steps normales;
   * no permite duplicados no-coalesced con el mismo stepIndex. Para steps coalesced,
   * si meta.coalescedAgentContinuation está definido, enriquece el step existente
   * en lugar de crear uno nuevo.
   */
  pushStepMetaByDir(dir: string, meta: StepMeta): Promise<void>;
  closeInteraction(dir: string): void;
  /**
   * Registra un tool_use `Agent` emitido por el SSE de la interacción padre cuyo
   * `tool_result` aún no ha llegado. Si la entrada con el mismo `toolUseId`
   * ya existe, actualiza los campos provistos (`subagentType`, `description`, `prompt`)
   * cuando se aportan y deja el resto intacto (idempotente para dobles llamadas
   * desde el SSE handler).
   */
  registerPendingAgentToolUse(
    interactionDir: string,
    stepIndex: number,
    toolUseId: string,
    metadata?: {
      subagentType?: string;
      description?: string;
      prompt?: string;
    },
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
   * Registra un tool_use `WebSearch` emitido por el SSE de la interacción padre
   * cuya llamada de implementación aún no ha llegado.
   */
  registerPendingWebSearchToolUse(
    interactionDir: string,
    stepIndex: number,
    toolUseId: string,
  ): void;
  /**
   * Busca en la sesión la primera interacción con `pendingWebSearchToolUses`
   * no vacío. A diferencia de `findInteractionWithPendingAgents`, NO excluye
   * interacciones con `parentContext` (un subagente también puede usar WebSearch).
   */
  findInteractionWithPendingWebSearch(
    sessionId: string,
  ): { interaction: ActiveInteraction; pendings: PendingWebSearchToolUse[] } | null;
  /**
   * Consume (elimina) la primera entrada de `pendingWebSearchToolUses` de la
   * interacción registrada. Devuelve el pending consumido o `null` si no había.
   */
  consumeWebSearchPending(interactionDir: string): PendingWebSearchToolUse | null;
  /**
   * Registra un tool_use `WebFetch` emitido por el SSE de la interacción padre
   * cuya llamada de implementación aún no ha llegado.
   */
  registerPendingWebFetchToolUse(
    interactionDir: string,
    stepIndex: number,
    toolUseId: string,
  ): void;
  /**
   * Busca en la sesión la primera interacción con `pendingWebFetchToolUses`
   * no vacío. A diferencia de `findInteractionWithPendingAgents`, NO excluye
   * interacciones con `parentContext` (un subagente también puede usar WebFetch).
   */
  findInteractionWithPendingWebFetch(
    sessionId: string,
  ): { interaction: ActiveInteraction; pendings: PendingWebFetchToolUse[] } | null;
  /**
   * Consume (elimina) la primera entrada de `pendingWebFetchToolUses` de la
   * interacción registrada. Devuelve el pending consumido o `null` si no había.
   */
  consumeWebFetchPending(interactionDir: string): PendingWebFetchToolUse | null;
  /**
   * Consume (elimina) la entrada de `pendingWebSearchToolUses` cuyo `toolUseId`
   * coincide en la interacción registrada. Devuelve el pending consumido o
   * `null` si no existía. Idempotente: no-op si no hay coincidencia.
   */
  consumeWebSearchPendingByToolUseId(
    interactionDir: string,
    toolUseId: string,
  ): PendingWebSearchToolUse | null;
  /**
   * Consume (elimina) la entrada de `pendingWebFetchToolUses` cuyo `toolUseId`
   * coincide en la interacción registrada. Devuelve el pending consumido o
   * `null` si no existía. Idempotente: no-op si no hay coincidencia.
   */
  consumeWebFetchPendingByToolUseId(
    interactionDir: string,
    toolUseId: string,
  ): PendingWebFetchToolUse | null;
  /**
   * Registra una resolución observada de WebSearch/WebFetch.
   */
  registerResolvedInternalTool(interactionDir: string, resolution: ResolvedInternalTool): void;
  /**
   * Busca en la sesión interacciones con `awaitingContinuation === true` cuyo
   * `awaitingSince` supera `maxAgeMs` milisegundos. Devuelve las interacciones
   * stale para que el caller las cierre como orphans.
   */
  findStaleInteractionsAwaitingContinuation(
    sessionId: string,
    maxAgeMs: number,
  ): ActiveInteraction[];
  /**
   * Devuelve todas las interacciones actualmente abiertas en el registry.
   * Usado para graceful shutdown.
   */
  getAllOpenInteractions(): ActiveInteraction[];
  /**
   * Ejecuta `fn` serializado por sesión. Garantiza que dos llamadas
   * concurrentes con el mismo `sessionId` se ejecuten en orden, lo cual
   * permite serializar la asignación de secuencia local de subagentes
   * paralelos sin colisiones de directorio.
   */
  withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T>;
}
