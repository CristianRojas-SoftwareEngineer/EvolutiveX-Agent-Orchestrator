import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { AuditSseResponseHandler } from '../../src/3-operations/audit-sse-response.handler.js';
import type { IAuditWriter } from '../../src/2-services/ports/audit-writer.port.js';
import type { ISseReconstructor } from '../../src/2-services/ports/sse-reconstructor.port.js';
import { ProxyEnvironmentConfig } from '../../src/1-domain/types/config.types.js';
import { AuditRequestContext } from '../../src/1-domain/types/audit.types.js';

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

function makeSseReconstructor(overrides: Partial<ISseReconstructor> = {}): ISseReconstructor {
  return {
    runReconstruction: async () => ({
      sseResponseBodyAttempted: false,
      sseResponseBodyWritten: false,
    }),
    ...overrides,
  };
}

describe('AuditSseResponseHandler', () => {
  it('debería no hacer nada si AUDIT_ENABLED=false', () => {
    const config = makeConfig({ AUDIT_ENABLED: false });
    const appendedLines: unknown[] = [];
    const handler = new AuditSseResponseHandler(
      makeAuditWriter({
        appendSseLine: (_dir, line) => {
          appendedLines.push(line);
        },
      }),
      makeSseReconstructor(),
      config,
    );

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), {});
    stream.write('data: test\n\n');
    stream.end();

    expect(appendedLines).toHaveLength(0);
  });

  it('debería capturar líneas SSE y escribir meta al finalizar', async () => {
    const config = makeConfig();
    const appendedLines: unknown[] = [];
    let metaWritten = false;

    const handler = new AuditSseResponseHandler(
      makeAuditWriter({
        appendSseLine: (_dir, line) => {
          appendedLines.push(line);
        },
        writeResponseHeadersAudit: async () => {},
        writeMetaAtomic: async () => {
          metaWritten = true;
        },
      }),
      makeSseReconstructor(),
      config,
    );

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), { 'content-type': 'text/event-stream' });
    stream.write('event: message_start\n');
    stream.write('data: {"type":"message_start"}\n');
    stream.write('\n');
    stream.end();

    // Esperar a que el handler procese el stream
    await new Promise((r) => setTimeout(r, 100));

    expect(appendedLines.length).toBeGreaterThanOrEqual(2);
    expect(metaWritten).toBe(true);
  });

  it('debería invocar reconstrucción SSE si AUDIT_SSE_RESPONSE_BODY=true', async () => {
    const config = makeConfig({ AUDIT_SSE_RESPONSE_BODY: true, AUDIT_SSE_RAW: true });
    let reconstructCalled = false;

    const handler = new AuditSseResponseHandler(
      makeAuditWriter(),
      makeSseReconstructor({
        runReconstruction: async () => {
          reconstructCalled = true;
          return { sseResponseBodyAttempted: true, sseResponseBodyWritten: true };
        },
      }),
      config,
    );

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), {});
    stream.write('data: test\n\n');
    stream.end();

    await new Promise((r) => setTimeout(r, 100));
    expect(reconstructCalled).toBe(true);
  });
});
