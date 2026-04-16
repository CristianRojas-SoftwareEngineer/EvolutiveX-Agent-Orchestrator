import process from 'process';
import { ProxyEnvironmentConfig } from '../interfaces/config.interface';

/**
 * Objeto de configuración global para el Proxy.
 * Resuelve los ajustes desde variables de entorno con valores seguros por defecto.
 */
export const config: ProxyEnvironmentConfig = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 8787,
  UPSTREAM_ORIGIN: process.env.UPSTREAM_ORIGIN || 'https://api.anthropic.com',
  AUDIT_SESSIONS_DIR: process.env.AUDIT_SESSIONS_DIR || 'sessions',
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
  MAX_AUDIT_SSE_RAW_BYTES: process.env.MAX_AUDIT_SSE_RAW_BYTES
    ? parseInt(process.env.MAX_AUDIT_SSE_RAW_BYTES, 10)
    : 52428800,

  AUDIT_ENABLED: process.env.AUDIT_ENABLED !== '0',
  AUDIT_SSE_RAW: process.env.AUDIT_SSE_RAW === '1',

  AUDIT_SESSION_OVERRIDE_HEADER: process.env.AUDIT_SESSION_OVERRIDE_HEADER || 'x-cc-audit-session',
  AUDIT_SESSION_FALLBACK_HEADER:
    process.env.AUDIT_SESSION_FALLBACK_HEADER || 'x-claude-code-session-id',
  DEFAULT_AUDIT_SESSION: process.env.DEFAULT_AUDIT_SESSION || '',
  STRIP_AUDIT_SESSION_HEADER: process.env.STRIP_AUDIT_SESSION_HEADER !== '0',
  AUDIT_SESSION_HASH_SUFFIX: process.env.AUDIT_SESSION_HASH_SUFFIX === '1',

  UPSTREAM_ACCEPT_ENCODING: process.env.UPSTREAM_ACCEPT_ENCODING || 'identity',
};
