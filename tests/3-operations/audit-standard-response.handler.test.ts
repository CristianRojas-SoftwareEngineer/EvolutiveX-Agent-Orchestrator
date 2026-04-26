import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { AuditStandardResponseHandler } from '../../src/3-operations/audit-standard-response.handler.js';
import type { IAuditWriter } from '../../src/2-services/ports/audit-writer.port.js';
import type { ISessionStore } from '../../src/2-services/ports/session-store.port.js';
import { ProxyEnvironmentConfig } from '../../src/1-domain/types/config.types.js';
import { AuditInteractionContext, ActiveTurn, StepMeta } from '../../src/1-domain/types/audit.types.js';

function makeConfig(overrides: Partial<ProxyEnvironmentConfig> = {}): ProxyEnvironmentConfig {
  return {
    PORT: 8787,
    UPSTREAM_ORIGIN: 'https://api.anthropic.com',
    MAX_REQUEST_BODY: '50mb',
    MAX_RESPONSE_BUFFER_BYTES: 1024,
    MAX_AUDIT_REQUEST_BODY_BYTES: 52428800,
    MAX_AUDIT_RESPONSE_BODY_BYTES: 512,
    MAX_AUDIT_SSE_RAW_BYTES: 52428800,
    AUDIT_SESSION_OVERRIDE_HEADER: 'x-cc-audit-session',
    AUDIT_SESSION_FALLBACK_HEADER: 'x-claude-code-session-id',
    DEFAULT_AUDIT_SESSION: '',
    STRIP_AUDIT_SESSION_HEADER: true,
    AUDIT_SESSION_HASH_SUFFIX: false,
    UPSTREAM_ACCEPT_ENCODING: 'identity',
    CONSOLE_REDACT: true,
    LOG_SSE: false,
    MAX_BODY_LOG_BYTES: 2048,
    FILTERED_TOOLS: [],
    ...overrides,
  };
}

function makeActiveTurn(overrides: Partial<ActiveTurn> = {}): ActiveTurn {
  return {
    interactionDir: '/tmp/sessions/test/interactions/000001_req-1',
    interactionType: 'agentic-turn',
    stepCount: 1,
    requestSequence: 1,
    startedAt: Date.now(),
    requestBodyOmitted: false,
    requestBodyBytes: 100,
    stepsMeta: [],
    ...overrides,
  };
}

function makeContext(overrides: Partial<AuditInteractionContext> = {}): AuditInteractionContext {
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
    auditInteractionDir: '/tmp/sessions/test/interactions/000001_req-1',
    responseStatusCode: 200,
    interactionType: 'agentic-turn',
    ...overrides,
  };
}

function makeSessionStore(turn: ActiveTurn | null = makeActiveTurn(), overrides: Partial<ISessionStore> = {}): ISessionStore {
  const registry = new Map<string, ActiveTurn>();
  const toolUseIndex = new Map<string, string>();
  if (turn) registry.set(turn.interactionDir, turn);
  return {
    getBaseDir: () => '/tmp/sessions',
    ensureAuditSessionsRoot: async () => {},
    nextAuditInteractionSequence: async () => 1,
    registerTurn: (t: ActiveTurn) => { registry.set(t.interactionDir, t); },
    registerToolUseId: (id: string, dir: string) => { toolUseIndex.set(id, dir); },
    getTurnByToolUseId: (id: string) => { const dir = toolUseIndex.get(id); return dir ? (registry.get(dir) ?? null) : null; },
    getTurnByDir: async (dir: string) => registry.get(dir) || null,
    getTurnByDirSync: (dir: string) => registry.get(dir) || null,
    incrementStepCountByDir: (dir: string) => { const t = registry.get(dir); if (t) t.stepCount += 1; return t?.stepCount ?? 1; },
    pushStepMetaByDir: async (dir: string, meta: StepMeta) => { registry.get(dir)?.stepsMeta.push(meta); },
    closeTurn: (dir: string) => { registry.delete(dir); for (const [id, d] of toolUseIndex) { if (d === dir) toolUseIndex.delete(id); } },
    ...overrides,
  };
}

function makeAuditWriter(overrides: Partial<IAuditWriter> = {}): IAuditWriter {
  return {
    writeFileAtomic: async () => {},
    writeJsonAtomic: async () => {},
    writeFormattedAndMarkdown: async () => {},
    writeInteractionRequest: async () => ({ dir: '', requestBodyOmitted: false }),
    writeStepRequest: async () => {},
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
    writeResponseHeadersAudit: async () => {},
    writeTurnMeta: async () => {},
    appendSseLine: () => {},
    appendSseRawChunk: () => {},
    writeInteractionState: async () => {},
    removeInteractionState: async () => {},
    writeStepResponseMarkdown: async () => {},
    writeTopLevelMultiStepResponse: async () => ({ written: true }),
    ...overrides,
  };
}

describe('AuditStandardResponseHandler', () => {
  it('debería escribir en step dir (finalizeNonSseResponseAudit) y top-level (writeTopLevelMultiStepResponse), y cerrar turno (terminal)', async () => {
    const config = makeConfig();
    const finalizedDirs: string[] = [];
    let topLevelCalls = 0;
    let turnMetaWritten = false;
    let turnCleared = false;

    const handler = new AuditStandardResponseHandler(
      makeAuditWriter({
        finalizeNonSseResponseAudit: async (params) => {
          finalizedDirs.push(params.interactionDir);
          return { responseBodyBytesAudited: params.bodyBuffer.length, responseTruncatedByProxyBuffer: false, responseTruncatedByAuditLimit: false };
        },
        writeTopLevelMultiStepResponse: async () => {
          topLevelCalls++;
          return { written: true };
        },
        writeTurnMeta: async () => { turnMetaWritten = true; },
      }),
      config,
      makeSessionStore(makeActiveTurn(), {
        closeTurn: (_dir: string) => { turnCleared = true; },
      }),
    );

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), 'application/json');
    stream.write(Buffer.from('{"message":"hello"}'));
    stream.end();

    await new Promise((r) => setTimeout(r, 100));

    // Step dir: finalizeNonSseResponseAudit llamado 1 vez
    expect(finalizedDirs).toHaveLength(1);
    expect(finalizedDirs[0]).toMatch(/steps[/\\]001/);
    // Top-level: writeTopLevelMultiStepResponse llamado 1 vez
    expect(topLevelCalls).toBe(1);
    expect(turnMetaWritten).toBe(true);
    expect(turnCleared).toBe(true);
  });

  it('debería respetar MAX_RESPONSE_BUFFER_BYTES al acumular chunks', async () => {
    const config = makeConfig({ MAX_RESPONSE_BUFFER_BYTES: 10 });
    let capturedTotalBytes: number | null = null;
    let capturedBufferLength: number | null = null;

    const handler = new AuditStandardResponseHandler(
      makeAuditWriter({
        finalizeNonSseResponseAudit: async (params) => {
          if (capturedTotalBytes === null) {
            capturedTotalBytes = params.totalBytes;
            capturedBufferLength = params.bodyBuffer.length;
          }
          return { responseBodyBytesAudited: params.bodyBuffer.length, responseTruncatedByProxyBuffer: true, responseTruncatedByAuditLimit: false };
        },
      }),
      config,
      makeSessionStore(),
    );

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), 'application/json');
    stream.write(Buffer.alloc(5, 'a'));
    stream.write(Buffer.alloc(5, 'b'));
    stream.write(Buffer.alloc(20, 'c'));
    stream.end();

    await new Promise((r) => setTimeout(r, 100));

    expect(capturedTotalBytes).toBe(30);
    expect(capturedBufferLength).toBe(10);
  });

  it('debería llamar removeInteractionState al cerrar turno agentic terminal', async () => {
    const config = makeConfig();
    let removeCalled = false;

    const handler = new AuditStandardResponseHandler(
      makeAuditWriter({
        finalizeNonSseResponseAudit: async () => ({
          responseBodyBytesAudited: 10,
          responseTruncatedByProxyBuffer: false,
          responseTruncatedByAuditLimit: false,
        }),
        removeInteractionState: async () => { removeCalled = true; },
      }),
      config,
      makeSessionStore(),
    );

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), 'application/json');
    stream.write(Buffer.from('{"message":"hello"}'));
    stream.end();

    await new Promise((r) => setTimeout(r, 100));
    expect(removeCalled).toBe(true);
  });

  it('debería cerrar turno preflight inmediatamente y escribir turnMeta', async () => {
    const config = makeConfig();
    let turnMetaWritten = false;
    let turnClosed = false;
    let stepMetaPushed: StepMeta | null = null;
    const preflightTurn = makeActiveTurn({ interactionType: 'client-preflight' });

    const handler = new AuditStandardResponseHandler(
      makeAuditWriter({ writeTurnMeta: async () => { turnMetaWritten = true; } }),
      config,
      makeSessionStore(preflightTurn, {
        pushStepMetaByDir: async (_dir, meta) => { stepMetaPushed = meta; preflightTurn.stepsMeta.push(meta); },
        closeTurn: () => { turnClosed = true; },
      }),
    );

    const stream = new PassThrough();
    handler.execute(
      stream,
      makeContext({ interactionType: 'client-preflight', turnClassification: { type: 'preflight-quota' } }),
      'application/json',
    );
    stream.write('{"ok":true}');
    stream.end();

    await new Promise((r) => setTimeout(r, 100));

    expect(turnMetaWritten).toBe(true);
    expect(turnClosed).toBe(true);
    expect(stepMetaPushed).not.toBeNull();
    expect(stepMetaPushed!.label).toBe('quota-check');
  });
});
