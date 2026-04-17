import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { AuditStandardResponseHandler } from '../../src/3-operations/audit-standard-response.handler.js';
import type { IAuditWriter } from '../../src/2-services/ports/audit-writer.port.js';
import { ProxyEnvironmentConfig } from '../../src/1-domain/types/config.types.js';
import { AuditRequestContext } from '../../src/1-domain/types/audit.types.js';

function makeConfig(overrides: Partial<ProxyEnvironmentConfig> = {}): ProxyEnvironmentConfig {
  return {
    PORT: 8787,
    UPSTREAM_ORIGIN: 'https://api.anthropic.com',
    AUDIT_SESSIONS_DIR: 'sessions',
    MAX_REQUEST_BODY: '50mb',
    MAX_RESPONSE_BUFFER_BYTES: 1024,
    MAX_AUDIT_REQUEST_BODY_BYTES: 52428800,
    MAX_AUDIT_RESPONSE_BODY_BYTES: 512,
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

function makeContext(overrides: Partial<AuditRequestContext> = {}): AuditRequestContext {
  return {
    requestId: 'req-1',
    requestSequence: 1,
    auditSessionId: 'test-session',
    method: 'POST',
    url: '/v1/messages',
    upstream: 'https://api.anthropic.com',
    requestStartTime: Date.now(),
    requestBodyBytes: 100,
    requestBodyOmitted: false,
    auditRequestDir: '/tmp/sessions/test/requests/000001_req-1',
    responseStatusCode: 200,
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

describe('AuditStandardResponseHandler', () => {
  it('debería no hacer nada si AUDIT_ENABLED=false', () => {
    const config = makeConfig({ AUDIT_ENABLED: false });
    let finalized = false;
    const handler = new AuditStandardResponseHandler(
      makeAuditWriter({
        finalizeNonSseResponseAudit: async () => {
          finalized = true;
          return {
            responseBodyBytesAudited: 0,
            responseTruncatedByProxyBuffer: false,
            responseTruncatedByAuditLimit: false,
          };
        },
      }),
      config,
    );

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), 'application/json');
    stream.write('{"ok":true}');
    stream.end();

    // No debería invocar finalizeNonSseResponseAudit
    expect(finalized).toBe(false);
  });

  it('debería acumular datos y finalizar auditoría al terminar el stream', async () => {
    const config = makeConfig();
    let finalizeParams: unknown = null;
    let metaWritten = false;

    const handler = new AuditStandardResponseHandler(
      makeAuditWriter({
        finalizeNonSseResponseAudit: async (params) => {
          finalizeParams = params;
          return {
            responseBodyBytesAudited: params.bodyBuffer.length,
            responseTruncatedByProxyBuffer: false,
            responseTruncatedByAuditLimit: false,
          };
        },
        writeMetaAtomic: async () => {
          metaWritten = true;
        },
      }),
      config,
    );

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), 'application/json');
    stream.write(Buffer.from('{"message":"hello"}'));
    stream.end();

    await new Promise((r) => setTimeout(r, 100));

    expect(finalizeParams).not.toBeNull();
    expect(metaWritten).toBe(true);
  });

  it('debería respetar MAX_RESPONSE_BUFFER_BYTES al acumular chunks', async () => {
    const config = makeConfig({ MAX_RESPONSE_BUFFER_BYTES: 10 });
    let finalizeParams: { bodyBuffer: Buffer; totalBytes: number } | null = null;

    const handler = new AuditStandardResponseHandler(
      makeAuditWriter({
        finalizeNonSseResponseAudit: async (params) => {
          finalizeParams = params as { bodyBuffer: Buffer; totalBytes: number };
          return {
            responseBodyBytesAudited: params.bodyBuffer.length,
            responseTruncatedByProxyBuffer: true,
            responseTruncatedByAuditLimit: false,
          };
        },
        writeMetaAtomic: async () => {},
      }),
      config,
    );

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), 'application/json');
    stream.write(Buffer.alloc(5, 'a'));
    stream.write(Buffer.alloc(5, 'b'));
    stream.write(Buffer.alloc(20, 'c'));
    stream.end();

    await new Promise((r) => setTimeout(r, 100));

    expect(finalizeParams).not.toBeNull();
    expect(finalizeParams!.totalBytes).toBe(30);
    expect(finalizeParams!.bodyBuffer.length).toBe(10);
  });
});
