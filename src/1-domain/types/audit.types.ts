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
 * Representa una única línea capturada en un stream de Server-Sent Events (SSE).
 */
export interface SseLine {
  /** El índice de secuencia de la línea dentro de la respuesta. */
  i: number;
  /** Timestamp ISO de cuando se capturó la línea. */
  ts: string;
  /** El payload crudo de la línea SSE (después del trim). */
  line: string;
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
    (acc, s) => ({
      cacheCreationInputTokens: acc.cacheCreationInputTokens + (s.cacheCreationInputTokens ?? 0),
      cacheReadInputTokens: acc.cacheReadInputTokens + (s.cacheReadInputTokens ?? 0),
      inputTokens: acc.inputTokens + (s.inputTokens ?? 0),
      outputTokens: acc.outputTokens + (s.outputTokens ?? 0),
    }),
    { cacheCreationInputTokens: 0, cacheReadInputTokens: 0, inputTokens: 0, outputTokens: 0 },
  );
}

/**
 * Computa la suma de bytes crudos SSE escritos a lo largo de todos los steps.
 */
export function computeSseRawBytesTotal(steps: StepMeta[]): number {
  return steps.reduce((acc, s) => acc + (s.sseRawBytesWritten ?? 0), 0);
}

/**
 * Estado en memoria de un turno activo en una sesión.
 */
export type InteractionType = 'client-preflight' | 'agentic' | 'side-request';

/**
 * Resultado posible de una interacción.
 * - completed: Interacción completada exitosamente (2xx)
 * - client-error: Error del cliente (4xx)
 * - upstream-error: Error del servidor upstream (5xx o fallo de conexión)
 * - truncated: Truncado por max_tokens
 * - orphaned: Interacción cerrada por cleanup (continuation nunca llegó, graceful shutdown, etc.)
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
   * `null` cuando hubo varios tool_use `Agent` paralelos en el mismo step y la
   * correlación no fue unívoca al crear el subagente; el id correcto se
   * conocerá al llegar el `tool_result` correspondiente en la continuation
   * del padre.
   */
  triggeringToolUseId: string | null;
  /**
   * Tipo de subagente declarado por el cliente en `tool_use.input.subagent_type`
   * (`general-purpose`, `Explore`, `Plan`, `claude-code-guide`, `statusline-setup`, ...).
   * Opcional porque puede no haberse capturado a tiempo o no haberse provisto.
   */
  subagentType?: string;
}

/**
 * Entrada que tracquea un tool_use `Agent` emitido por el SSE del padre y aún
 * no correlacionado con el subagente correspondiente. Cada entrada se consume
 * o bien al crear el subagente (caso unívoco) o bien al recibir la
 * continuation con el `tool_result` (caso paralelo).
 */
export interface PendingAgentToolUse {
  /** Step del padre donde se emitió el tool_use. */
  stepIndex: number;
  /** Identificador único del tool_use bloque emitido por Anthropic. */
  toolUseId: string;
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
}

/**
 * Metadatos del turno completo escritos en meta.json.
 * Refleja la perspectiva de turno lógico del usuario.
 */
export interface InteractionMetadata {
  interactionType: InteractionType;
  /** Modelo que procesó esta interacción. Presente en agentic y side-request. */
  modelId?: string;
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
}

/** Métricas agregadas de tokens por modelo dentro de una sesión. */
export interface SessionModelMetrics {
  count: number;
  inputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  outputTokens: number;
}

/** Resumen de métricas de sesión escrito en session-metrics.json. */
export interface SessionMetrics {
  models: Record<string, SessionModelMetrics>;
}

/**
 * Estado persistente de una interacción en curso, escrito como state.json
 * al crear la interacción y eliminado al cerrar el turno.
 * Permite a herramientas externas detectar interacciones huérfanas por crash.
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
   * Si el raw dump `sse.txt` fue truncado por `MAX_AUDIT_SSE_RAW_BYTES`.
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
  /** True si el archivo de auditoría fue truncado por exceder MAX_AUDIT_RESPONSE_BODY_BYTES. */
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
  isInternalToolStep?: boolean;
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
}
