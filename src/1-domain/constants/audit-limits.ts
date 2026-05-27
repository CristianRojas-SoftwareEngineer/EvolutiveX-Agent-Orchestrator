/** Tope por defecto de volcado en disco bajo `sessions/` (50 MiB). */
export const DEFAULT_MAX_AUDIT_BYTES = 52_428_800;

/** Techo de buffer en memoria para respuestas no-SSE (100 MiB). */
export const DEFAULT_PROXY_BUFFER_CEILING_BYTES = 104_857_600;

/**
 * Buffer en memoria del proxy: al menos el tope de auditoría y el techo interno.
 * No es variable de entorno; ver `docs/advanced-configuration.md` para excepciones.
 */
export function resolveProxyResponseBufferBytes(maxAuditBytes: number): number {
  return Math.max(maxAuditBytes, DEFAULT_PROXY_BUFFER_CEILING_BYTES);
}

/**
 * Parsea `MAX_AUDIT_BYTES` desde entorno. Valores inválidos o negativos → default.
 */
export function parseMaxAuditBytes(envVal: string | undefined): number {
  if (envVal === undefined || envVal === '') return DEFAULT_MAX_AUDIT_BYTES;
  const n = parseInt(envVal, 10);
  if (Number.isNaN(n) || n < 0) return DEFAULT_MAX_AUDIT_BYTES;
  return n;
}
