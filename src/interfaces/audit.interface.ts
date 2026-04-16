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
  /** El límite aplicado al volcado crudo de SSE. */
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
  /** Detalles sobre cualquier truncamiento de datos. */
  truncation: AuditTruncationMeta;
  /** Soporta extensiones arbitrarias (ej. sseLineCount). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

declare module 'fastify' {
  interface FastifyRequest {
    auditSessionId?: string;
    auditRequestDir?: string;
    requestSequence?: number;
    requestStartTime?: number;
    requestBodyOmitted?: boolean;
  }
}
