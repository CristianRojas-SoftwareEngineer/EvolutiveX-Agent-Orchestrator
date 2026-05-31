import type {
  AgentContext,
  InteractionType,
  ParentContext,
  SideRequestKind,
} from '../types/audit.types.js';
import type { JsonValue } from '../types/json.types.js';
import type { ClaudeHookEvent } from '../types/hook.types.js';
import type { IWorkflow } from '../interfaces/gateway/IWorkflow.js';
import type { IStep } from '../interfaces/gateway/IStep.js';
import type { IToolUse } from '../interfaces/gateway/IToolUse.js';
import type { IWorkflowResult } from '../interfaces/gateway/IWorkflowResult.js';
import type { WorkflowOutcome } from '../types/gateway/workflow.types.js';

export interface WireSubagentEntry {
  sessionId: string;
  agentId: string;
  parentAgentId?: string;
  confirmed?: boolean;
  triggeringToolUseId?: string;
}

/** Opciones de apertura de workflow wire (audit-interaction). */
export interface OpenWorkflowOptions {
  /** Crea un workflow nuevo aunque exista el main de hooks (idempotencia solo sin esto). */
  forceNew?: boolean;
  /** Índice NN del layout causal; si no se indica, se asigna por sesión. */
  layoutIndex?: number;
  /** Body parseado para `request/body.json` (workflow_start / step_request). */
  request?: unknown;
  /** Omite `request/body.json` a nivel workflow (preflights). */
  skipWorkflowRequest?: boolean;
  interactionType?: InteractionType;
  sideRequestKind?: SideRequestKind;
}

/** Opciones de apertura de sub-workflow wire. */
export interface OpenSubagentWorkflowOptions {
  layoutIndex?: number;
  request?: unknown;
  parentContext?: ParentContext;
}

/** Estado en memoria del turno wire asociado a un workflow. */
export interface WireWorkflowMeta {
  layoutIndex: number;
  requestSequence: number;
  requestBodyOmitted: boolean;
  requestBodyBytes: number;
  interactionType: InteractionType;
  sideRequestKind?: SideRequestKind;
  awaitingContinuation?: boolean;
  awaitingSince?: number;
  modelId?: string;
  parentContext?: ParentContext;
  continuationOrphan?: boolean;
  coalescedAgentContinuation?: {
    targetStepIndex: number;
    toolUseIds: string[];
    continuationRequest?: JsonValue;
    continuationHeaders?: Record<string, string | string[] | undefined>;
  };
}

export interface IWorkflowRepository {
  // ── Métodos wire (C1/C2/C3) ──────────────────────────────────────────────

  /**
   * Registra un subagente abierto a partir de las cabeceras de agente wire.
   * Indexa la entrada por `agentCtx.agentId` si está presente.
   */
  openSubagentFromWire(sessionId: string, agentCtx: AgentContext): WireSubagentEntry;

  /**
   * Devuelve la entrada registrada para un agentId, o `undefined` si no existe.
   */
  getWorkflowByAgentId(agentId: string): WireSubagentEntry | undefined;

  /**
   * Confirma un subagente a partir de un evento hook `SubagentStart`.
   * Maneja la carrera hook-antes-wire creando un placeholder si la entrada aún no existe.
   */
  confirmSubagentFromHook(agentId: string, toolUseId?: string): void;

  // ── Métodos de lifecycle (G2) ─────────────────────────────────────────────

  /** Abre el workflow principal de la sesión; idempotente si ya existe (hooks). */
  openWorkflow(sessionId: string, agentCtx: AgentContext, options?: OpenWorkflowOptions): IWorkflow;

  /** Abre un sub-workflow enlazado a un workflow padre y a un tool_use. */
  openSubagentWorkflow(
    sessionId: string,
    agentCtx: AgentContext,
    parentWorkflowId: string,
    parentToolUseId: string,
    options?: OpenSubagentWorkflowOptions,
  ): IWorkflow;

  /** Recupera un workflow por su id. */
  getWorkflow(workflowId: string): IWorkflow | undefined;

  /** Adjunta un step al workflow. */
  registerStep(workflowId: string, step: IStep): void;

  /** Marca un step como cerrado (establece `closedAt`). */
  closeStep(workflowId: string, stepId: string): void;

  /** Registra un tool_use en el step correspondiente del workflow. */
  registerToolUse(workflowId: string, toolUse: IToolUse): void;

  /**
   * Completa un `ToolUse` existente (por timeout §24.1 o por hook
   * `PostToolUse`/`PostToolUseFailure`). Actualiza `toolUse.result` y
   * `toolUse.status` y emite `tool_result` al bus. No-op si el `toolUseId` no existe.
   */
  completeToolUse(
    workflowId: string,
    toolUseId: string,
    result: { isError: boolean; result: unknown },
  ): void;

  /** Evalúa si el workflow puede cerrarse según §15.4. Sin efectos secundarios. */
  readyToClose(workflowId: string, hook: ClaudeHookEvent): boolean;

  /** Cierra el workflow invocando `buildWorkflowResult`; idempotente si ya está cerrado. */
  close(workflowId: string, hook: ClaudeHookEvent): IWorkflowResult;

  /**
   * Cierra forzosamente el workflow con el outcome indicado (sin hook event).
   * Usado para errores upstream donde no hay evento de hook disponible. Idempotente.
   */
  forceClose(
    workflowId: string,
    outcome: WorkflowOutcome,
    resultExtras?: Record<string, unknown>,
  ): void;

  /**
   * Fija `languageModelId` con el primer modelo observado (idempotente).
   * No-op si el workflowId no existe.
   */
  setWorkflowModel(workflowId: string, modelId: string): void;

  // ── Métodos de lookup (migración de handlers L3) ──────────────────────────

  /** Recupera el workflow principal (`kind: 'main'`) de una sesión. */
  getWorkflowBySessionId(sessionId: string): IWorkflow | undefined;

  /**
   * Busca un tool_use pendiente por su ID en todos los workflows de la sesión.
   * Devuelve el workflow y el tool_use, o `undefined` si no existe.
   */
  findWorkflowWithPendingToolUse(
    sessionId: string,
    toolUseId: string,
  ): { workflow: IWorkflow; toolUse: IToolUse } | undefined;

  /** Registra un tool_use pendiente (agent, web_search, web_fetch) en el step indicado. */
  registerPendingToolUse(workflowId: string, stepId: string, toolUse: IToolUse): void;

  /**
   * Consume (elimina de pendientes) un tool_use por su ID.
   * Devuelve el tool_use consumido o `undefined`.
   */
  consumePendingToolUse(workflowId: string, toolUseId: string): IToolUse | undefined;

  /** Busca workflows `running` cuya antigüedad (`startedAt`) supera `maxAgeMs`. */
  findStaleWorkflows(sessionId: string, maxAgeMs: number): IWorkflow[];

  /**
   * Workflows en espera de continuation cuyo `awaitingSince` supera `maxAgeMs`.
   */
  findStaleWorkflowsAwaitingContinuation(sessionId: string, maxAgeMs: number): IWorkflow[];

  /** Todos los workflows con `status === 'running'`. */
  getAllRunningWorkflows(): IWorkflow[];

  /**
   * Busca el primer workflow de la sesión con tool_uses pendientes que cumplan el predicado.
   */
  findWorkflowWithPendingTools(
    sessionId: string,
    predicate: (toolUse: IToolUse) => boolean,
    options?: { excludeSubagents?: boolean },
  ): { workflow: IWorkflow; pendings: IToolUse[] } | undefined;

  /** Resuelve workflow por tool_use_id (pendiente o índice wire). */
  findWorkflowByToolUseId(sessionId: string, toolUseId: string): IWorkflow | undefined;

  /** Consume el primer pending FIFO cuyo nombre de tool coincide (web_search / web_fetch). */
  consumeFirstPendingToolUseByName(workflowId: string, toolName: string): IToolUse | undefined;

  /** Metadatos del turno wire en memoria. */
  getWireMeta(workflowId: string): WireWorkflowMeta | undefined;

  /** Actualiza metadatos wire (merge superficial). */
  patchWireMeta(workflowId: string, patch: Partial<WireWorkflowMeta>): void;

  /** Asigna el siguiente número de secuencia para la sesión. */
  nextSequence(sessionId: string): Promise<number>;

  /** Asigna el siguiente índice de layout NN por sesión (empieza en 0). */
  allocLayoutIndex(sessionId: string): Promise<number>;

  /** Ejecuta `fn` serializado por sesión. */
  withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T>;
}
