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
 * Opciones para la reconstrucción del cuerpo de respuesta desde bytes SSE.
 */
export interface SseReconstructOptions {
  /** Directorio de la petición donde se encuentran los archivos SSE. */
  requestDir: string;
  /** URL original de la petición (para detectar beta). */
  originalUrl?: string;
  /** Cabeceras originales de la petición (para detectar anthropic-beta). */
  headers?: Record<string, string | string[] | undefined>;
  /** Forzar uso de API beta para la reconstrucción. */
  forceBeta?: boolean;
  /** Bytes crudos SSE escritos en disco. */
  sseRawBytesWritten: number;
  /** Si la captura cruda de SSE está activa. */
  auditSseRaw: boolean;
  /** Si el volcado crudo de SSE fue truncado por límite. */
  sseRawTruncatedByLimit: boolean;
  /** Si hubo un error de escritura durante la captura cruda. */
  sseRawWriteError: boolean;
  /** Si se requiere el raw para la reconstrucción. */
  requireRaw: boolean;
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
  sseRawBytesAudited?: number | null;
  /** El límite aplicado al volcado crudo de SSE. null cuando el límite es infinito. */
  sseRawBytesLimit?: number | null;
  /** True si el volcado crudo de SSE fue cortado por el límite. */
  sseRawTruncatedByLimit?: boolean;
  /** True si ocurrió un error de escritura durante la captura cruda de SSE. */
  sseRawWriteError?: boolean;
}

/**
 * El objeto de informe final guardado como `meta.json` en el directorio de auditoría.
 */
export interface AuditMetadata {
  /** ID interno de la petición en Fastify. */
  requestId: string;
  /** Número secuencial dentro de la sesión específica. */
  requestSequence: number;
  /** El ID de la sesión a la que pertenece esta petición. */
  auditSessionId: string;
  /** Método HTTP (GET, POST, etc.). */
  method: string;
  /** URL de la petición. */
  url: string;
  /** La URL del origin upstream. */
  upstream: string;
  /** Timestamp ISO del inicio de la petición. */
  startedAt: string;
  /** Timestamp ISO de la finalización de la respuesta. */
  endedAt: string;
  /** Tiempo total de reloj en milisegundos. */
  durationMs: number;
  /** Código de estado HTTP devuelto por el upstream. */
  statusCode: number | null;
  /** True si la respuesta fue un stream SSE. */
  sse: boolean;
  /** Tamaño en bytes del cuerpo de la petición. */
  requestBodyBytes: number;
  /** True si se recibió la respuesta inicial del upstream. */
  responseReceived: boolean;
  /** True si el cuerpo/stream de respuesta completo terminó sin errores. */
  responseBodyComplete?: boolean;
  /** True si hubo un error de comunicación con el upstream. */
  upstreamError?: boolean;
  /** Mensaje de error legible si el proxy falló. */
  errorMessage?: string;
  /** Código de error si aplica. */
  errorCode?: string;
  /** Si se intentó la reconstrucción SSE del cuerpo de respuesta. */
  sseResponseBodyAttempted?: boolean;
  /** Si se escribió exitosamente el cuerpo reconstruido desde SSE. */
  sseResponseBodyWritten?: boolean;
  /** Mensaje de error de la reconstrucción SSE. */
  sseResponseBodyError?: string;
  /** Fuente de los bytes SSE usados para la reconstrucción. */
  sseResponseBodySource?: string;
  /** Detalles sobre cualquier truncamiento de datos. */
  truncation: AuditTruncationMeta;
  /** Soporta extensiones arbitrarias (ej. sseLineCount). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * Contexto de petición que los handlers de Capa 3 reciben del controller.
 * Desacopla los handlers de Fastify.
 */
export interface AuditRequestContext {
  requestId: string;
  requestSequence: number;
  auditSessionId: string;
  method: string;
  url: string;
  upstream: string;
  requestStartTime: number;
  requestBodyBytes: number;
  requestBodyOmitted: boolean;
  auditRequestDir: string;
  responseStatusCode: number | null;
}
