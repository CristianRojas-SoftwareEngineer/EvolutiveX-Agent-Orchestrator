import type { JsonValue } from './json.types.js';
import type { WorkflowOutcome } from './gateway/workflow.types.js';

/**
 * Representa una sesión de auditoría resuelta.
 */
export interface AuditSession {
  /** El identificador único sanitizado para el directorio de la sesión. */
  sessionId: string;
  /** El nombre de la cabecera que proporcionó el ID, para ser eliminada si se configura. */
  stripHeaderName: string | null;
}

/**
 * Fase de un step coalesced de Agent.
 * - delegation: Stream inicial que emitió tool_use Agent
 * - continuation: Stream terminal que procesó los tool_result de los subagentes
 */
export type SsePhase = 'delegation' | 'continuation';

/**
 * Resumen de un subagente ejecutado durante la Fase 2 de un step coalesced.
 */
export interface SubagentSummary {
  /** Índice del subagente (sub-agent-01, sub-agent-02, etc.) */
  index: number;
  /** Nombre del directorio del subagente relativo al step padre */
  dirName: string;
  /** ID del tool_use Agent que originó este subagente, si puede correlacionarse */
  toolUseId: string | null;
  /** Descripción del subagente extraída del tool_use Agent */
  description: string;
  /** Prompt del subagente extraído del tool_use Agent */
  prompt: string;
  /** Tipo de subagente (general-purpose, Explore, Plan, etc.) */
  subagentType: string | null;
  /** Estado final del subagente (valores WorkflowOutcome). */
  outcome: WorkflowOutcome;
  /** Duración total en milisegundos */
  durationMs: number;
  /** Número de steps ejecutados por el subagente */
  stepCount: number;
  /** Herramientas usadas por el subagente (WebFetch, WebSearch, etc.) */
  toolCalls: string[];
  /** Tokens de entrada totales del subagente */
  inputTokens: number;
  /** Tokens de salida totales del subagente */
  outputTokens: number;
  /** stop_reason del último step del subagente */
  finalStopReason: string | null;
  /** Preview acotado de la respuesta final del subagente para legibilidad */
  finalResponsePreview: string | null;
  /** Ruta relativa desde el step padre hacia el output completo del subagente */
  outputPath: string;
}

/**
 * Bloque de resumen de subagentes para un step coalesced.
 */
export interface SubagentsSummary {
  /** Lista de subagentes ejecutados */
  items: SubagentSummary[];
  /** Total de subagentes */
  count: number;
  /** Total de subagentes completados exitosamente */
  completedCount: number;
  /** Total de subagentes fallidos */
  failedCount: number;
  /** Total de subagentes huérfanos */
  orphanedCount: number;
  /** Duración total acumulada de todos los subagentes */
  totalDurationMs: number;
  /** Tokens de entrada totales de todos los subagentes */
  totalInputTokens: number;
  /** Tokens de salida totales de todos los subagentes */
  totalOutputTokens: number;
}

/**
 * Representa una única línea capturada en un stream de Server-Sent Events (SSE).
 */
export interface SseLine {
  /** El índice de secuencia de la línea dentro de la respuesta. */
  i: number;
  /** Timestamp ISO de cuando se capturó la línea. */
  ts: string;
  /** El payload crudo de la línea SSE (después del trim). */
  line: string;
  /**
   * Fase del step coalesced. Presente solo en steps que invocan subagentes Agent.
   * Permite reconstruir separadamente la delegación inicial y la respuesta final
   * desde los chunks streaming/ del step.
   */
  phase?: SsePhase;
}

/**
 * Clasificación del tipo de request según el contenido del body.
 */
export type RequestClassification =
  | { type: 'preflight-quota' }
  | { type: 'preflight-warmup' }
  | { type: 'fresh' }
  | { type: 'continuation' }
  | { type: 'side-request' };

/**
 * Clasificación del tipo de request HTTP según el contenido del body.
 * Tipo canónico para la clasificación semántica del request en el proxy.
 */
export type WorkflowRequestKind = 'client-preflight' | 'agentic' | 'side-request';

/** Semántica del hop HTTP dentro de un workflow de turno. */
export type StepKind = 'agentic' | 'side-request';

/**
 * Referencia de parentezco entre una interacción de subagente y el step del
 * turno padre que la originó vía un tool_use `Agent`.
 */
export interface ParentContext {
  /** Directorio absoluto del workflow padre (step padre). */
  parentWorkflowDir: string;
  /** Índice del step del padre (1-indexado) donde se emitió el tool_use `Agent`. */
  parentStepIndex: number;
  /**
   * `tool_use_id` específico que originó este subagente.
   * `null` cuando la correlación no pudo determinarse.
   */
  triggeringToolUseId: string | null;
  /**
   * Estado de correlación del subagente con su tool_use padre.
   * `resolved` cuando se determinó el `toolUseId` con certeza (por prompt o pending único).
   * `unresolved` cuando no se pudo correlacionar determinísticamente.
   */
  correlationStatus?: CorrelationStatus;
  /**
   * Método usado para resolver la correlación, cuando `correlationStatus` es `resolved`.
   */
  correlationMethod?: CorrelationMethod;
  /**
   * Tipo de subagente declarado por el cliente en `tool_use.input.subagent_type`
   * (`general-purpose`, `Explore`, `Plan`, `claude-code-guide`, `statusline-setup`, ...).
   * Opcional porque puede no haberse capturado a tiempo o no haberse provisto.
   */
  subagentType?: string;
  /** `X-Claude-Code-Agent-Id` de la request del subagente. Presente cuando `correlationMethod === 'agent-headers'`. */
  wireAgentId?: string;
  /** `X-Claude-Code-Parent-Agent-Id` de la request del subagente. Presente cuando `correlationMethod === 'agent-headers'`. */
  wireParentAgentId?: string;
}

/**
 * Estado de correlación del `triggeringToolUseId` en el parentContext.
 * - 'resolved': El tool_use_id se determinó con certeza (por prompt único o pending único).
 * - 'unresolved': No se pudo correlacionar determinísticamente (sin match o múltiples matches).
 */
export type CorrelationStatus = 'resolved' | 'unresolved';

/**
 * Método usado para resolver la correlación del subagente con su tool_use padre.
 * - 'agent-headers': Correlación determinista por cabeceras X-Claude-Code-Agent-Id / X-Claude-Code-Parent-Agent-Id (mayor autoridad, §21).
 * - 'prompt': Correlación por match exacto del prompt del request con el pending Agent.
 * - 'unique-pending': Correlación por ser el único pending disponible.
 * - 'fifo-pending': Señal posicional (primer pending registrado); último recurso determinista cuando hay N pendings sin match, por debajo de prompt/unique.
 * - 'none': No se pudo resolver la correlación.
 */
export type CorrelationMethod =
  | 'agent-headers'
  | 'prompt'
  | 'unique-pending'
  | 'fifo-pending'
  | 'none';

/**
 * Contexto de agente extraído de las cabeceras X-Claude-Code-Agent-Id y X-Claude-Code-Parent-Agent-Id.
 * Producido por `resolveAgentContext()` en capa 1 (función pura, sin I/O).
 */
export interface AgentContext {
  agentId?: string;
  parentAgentId?: string;
  /** True cuando hay `parentAgentId` no vacío — indica request de subagente. */
  isSubagentRequest: boolean;
}

/**
 * Entrada que tracquea un tool_use `Agent` emitido por el SSE del padre y aún
 * no correlacionado con el subagente correspondiente. Cada entrada se consume
 * o bien al crear el subagente (caso resuelto) o bien al recibir la
 * continuation con el `tool_result` (caso paralelo).
 */
export interface PendingAgentToolUse {
  /** Step del padre donde se emitió el tool_use. */
  stepIndex: number;
  /** Identificador único del tool_use bloque emitido por Anthropic. */
  toolUseId: string;
  /** `description` del input del tool_use, capturado vía input_json_delta. */
  description?: string;
  /** `prompt` del input del tool_use, capturado vía input_json_delta. */
  prompt?: string;
  /** `subagent_type` del input del tool_use, capturado vía input_json_delta. */
  subagentType?: string;
}

/**
 * Subtipo de side-request para diferenciar requests de naming de sesión.
 */
export type SideRequestKind = 'session-naming' | 'generic';

/**
 * Opciones para la reconstrucción del cuerpo de respuesta desde bytes SSE.
 */
export interface SseReconstructOptions {
  /**
   * Directorio del step. La implementación P2+ lee de
   * `stepDir/response/streaming/*.ndjson` como fuente canónica.
   */
  stepDir: string;
  /** Directorio del workflow donde se escribe el resultado (response/body.*). */
  workflowDir: string;
  /** Total de steps en el turno al momento del cierre. */
  stepCount: number;
  /** URL original de la petición (para detectar beta). */
  originalUrl?: string;
  /** Cabeceras originales de la petición (para detectar anthropic-beta). */
  headers?: Record<string, string | string[] | undefined>;
  /** Contexto posicional para enriquecer el body.parsed.md generado. */
  context?: MarkdownRenderContext;
}

/**
 * Resultado de un intento de reconstrucción SSE.
 */
export interface SseReconstructResult {
  /** Si se intentó la reconstrucción. */
  sseResponseBodyAttempted: boolean;
  /** Si se escribió exitosamente el cuerpo reconstruido. */
  sseResponseBodyWritten: boolean;
  /** Mensaje de error si la reconstrucción falló. */
  sseResponseBodyError?: string;
  /** Fuente de los bytes SSE (file, memory). */
  sseResponseBodySource?: string;
}

/**
 * Metadatos sobre el truncamiento de datos debido a los límites configurados.
 */
export interface AuditTruncationMeta {
  /** True si el cuerpo de la petición fue omitido por ser demasiado grande. */
  requestBodyOmitted: boolean;
  /** Total de bytes del cuerpo de la respuesta recibidos desde el upstream. */
  responseBodyBytesTotal: number | null;
  /** Bytes reales escritos en el archivo de auditoría tras aplicar los límites. */
  responseBodyBytesAudited: number | null;
  /** True si la respuesta fue truncada por exceder MAX_RESPONSE_BUFFER_BYTES. */
  responseTruncatedByProxyBuffer: boolean | null;
  /** True si el archivo de auditoría fue truncado por exceder MAX_AUDIT_BYTES. */
  responseTruncatedByAuditLimit: boolean | null;
  /** Total de bytes registrados en el volcado crudo de SSE. */
  sseRawBytesAudited: number | null;
  /** El límite aplicado al volcado crudo de SSE. null cuando el límite es infinito. */
  sseRawBytesLimit: number | null;
  /** True si el volcado crudo de SSE fue cortado por el límite. */
  sseRawTruncatedByLimit: boolean;
  /** True si ocurrió un error de escritura durante la captura cruda de SSE. */
  sseRawWriteError: boolean;
}

/**
 * Contexto que los handlers de Capa 3 reciben del controller.
 * Desacopla los handlers de Fastify.
 */
export interface AuditWorkflowContext {
  requestId: string;
  requestSequence: number;
  auditSessionId: string;
  method: string;
  url: string;
  upstream: string;
  requestStartTime: number;
  requestBodyBytes: number;
  requestBodyOmitted: boolean;
  auditWorkflowDir: string;
  responseStatusCode: number | null;
  /**
   * Identificador del workflow específico que abrió el `AuditWorkflowHandler`
   * para esta request. Los handlers de respuesta (SSE/standard) usan este id
   * para resolver el workflow destino de los chunks, steps y tool_uses,
   * evitando que el contenido de un wire-N de continuation se atribuya al
   * workflow main de la sesión.
   */
  workflowId: string;
  workflowKind?: WorkflowRequestKind;
  requestClassification?: RequestClassification;
  /** Índice del step asignado durante request audit, inmutable hasta response audit. */
  assignedStepIndex: number;
  isInternalToolStep?: boolean;
  coalescedAgentContinuation?: {
    targetStepIndex: number;
    toolUseIds: string[];
    /**
     * Request de continuation parseado (body JSON completo).
     * Almacenado en memoria para evitar crear archivos continuation.request.* temporales.
     */
    continuationRequest?: JsonValue;
    /**
     * Headers de la request de continuation.
     */
    continuationHeaders?: Record<string, string | string[] | undefined>;
  };
}

/**
 * Contexto posicional que los handlers de Capa 3 proporcionan al MarkdownRendererService
 * para enriquecer los body.parsed.md generados con información de ubicación en el flujo global.
 */
export interface MarkdownRenderContext {
  /** Tipo de workflow para etiquetas de display */
  workflowKind?: WorkflowRequestKind;
  /** Índice del step actual (1-indexado) */
  stepIndex?: number;
  /** Total de steps en la interacción */
  stepCount?: number;
  /** Tipo de subagente (general-purpose, Explore, Plan, etc.) */
  subagentType?: string;
  /** Modelo usado en este step */
  modelId?: string;
  /** Path relativo a thought/content.md para referencia cruzada */
  thoughtContentPath?: string;
  /** Subtipo de side-request (solo para workflowKind='side-request') */
  sideRequestKind?: SideRequestKind;
}

/**
 * Contrato canónico para la respuesta de un step que invocó subagentes Agent.
 * Este es el formato persistido en steps/NN/response/body.json para steps coalesced.
 */
export interface CoalescedAgentStepResponse {
  type: 'coalesced-agent-step-response';
  delegation: {
    message: JsonValue;
  };
  continuation: {
    request: {
      body: JsonValue | null;
      headers?: Record<string, string | string[] | undefined>;
    };
    response: {
      message: JsonValue;
    };
  };
  toolUseIds: string[];
  subagents?: SubagentsSummary;
}

/**
 * Contrato canónico para el output top-level de una interacción con múltiples steps.
 * Este es el formato persistido en output/body.json para interacciones multi-step.
 */
export interface MultiStepResponse {
  type: 'multi-step-response';
  stepCount: number;
  steps: Array<{
    stepIndex: number;
    [key: string]: JsonValue;
  }>;
}
