import { describe, it, expect } from 'vitest';
import { SessionResolverService } from '../../src/1-domain/services/session-resolver.service.js';
import { ProxyEnvironmentConfig } from '../../src/1-domain/types/config.types.js';

function makeConfig(overrides: Partial<ProxyEnvironmentConfig> = {}): ProxyEnvironmentConfig {
  return {
    PORT: 8787,
    UPSTREAM_ORIGIN: 'https://api.anthropic.com',
    MAX_REQUEST_BODY: '50mb',
    MAX_RESPONSE_BUFFER_BYTES: 104857600,
    MAX_AUDIT_REQUEST_BODY_BYTES: 52428800,
    MAX_AUDIT_RESPONSE_BODY_BYTES: 52428800,
    MAX_AUDIT_SSE_RAW_BYTES: 52428800,
    AUDIT_SESSION_OVERRIDE_HEADER: 'x-cc-audit-session',
    AUDIT_SESSION_FALLBACK_HEADER: 'x-claude-code-session-id',
    STRIP_AUDIT_SESSION_HEADER: true,
    AUDIT_SESSION_HASH_SUFFIX: false,
    UPSTREAM_ACCEPT_ENCODING: 'identity',
    FILTERED_TOOLS: [],
    ...overrides,
  };
}

describe('SessionResolverService - Resolución de sesión', () => {
  it('debería usar la cabecera primaria (override) si está presente', () => {
    const svc = new SessionResolverService(makeConfig());
    const result = svc.getAuditSessionId({
      'x-cc-audit-session': 'mi-sesion',
      'x-claude-code-session-id': 'sesion-fallback',
    });
    expect(result.sessionId).toBe('mi-sesion');
    expect(result.stripHeaderName).toBe('x-cc-audit-session');
  });

  it('debería usar la cabecera secundaria (fallback) si la primaria no existe', () => {
    const svc = new SessionResolverService(makeConfig());
    const result = svc.getAuditSessionId({
      'x-claude-code-session-id': 'sesion-fb',
    });
    expect(result.sessionId).toBe('sesion-fb');
    expect(result.stripHeaderName).toBe('x-claude-code-session-id');
  });

  it('debería caer a _unknown si no hay cabeceras', () => {
    const svc = new SessionResolverService(makeConfig());
    const result = svc.getAuditSessionId({});
    expect(result.sessionId).toBe('_unknown');
    expect(result.stripHeaderName).toBeNull();
  });

  it('debería deshabilitar el fallback si AUDIT_SESSION_FALLBACK_HEADER=""', () => {
    const svc = new SessionResolverService(makeConfig({ AUDIT_SESSION_FALLBACK_HEADER: '' }));
    const result = svc.getAuditSessionId({
      'x-claude-code-session-id': 'sesion-fb',
    });
    // Con fallback deshabilitado, debería caer a _unknown
    expect(result.sessionId).toBe('_unknown');
  });

  it('debería añadir sufijo de hash si AUDIT_SESSION_HASH_SUFFIX=true', () => {
    const svc = new SessionResolverService(makeConfig({ AUDIT_SESSION_HASH_SUFFIX: true }));
    const result = svc.getAuditSessionId({
      'x-cc-audit-session': 'mi-sesion',
    });
    expect(result.sessionId).toMatch(/^mi-sesion-[0-9a-f]{8}$/);
  });

  it('debería sanitizar caracteres especiales en el sessionId', () => {
    const svc = new SessionResolverService(makeConfig());
    const result = svc.getAuditSessionId({
      'x-cc-audit-session': 'mi<sesion>con:caracteres',
    });
    expect(result.sessionId).not.toContain('<');
    expect(result.sessionId).not.toContain('>');
    expect(result.sessionId).not.toContain(':');
  });
});

describe('SessionResolverService - Formato de directorio', () => {
  it('debería formatear nombres con secuencia zero-padded', () => {
    const svc = new SessionResolverService(makeConfig());
    expect(svc.formatAuditInteractionDirName(1)).toBe('01');
    expect(svc.formatAuditInteractionDirName(999999)).toBe('999999');
  });
});
