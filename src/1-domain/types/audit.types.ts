import type { JsonValue } from './json.types.js';

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
  /** Indica si la correlación con toolUseId fue inferida por orden, no explícita */
  inferredByOrder: boolean;
  /** Descripción del subagente extraída del tool_use Agent */
  description: string;
  /** Prompt del subagente extraído del tool_use Agent */
  prompt: string;
  /** Tipo de subagente (general-purpose, Explore, Plan, etc.) */
  subagentType: string | null;
  /** Estado final del subagente */
  outcome: InteractionOutcome | 'unknown';
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
   * desde un único sse.jsonl multi-fase.
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
 * Metadatos de un step individual dentro de un turno.
 */
export interface StepMeta {
  stepIndex: number;
  label?: string;
  sse: boolean;
  statusCode: number | null;
  sseLineCount?: number;
  stopReason?: string;
  toolCalls?: string[];
  /** IDs de tool_use emitidos en este step; usados para correlacionar continuations con su turno padre. */
  toolUseIds?: string[];
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Bytes crudos SSE escritos en disco para este step. */
  sseRawBytesWritten?: number;
  /** True si el volcado crudo de SSE de este step fue truncado por límite. */
  sseRawTruncatedByLimit?: boolean;
  /**
   * ID del mensaje de Anthropic (message.id) extraído de la respuesta.
   * Permite correlacionar con logs de Claude Code que incluyen este ID.
   * @example "msg_01SweCL7ReWWANWSRsPc8mfn"
   */
  anthropicMessageId?: string;
  /** True si el step contiene al menos un bloque de extended thinking. */
  hasThinking?: boolean;
  /** Número de bloques de thinking detectados en el step. */
  thinkingBlockCount?: number;
  coalescedAgentContinuation?: {
    toolUseIds: string[];
    sseLineCount?: number;
    stopReason?: string;
    statusCode: number | null;
    inputTokens?: number;
    outputTokens?: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
    sseRawBytesWritten?: number;
    sseRawTruncatedByLimit?: boolean;
    anthropicMessageId?: string;
  };
}

/**
 * Computa los totales de tokens sumando los campos de todos los StepMeta.
 * Función pura de dominio, independiente de infraestructura.
 */
export function computeTokenTotals(steps: StepMeta[]): {
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  inputTokens: number;
  outputTokens: number;
} {
  return steps.reduce(
    (acc, s) => {
      const continuation = s.coalescedAgentContinuation;
      return {
        cacheCreationInputTokens:
          acc.cacheCreationInputTokens +
          (s.cacheCreationInputTokens ?? 0) +
          (continuation?.cacheCreationInputTokens ?? 0),
        cacheReadInputTokens:
          acc.cacheReadInputTokens +
          (s.cacheReadInputTokens ?? 0) +
          (continuation?.cacheReadInputTokens ?? 0),
        inputTokens: acc.inputTokens + (s.inputTokens ?? 0) + (continuation?.inputTokens ?? 0),
        outputTokens: acc.outputTokens + (s.outputTokens ?? 0) + (continuation?.outputTokens ?? 0),
      };
    },
    { cacheCreationInputTokens: 0, cacheReadInputTokens: 0, inputTokens: 0, outputTokens: 0 },
  );
}

/**
 * Computa la suma de bytes crudos SSE escritos a lo largo de todos los steps.
 */
export function computeSseRawBytesTotal(steps: StepMeta[]): number {
  return steps.reduce(
    (acc, s) =>
      acc + (s.sseRawBytesWritten ?? 0) + (s.coalescedAgentContinuation?.sseRawBytesWritten ?? 0),
    0,
  );
}

/**
 * Estado en memoria de un turno activo en una sesión.
 * @deprecated Reemplazado por los tipos gateway de G1 (`WorkflowKind`, `WorkflowStatus`, etc.)
 * en `src/1-domain/types/gateway/`. Retirada planificada en la fase que migre el último consumidor
 * (G4 o P, a confirmar al implementar G4). Fecha de deprecación: 2026-05-29.
 */
export type InteractionType = 'client-preflight' | 'agentic' | 'side-request';

/**
 * Resultado posible de una interacción.
 * - completed: Interacción completada exitosamente (2xx)
 * - client-error: Error del cliente (4xx)
 * - upstream-error: Error del servidor upstream (5xx o fallo de conexión)
 * - truncated: Truncado por max_tokens
 * - orphaned: Interacción cerrada por cleanup (continuation nunca llegó, graceful shutdown, etc.)
 * @deprecated Reemplazado por `WorkflowOutcome` en `src/1-domain/types/gateway/workflow.types.ts`
 * (fase G1). Retirada planificada en la fase que migre el último consumidor (G4 o P, a confirmar
 * al implementar G4). Fecha de deprecación: 2026-05-29.
 */
export type InteractionOutcome =
  | 'completed'
  | 'client-error'
  | 'upstream-error'
  | 'truncated'
  | 'orphaned';

/**
 * Referencia de parentezco entre una interacción de subagente y el step del
 * turno padre que la originó vía un tool_use `Agent`.
 */
export interface ParentContext {
  /** Directorio absoluto del turno padre. */
  parentInteractionDir: string;
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
export type CorrelationMethod = 'agent-headers' | 'prompt' | 'unique-pending' | 'fifo-pending' | 'none';

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
 * Entrada que tracquea un tool_use `WebSearch` emitido por el SSE del padre y aún
 * no correlacionado con la llamada de implementación correspondiente. Cada entrada
 * se consume al recibir el request fresh de implementación del harness.
 */
export interface PendingWebSearchToolUse {
  /** Step del padre donde se emitió el tool_use. */
  stepIndex: number;
  /** Identificador único del tool_use bloque emitido por Anthropic. */
  toolUseId: string;
}

/**
 * Entrada que tracquea un tool_use `WebFetch` emitido por el SSE del padre y aún
 * no correlacionado con la llamada de implementación correspondiente. Cada entrada
 * se consume al recibir el request fresh de implementación del harness.
 */
export interface PendingWebFetchToolUse {
  /** Step del padre donde se emitió el tool_use. */
  stepIndex: number;
  /** Identificador único del tool_use bloque emitido por Anthropic. */
  toolUseId: string;
}

/**
 * Resolución de una herramienta interna (WebSearch/WebFetch) que fue observada
 * en la auditoría. Distingue entre resoluciones por request interna del harness
 * y resoluciones por tool_result en continuation.
 */
export interface ResolvedInternalTool {
  /** Identificador único del tool_use. */
  toolUseId: string;
  /** Nombre de la herramienta. */
  toolName: 'WebSearch' | 'WebFetch';
  /** Step donde se emitió el tool_use original. */
  originalStepIndex: number;
  /**
   * Modo de resolución observado.
   * - 'internal_request': Se observó una request de implementación del harness.
   * - 'tool_result_in_continuation': El resultado llegó como tool_result en una continuation.
   */
  resolutionMode: 'internal_request' | 'tool_result_in_continuation';
  /**
   * Step donde se observó la resolución (para tool_result_in_continuation).
   * Nulo para internal_request porque la resolución es un step separado.
   */
  resolvedInStepIndex?: number;
}

/**
 * @deprecated Reemplazado por las entidades gateway de G1 (`IWorkflow`, `IStep`, etc.) en
 * `src/1-domain/interfaces/gateway/`. Retirada planificada en la fase que migre el último
 * consumidor (G4 o P, a confirmar al implementar G4). Fecha de deprecación: 2026-05-29.
 */
export interface ActiveInteraction {
  interactionDir: string;
  interactionType: InteractionType;
  stepCount: number;
  requestSequence: number;
  startedAt: number;
  requestBodyOmitted: boolean;
  requestBodyBytes: number;
  stepsMeta: StepMeta[];
  /**
   * Identificador de la sesión a la que pertenece el turno. Necesario para
   * correlacionar subagentes con su padre dentro de la misma sesión.
   */
  sessionId: string;
  /**
   * Tool_uses `Agent` emitidos por el SSE de este turn que aún esperan su
   * `tool_result`. Vacío en turns que no son padres de subagentes.
   */
  pendingAgentToolUses: PendingAgentToolUse[];
  /**
   * Tool_uses `WebSearch` emitidos por el SSE de este turn que aún esperan su
   * llamada de implementación del harness. Vacío en turns que no usan WebSearch.
   */
  pendingWebSearchToolUses: PendingWebSearchToolUse[];
  /**
   * Tool_uses `WebFetch` emitidos por el SSE de este turn que aún esperan su
   * llamada de implementación del harness. Vacío en turns que no usan WebFetch.
   */
  pendingWebFetchToolUses: PendingWebFetchToolUse[];
  /**
   * Resoluciones observadas de WebSearch/WebFetch. Se llena cuando se consumen
   * pendings, ya sea por request interna o por tool_result en continuation.
   */
  resolvedInternalTools: ResolvedInternalTool[];
  /** Subtipo de side-request (solo para interactionType='side-request'). */
  sideRequestKind?: SideRequestKind;
  /** Definido sólo en turns que son subagentes. */
  parentContext?: ParentContext;
  /**
   * True cuando el SSE handler procesó un step con `stop_reason: "tool_use"`
   * y retornó early esperando una continuation que aún no ha llegado.
   */
  awaitingContinuation?: boolean;
  /** Timestamp (epoch ms) de cuándo el turno empezó a esperar la continuation. */
  awaitingSince?: number;
  /** Modelo usado en este turno, extraído del request body al registrar el turno. */
  modelId?: string;
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
 * Subtipo de side-request para diferenciar requests de naming de sesión.
 */
export type SideRequestKind = 'session-naming' | 'generic';

/**
 * Metadatos del turno completo escritos en meta.json.
 * Refleja la perspectiva de turno lógico del usuario.
 * @deprecated Reemplazado por `IWorkflowResult` + interfaces gateway de G1 en
 * `src/1-domain/interfaces/gateway/`. Retirada planificada en la fase que migre el último
 * consumidor (G4 o P, a confirmar al implementar G4). Fecha de deprecación: 2026-05-29.
 */
export interface InteractionMetadata {
  interactionType: InteractionType;
  /** Modelo que procesó esta interacción. Presente en agentic y side-request. */
  modelId?: string;
  /** Subtipo de side-request (solo para interactionType='side-request'). */
  sideRequestKind?: SideRequestKind;
  outcome: InteractionOutcome;
  stepCount: number;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  statusCode: number | null;
  sse: boolean;
  steps: StepMeta[];
  totals: {
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
    inputTokens: number;
    outputTokens: number;
  } | null;
  truncation: AuditTruncationMeta;
  sseResponseBodyAttempted: boolean;
  sseResponseBodyWritten: boolean;
  sseResponseBodyError: string | null;
  sseResponseBodySource: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  /** Presente sólo en interacciones de subagentes anidadas bajo el step padre. */
  parentContext?: ParentContext;
  /**
   * Presente cuando el turno se cierra habiendo registrado Agent tool_uses
   * que no se consumieron antes del cierre (error upstream, orphan timeout,
   * graceful shutdown). Información forense para correlación offline.
   */
  lostPendingAgents?: PendingAgentToolUse[];
  /**
   * Presente cuando el turno se cierra habiendo registrado WebSearch tool_uses
   * que no se consumieron antes del cierre. Información forense para correlación offline.
   */
  lostPendingWebSearch?: PendingWebSearchToolUse[];
  /**
   * Presente cuando el turno se cierra habiendo registrado WebFetch tool_uses
   * que no se consumieron antes del cierre. Información forense para correlación offline.
   */
  lostPendingWebFetch?: PendingWebFetchToolUse[];
  /**
   * Resoluciones observadas de WebSearch/WebFetch. Información forense para
   * trazabilidad de cómo se resolvieron las herramientas internas.
   */
  resolvedInternalTools?: ResolvedInternalTool[];
}

/**
 * @deprecated Usar `IModelSessionMetrics` en `types/gateway/session-metrics.types.ts` (G4).
 */
export type { IModelSessionMetrics as SessionModelMetrics } from './gateway/session-metrics.types.js';

/**
 * @deprecated Usar `ISessionMetrics` en `types/gateway/session-metrics.types.ts` (G4).
 */
export type { ISessionMetrics as SessionMetrics } from './gateway/session-metrics.types.js';

/**
 * Estado persistente de una interacción en curso, escrito como state.json
 * al crear la interacción y eliminado al cerrar el turno.
 * Permite a herramientas externas detectar interacciones huérfanas por crash.
 * @deprecated Reemplazado por `WorkflowStatus` en `src/1-domain/types/gateway/workflow.types.ts`
 * (fase G1). Retirada planificada en la fase que migre el último consumidor (G4 o P, a confirmar
 * al implementar G4). Fecha de deprecación: 2026-05-29.
 */
export interface InteractionState {
  state: 'in-progress';
  startedAt: string;
  interactionType: InteractionType;
  /** Presente cuando la continuation no encontró su turno padre vía tool_use_id (degradación). */
  continuationOrphan?: boolean;
  /** Presente sólo en interacciones de subagentes anidadas bajo el step padre. */
  parentContext?: ParentContext;
}

/**
 * Opciones para la reconstrucción del cuerpo de respuesta desde bytes SSE.
 */
export interface SseReconstructOptions {
  /**
   * Directorio del step que contiene el archivo `sse.jsonl` (fuente de verdad
   * para la reconstrucción, escrito de forma síncrona y por tanto con orden
   * garantizado). El `sse.txt` del mismo directorio es solo raw dump de
   * depuración y NO se lee aquí.
   */
  stepDir: string;
  /** Directorio de la interacción donde se escribe el resultado (response/body.*). */
  interactionDir: string;
  /** Total de steps en el turno al momento del cierre. */
  stepCount: number;
  /** URL original de la petición (para detectar beta). */
  originalUrl?: string;
  /** Cabeceras originales de la petición (para detectar anthropic-beta). */
  headers?: Record<string, string | string[] | undefined>;
  /**
   * Bytes crudos SSE escritos en `sse.txt` (raw dump).
   * Informativo: NO afecta a la reconstrucción (que lee `sse.jsonl`).
   */
  sseRawBytesWritten: number;
  /**
   * Si el raw dump `sse.txt` fue truncado por `MAX_AUDIT_BYTES`.
   * Informativo: NO aborta la reconstrucción (fuente es `sse.jsonl`).
   */
  sseRawTruncatedByLimit: boolean;
  /**
   * Si hubo un error de escritura durante la captura cruda del raw dump.
   * Informativo: NO aborta la reconstrucción (fuente es `sse.jsonl`).
   */
  sseRawWriteError: boolean;
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
 * Contexto de interacción que los handlers de Capa 3 reciben del controller.
 * Desacopla los handlers de Fastify.
 * @deprecated Reemplazado por los contratos gateway de G1. Retirada planificada en la fase que
 * migre el último consumidor (G4 o P, a confirmar al implementar G4). Fecha de deprecación: 2026-05-29.
 */
export interface AuditInteractionContext {
  requestId: string;
  requestSequence: number;
  auditSessionId: string;
  method: string;
  url: string;
  upstream: string;
  requestStartTime: number;
  requestBodyBytes: number;
  requestBodyOmitted: boolean;
  auditInteractionDir: string;
  responseStatusCode: number | null;
  interactionType?: InteractionType;
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
  /** Tipo de interacción para etiquetas de display */
  interactionType?: InteractionType;
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
  /** Subtipo de side-request (solo para interactionType='side-request') */
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
