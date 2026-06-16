import process from 'node:process';
import {
  parseMaxAuditBytes,
  resolveProxyResponseBufferBytes,
} from '../../1-domain/constants/audit-limits.js';
import { ProxyEnvironmentConfig } from '../../1-domain/types/config.types.js';

const DEFAULT_FILTERED_TOOLS = [
  'ScheduleWakeup',
  'NotebookEdit',
  'ExitWorktree',
  'EnterWorktree',
  'CronList',
  'CronDelete',
  'CronCreate',
] as const;

/**
 * Resuelve FILTERED_TOOLS desde entorno.
 * - `undefined`: lista por defecto (7 tools internas de Claude Code).
 * - `""` o solo espacios: sin filtrado (`[]`).
 * - Lista coma-separada: nombres a excluir del request.
 */
function parseFilteredTools(envVal: string | undefined): string[] {
  if (envVal === undefined) return [...DEFAULT_FILTERED_TOOLS];
  if (envVal.trim() === '') return [];
  return envVal
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

const maxAuditBytes = parseMaxAuditBytes(process.env.MAX_AUDIT_BYTES);

/**
 * Objeto de configuración global para el Proxy.
 * Resuelve los ajustes desde variables de entorno con valores seguros por defecto.
 */
export const config: ProxyEnvironmentConfig = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 8787,
  UPSTREAM_ORIGIN: process.env.UPSTREAM_ORIGIN || 'https://api.anthropic.com',
  MAX_REQUEST_BODY: process.env.MAX_REQUEST_BODY || '50mb',
  MAX_AUDIT_BYTES: maxAuditBytes,
  MAX_RESPONSE_BUFFER_BYTES: resolveProxyResponseBufferBytes(maxAuditBytes),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  PROXY_UNREDACT_THINKING: process.env.PROXY_UNREDACT_THINKING === 'true',
  FILTERED_TOOLS: parseFilteredTools(process.env.FILTERED_TOOLS),
  TTS_ENABLED: process.env.TTS_ENABLED !== 'false',
  TTS_CONTEXT_N: process.env.TTS_CONTEXT_N ? parseInt(process.env.TTS_CONTEXT_N, 10) : 3,
  LOG_HTTP_BODIES: process.env.LOG_HTTP_BODIES === 'true',
  LOG_HTTP_HEADERS: process.env.LOG_HTTP_HEADERS !== 'false',
};
