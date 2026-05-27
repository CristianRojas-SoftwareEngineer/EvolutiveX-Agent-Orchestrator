import { describe, it, expect } from 'vitest';
import { SessionResolverService } from '../../src/1-domain/services/session-resolver.service.js';

describe('SessionResolverService - Resolución de sesión', () => {
  const svc = new SessionResolverService();

  it('debería usar la cabecera primaria (override) si está presente', () => {
    const result = svc.getAuditSessionId({
      'x-cc-audit-session': 'mi-sesion',
      'x-claude-code-session-id': 'sesion-fallback',
    });
    expect(result.sessionId).toBe('mi-sesion');
    expect(result.stripHeaderName).toBe('x-cc-audit-session');
  });

  it('debería usar la cabecera secundaria (fallback) si la primaria no existe', () => {
    const result = svc.getAuditSessionId({
      'x-claude-code-session-id': 'sesion-fb',
    });
    expect(result.sessionId).toBe('sesion-fb');
    expect(result.stripHeaderName).toBe('x-claude-code-session-id');
  });

  it('debería caer a _unknown si no hay cabeceras', () => {
    const result = svc.getAuditSessionId({});
    expect(result.sessionId).toBe('_unknown');
    expect(result.stripHeaderName).toBeNull();
  });

  it('no debería añadir sufijo de hash por defecto', () => {
    const result = svc.getAuditSessionId({
      'x-cc-audit-session': 'mi-sesion',
    });
    expect(result.sessionId).toBe('mi-sesion');
    expect(result.sessionId).not.toMatch(/-[0-9a-f]{8}$/);
  });

  it('debería sanitizar caracteres especiales en el sessionId', () => {
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
    const svc = new SessionResolverService();
    expect(svc.formatAuditInteractionDirName(1)).toBe('01');
    expect(svc.formatAuditInteractionDirName(999999)).toBe('999999');
  });
});
