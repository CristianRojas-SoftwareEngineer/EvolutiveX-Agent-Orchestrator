import type { ProxyEnvironmentConfig } from '../../src/1-domain/types/config.types.js';
import { resolveProxyResponseBufferBytes } from '../../src/1-domain/constants/audit-limits.js';

/** Config mínima para tests de handlers y operaciones. */
export function makeTestConfig(
  overrides: Partial<ProxyEnvironmentConfig> = {},
): ProxyEnvironmentConfig {
  const maxAuditBytes = overrides.MAX_AUDIT_BYTES ?? 52_428_800;
  return {
    PORT: 8787,
    UPSTREAM_ORIGIN: 'https://api.anthropic.com',
    MAX_REQUEST_BODY: '50mb',
    MAX_AUDIT_BYTES: maxAuditBytes,
    MAX_RESPONSE_BUFFER_BYTES:
      overrides.MAX_RESPONSE_BUFFER_BYTES ?? resolveProxyResponseBufferBytes(maxAuditBytes),
    LOG_LEVEL: 'info',
    FILTERED_TOOLS: [],
    ...overrides,
  };
}
