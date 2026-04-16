/**
 * Esquema de configuración para el Entorno del Proxy.
 * Mapea las variables de entorno a ajustes de aplicación fuertemente tipados.
 */
export interface ProxyEnvironmentConfig {
  /** El puerto en el que el servidor proxy escuchará. Por defecto: 8787 */
  PORT: number;

  /** La URL de destino (ej. https://api.anthropic.com) a la que se redirigen las peticiones. */
  UPSTREAM_ORIGIN: string;

  /** Directorio raíz para guardar los logs de auditoría de sesión. Por defecto: 'sessions' */
  AUDIT_SESSIONS_DIR: string;

  /** Tamaño máximo del cuerpo de petición que Fastify acepta en memoria (ej. '50mb') */
  MAX_REQUEST_BODY: string;

  /** Buffer de memoria máximo para interceptar respuestas que no sean SSE. */
  MAX_RESPONSE_BUFFER_BYTES: number;

  /** Límite para guardar el cuerpo de la petición en disco (request.body.bin). */
  MAX_AUDIT_REQUEST_BODY_BYTES: number;

  /** Límite para guardar el cuerpo de la respuesta en disco (response.body.json). */
  MAX_AUDIT_RESPONSE_BODY_BYTES: number;

  /** Límite para guardar el volcado binario crudo de SSE en disco (response.sse.txt). */
  MAX_AUDIT_SSE_RAW_BYTES: number;

  /** Interruptor maestro global para la auditoría en disco. */
  AUDIT_ENABLED: boolean;

  /** Indica si se debe guardar el stream binario crudo de las respuestas SSE. */
  AUDIT_SSE_RAW: boolean;

  /** Si es true, añade un hash corto a los nombres de directorio de sesión para prevenir colisiones. */
  AUDIT_SESSION_HASH_SUFFIX: boolean;

  /** Cabecera primaria para resolver el Session ID (ej. x-cc-audit-session). */
  AUDIT_SESSION_OVERRIDE_HEADER: string;

  /** Cabecera secundaria para resolver el Session ID si la primaria no existe. */
  AUDIT_SESSION_FALLBACK_HEADER?: string;

  /** Nombre por defecto de la carpeta de sesión si no hay cabeceras que coincidan. */
  DEFAULT_AUDIT_SESSION: string;

  /** Si es true, elimina las cabeceras de sesión antes de reenviar al upstream. */
  STRIP_AUDIT_SESSION_HEADER: boolean;

  /** Control de compresión (gzip, identity) al comunicarse con el upstream. */
  UPSTREAM_ACCEPT_ENCODING: string;
}
