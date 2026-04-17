import { describe, it, expect } from 'vitest';
import { AuditRequestHandler } from '../../src/3-operations/audit-request.handler.js';
import { SessionResolverService } from '../../src/1-domain/services/session-resolver.service.js';
import type { ISessionStore } from '../../src/2-services/ports/session-store.port.js';
import type { IAuditWriter } from '../../src/2-services/ports/audit-writer.port.js';
import { ProxyEnvironmentConfig } from '../../src/1-domain/types/config.types.js';

function makeConfig(overrides: Partial<ProxyEnvironmentConfig> = {}): ProxyEnvironmentConfig {
  return {
    PORT: 8787,
    UPSTREAM_ORIGIN: 'https://api.anthropic.com',
    AUDIT_SESSIONS_DIR: 'sessions',
    MAX_REQUEST_BODY: '50mb',
    MAX_RESPONSE_BUFFER_BYTES: 104857600,
    MAX_AUDIT_REQUEST_BODY_BYTES: 52428800,
    MAX_AUDIT_RESPONSE_BODY_BYTES: 52428800,
    MAX_AUDIT_SSE_RAW_BYTES: 52428800,
    AUDIT_ENABLED: true,
    AUDIT_SSE_RAW: false,
    AUDIT_SESSION_OVERRIDE_HEADER: 'x-cc-audit-session',
    AUDIT_SESSION_FALLBACK_HEADER: 'x-claude-code-session-id',
    DEFAULT_AUDIT_SESSION: '',
    STRIP_AUDIT_SESSION_HEADER: true,
    AUDIT_SESSION_HASH_SUFFIX: false,
    UPSTREAM_ACCEPT_ENCODING: 'identity',
    AUDIT_SSE_RESPONSE_BODY: false,
    AUDIT_SSE_RESPONSE_BODY_REQUIRE_RAW: true,
    AUDIT_SSE_RESPONSE_BODY_FORCE_BETA: false,
    AUDIT_SSE_REPLAY_MODEL: 'claude-3-5-sonnet-20241022',
    CONSOLE_REDACT: true,
    LOG_SSE: false,
    MAX_BODY_LOG_BYTES: 2048,
    ...overrides,
  };
}

function makeSessionStore(overrides: Partial<ISessionStore> = {}): ISessionStore {
  return {
    getBaseDir: () => '/tmp/sessions',
    ensureAuditSessionsRoot: async () => {},
    nextAuditRequestSequence: async () => 1,
    ...overrides,
  };
}

function makeAuditWriter(overrides: Partial<IAuditWriter> = {}): IAuditWriter {
  return {
    writeFileAtomic: async () => {},
    writeJsonAtomic: async () => {},
    writeFormattedAndMarkdown: async () => {},
    writeRequestAudit: async () => ({
      dir: '/tmp/sessions/s/requests/000001_req',
      requestBodyOmitted: false,
    }),
    finalizeNonSseResponseAudit: async () => ({
      responseBodyBytesAudited: 0,
      responseTruncatedByProxyBuffer: false,
      responseTruncatedByAuditLimit: false,
    }),
    finalizeNonSseResponseAuditOnStreamError: async () => ({
      responseBodyBytesAudited: 0,
      responseTruncatedByProxyBuffer: false,
      responseTruncatedByAuditLimit: false,
    }),
    writeUpstreamFailureMeta: async () => {},
    writeResponseHeadersAudit: async () => {},
    writeMetaAtomic: async () => {},
    appendSseLine: () => {},
    appendSseRawChunk: async () => {},
    ...overrides,
  };
}

describe('AuditRequestHandler', () => {
  it('debería retornar null si AUDIT_ENABLED=false', async () => {
    const config = makeConfig({ AUDIT_ENABLED: false });
    const handler = new AuditRequestHandler(
      new SessionResolverService(config),
      makeSessionStore(),
      makeAuditWriter(),
      config,
    );
    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 'test' },
      rawBody: Buffer.from('{}'),
      requestId: 'req-1',
    });
    expect(result).toBeNull();
  });

  it('debería resolver sesión, asignar secuencia y escribir auditoría', async () => {
    const config = makeConfig();
    let writtenParams: unknown = null;
    const handler = new AuditRequestHandler(
      new SessionResolverService(config),
      makeSessionStore({ nextAuditRequestSequence: async () => 5 }),
      makeAuditWriter({
        writeRequestAudit: async (params) => {
          writtenParams = params;
          return { dir: '/tmp/sessions/test/requests/000005_req-1', requestBodyOmitted: false };
        },
      }),
      config,
    );

    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 'my-session' },
      rawBody: Buffer.from('{"model":"claude"}'),
      requestId: 'req-1',
    });

    expect(result).not.toBeNull();
    expect(result!.auditSessionId).toBe('my-session');
    expect(result!.requestSequence).toBe(5);
    expect(result!.requestBodyOmitted).toBe(false);
    expect(writtenParams).not.toBeNull();
  });

  it('debería strip header de sesión si STRIP_AUDIT_SESSION_HEADER=true', async () => {
    const config = makeConfig({ STRIP_AUDIT_SESSION_HEADER: true });
    const headers: Record<string, string | string[] | undefined> = {
      'x-cc-audit-session': 'my-session',
      'content-type': 'application/json',
    };

    const handler = new AuditRequestHandler(
      new SessionResolverService(config),
      makeSessionStore(),
      makeAuditWriter(),
      config,
    );

    await handler.execute({ headers, rawBody: Buffer.alloc(0), requestId: 'req-2' });
    expect(headers['x-cc-audit-session']).toBeUndefined();
    expect(headers['content-type']).toBe('application/json');
  });
});
