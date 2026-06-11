/**
 * Esquema de configuración para el Entorno del Proxy.
 * Solo incluye variables de entorno públicas y límites derivados en arranque.
 */
export interface ProxyEnvironmentConfig {
  /** El puerto en el que el servidor proxy escuchará. Por defecto: 8787 */
  PORT: number;

  /** La URL de destino (ej. https://api.anthropic.com) a la que se redirigen las peticiones. */
  UPSTREAM_ORIGIN: string;

  /** Tamaño máximo del cuerpo de petición que Fastify acepta en memoria (ej. '50mb') */
  MAX_REQUEST_BODY: string;

  /** Tope único de volcado en disco (request, response, sse.txt raw). Env: `MAX_AUDIT_BYTES`. */
  MAX_AUDIT_BYTES: number;

  /** Buffer en memoria para respuestas no-SSE; derivado de `MAX_AUDIT_BYTES`, no configurable por env. */
  MAX_RESPONSE_BUFFER_BYTES: number;

  /** Nivel de log Pino (consola y `server/logs.jsonl`). Env: `LOG_LEVEL`. */
  LOG_LEVEL: string;

  /** Si es true, remueve el flag redact-thinking-2026-02-12 del header anthropic-beta para capturar thinking legible. */
  PROXY_UNREDACT_THINKING?: boolean;

  /**
   * Tool names a excluir del request antes de enviar a la API.
   * En entorno: omitir la variable = lista por defecto; `FILTERED_TOOLS=""` = sin filtrado.
   */
  FILTERED_TOOLS: string[];

  /** Activar o desactivar las notificaciones por voz (TTS). Env: `TTS_ENABLED`. */
  TTS_ENABLED?: boolean;

  /** Número de últimos mensajes a leer del transcript para contexto. Env: `TTS_CONTEXT_N`. */
  TTS_CONTEXT_N?: number;

  /** Activar logging del body de request. Default: false. Env: `LOG_HTTP_BODIES`. */
  LOG_HTTP_BODIES?: boolean;
  /** Activar logging de headers request+response. Default: true. Env: `LOG_HTTP_HEADERS`. */
  LOG_HTTP_HEADERS?: boolean;
  /** Nivel dedicado para los logs del plugin http-logger. Default: 'info'. Env: `LOG_HTTP_LEVEL`. */
  LOG_HTTP_LEVEL?: 'info' | 'debug';
}
