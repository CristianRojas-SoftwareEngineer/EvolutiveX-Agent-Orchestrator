import process from 'node:process';
import { ProxyEnvironmentConfig } from '../../1-domain/types/config.types.js';

/**
 * Resuelve un valor numérico de bytes desde una variable de entorno.
 * Semántica: `0 → Infinity` (ilimitado), `NaN`/`negativo` → default.
 */
function parseBytesLimit(envVal: string | undefined, defaultVal: number): number {
  if (envVal === undefined || envVal === '') return defaultVal;
  const n = parseInt(envVal, 10);
  if (Number.isNaN(n) || n < 0) return defaultVal;
  if (n === 0) return Infinity;
  return n;
}

function parsePositiveInt(envVal: string | undefined, defaultVal: number): number {
  if (envVal === undefined || envVal === '') return defaultVal;
  const n = parseInt(envVal, 10);
  if (Number.isNaN(n) || n <= 0) return defaultVal;
  return n;
}

function parseBooleanEnabled(envVal: string | undefined, defaultVal: boolean): boolean {
  if (envVal === undefined || envVal === '') return defaultVal;
  return envVal === '1' || envVal.toLowerCase() === 'true';
}

/**
 * Objeto de configuración global para el Proxy.
 * Resuelve los ajustes desde variables de entorno con valores seguros por defecto.
 */
export const config: ProxyEnvironmentConfig = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 8787,
  UPSTREAM_ORIGIN: process.env.UPSTREAM_ORIGIN || 'https://api.anthropic.com',
  MAX_REQUEST_BODY: process.env.MAX_REQUEST_BODY || '50mb',

  MAX_RESPONSE_BUFFER_BYTES: process.env.MAX_RESPONSE_BUFFER_BYTES
    ? parseInt(process.env.MAX_RESPONSE_BUFFER_BYTES, 10)
    : 104857600,
  MAX_AUDIT_REQUEST_BODY_BYTES: process.env.MAX_AUDIT_REQUEST_BODY_BYTES
    ? parseInt(process.env.MAX_AUDIT_REQUEST_BODY_BYTES, 10)
    : 52428800,
  MAX_AUDIT_RESPONSE_BODY_BYTES: process.env.MAX_AUDIT_RESPONSE_BODY_BYTES
    ? parseInt(process.env.MAX_AUDIT_RESPONSE_BODY_BYTES, 10)
    : 52428800,
  MAX_AUDIT_SSE_RAW_BYTES: parseBytesLimit(process.env.MAX_AUDIT_SSE_RAW_BYTES, 52428800),

  AUDIT_SESSION_OVERRIDE_HEADER: process.env.AUDIT_SESSION_OVERRIDE_HEADER || 'x-cc-audit-session',
  AUDIT_SESSION_FALLBACK_HEADER:
    process.env.AUDIT_SESSION_FALLBACK_HEADER !== undefined
      ? process.env.AUDIT_SESSION_FALLBACK_HEADER
      : 'x-claude-code-session-id',
  STRIP_AUDIT_SESSION_HEADER: process.env.STRIP_AUDIT_SESSION_HEADER !== '0',
  AUDIT_SESSION_HASH_SUFFIX: process.env.AUDIT_SESSION_HASH_SUFFIX === '1',

  UPSTREAM_ACCEPT_ENCODING: process.env.UPSTREAM_ACCEPT_ENCODING || 'identity',

  // Compatibilidad y Logs
  CONSOLE_REDACT: process.env.CONSOLE_REDACT !== '0',
  LOG_SSE: process.env.LOG_SSE === '1',
  MAX_BODY_LOG_BYTES: process.env.MAX_BODY_LOG_BYTES
    ? parseInt(process.env.MAX_BODY_LOG_BYTES, 10)
    : 2048,

  // Unredact thinking content (opt-in, desactivado por defecto)
  PROXY_UNREDACT_THINKING: process.env.PROXY_UNREDACT_THINKING === 'true',

  // Context Sync cache (WebFetch side-request artificial)
  CONTEXT_SYNC_CACHE_ENABLED: parseBooleanEnabled(process.env.CONTEXT_SYNC_CACHE_ENABLED, true),
  CONTEXT_SYNC_MAX_WAIT_MS: parsePositiveInt(process.env.CONTEXT_SYNC_MAX_WAIT_MS, 5000),

  // Filtrado de tools: lista de tool names a excluir del request
  FILTERED_TOOLS: process.env.FILTERED_TOOLS
    ? process.env.FILTERED_TOOLS.split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [
        'ScheduleWakeup',
        'NotebookEdit',
        'ExitWorktree',
        'EnterWorktree',
        'CronList',
        'CronDelete',
        'CronCreate',
      ],
};
