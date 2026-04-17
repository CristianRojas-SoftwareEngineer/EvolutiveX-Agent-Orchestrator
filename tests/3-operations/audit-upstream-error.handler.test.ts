import { describe, it, expect } from 'vitest';
import { AuditUpstreamErrorHandler } from '../../src/3-operations/audit-upstream-error.handler.js';
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

function makeAuditWriter(overrides: Partial<IAuditWriter> = {}): IAuditWriter {
  return {
    writeFileAtomic: async () => {},
    writeJsonAtomic: async () => {},
    writeFormattedAndMarkdown: async () => {},
    writeRequestAudit: async () => ({ dir: '', requestBodyOmitted: false }),
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

describe('AuditUpstreamErrorHandler', () => {
  it('debería no hacer nada si AUDIT_ENABLED=false', async () => {
    const config = makeConfig({ AUDIT_ENABLED: false });
    let writeCalled = false;
    const handler = new AuditUpstreamErrorHandler(
      makeAuditWriter({
        writeUpstreamFailureMeta: async () => {
          writeCalled = true;
        },
      }),
      config,
    );

    await handler.execute({
      auditRequestDir: '/tmp/test',
      requestId: 'req-1',
      requestSequence: 1,
      auditSessionId: 'test',
      error: Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }),
      requestStartTime: Date.now(),
      method: 'POST',
      url: '/v1/messages',
      requestBodyBytes: 100,
      requestBodyOmitted: false,
    });

    expect(writeCalled).toBe(false);
  });

  it('debería delegar a writeUpstreamFailureMeta con los params correctos', async () => {
    const config = makeConfig();
    let capturedDir: string | null = null;
    let capturedPayload: unknown = null;

    const handler = new AuditUpstreamErrorHandler(
      makeAuditWriter({
        writeUpstreamFailureMeta: async (dir, payload) => {
          capturedDir = dir;
          capturedPayload = payload;
        },
      }),
      config,
    );

    const err = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    await handler.execute({
      auditRequestDir: '/tmp/sessions/s/requests/000001_req-1',
      requestId: 'req-1',
      requestSequence: 1,
      auditSessionId: 'test-session',
      error: err,
      requestStartTime: Date.now() - 100,
      method: 'POST',
      url: '/v1/messages',
      requestBodyBytes: 500,
      requestBodyOmitted: false,
    });

    expect(capturedDir).toBe('/tmp/sessions/s/requests/000001_req-1');
    expect(capturedPayload).not.toBeNull();
    expect((capturedPayload as Record<string, unknown>).requestId).toBe('req-1');
  });
});
