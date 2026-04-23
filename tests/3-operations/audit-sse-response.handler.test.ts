import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import type Anthropic from '@anthropic-ai/sdk';
import { AuditSseResponseHandler } from '../../src/3-operations/audit-sse-response.handler.js';
import type { IAuditWriter } from '../../src/2-services/ports/audit-writer.port.js';
import type { ISessionStore } from '../../src/2-services/ports/session-store.port.js';
import type { ISseReconstructor } from '../../src/2-services/ports/sse-reconstructor.port.js';
import { ProxyEnvironmentConfig } from '../../src/1-domain/types/config.types.js';
import { AuditInteractionContext, ActiveTurn, StepMeta } from '../../src/1-domain/types/audit.types.js';

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
  let activeTurn = turn;
  const registry = new Map<string, ActiveTurn>();
  if (turn) registry.set(turn.interactionDir, turn);
  const pushedMetas: StepMeta[] = [];
  return {
    getBaseDir: () => '/tmp/sessions',
    ensureAuditSessionsRoot: async () => {},
    nextAuditInteractionSequence: async () => 1,
    getActiveTurn: async () => activeTurn,
    setActiveTurn: async (_id: string, t: ActiveTurn) => { activeTurn = t; registry.set(t.interactionDir, t); },
    registerTurn: (dir: string, t: ActiveTurn) => { registry.set(dir, t); },
    getTurnByDir: async (dir: string) => registry.get(dir) || null,
    getTurnByDirSync: (dir: string) => registry.get(dir) || null,
    incrementStepCountByDir: (dir: string) => { const t = registry.get(dir); if (t) t.stepCount += 1; return t?.stepCount ?? 1; },
    pushStepMetaByDir: async (dir: string, meta: StepMeta) => {
      pushedMetas.push(meta);
      const t = registry.get(dir);
      if (t) t.stepsMeta.push(meta);
    },
    closeTurn: async (dir: string, _sessionId: string) => { registry.delete(dir); activeTurn = null; },
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

function makeSseReconstructor(overrides: Partial<ISseReconstructor> = {}): ISseReconstructor {
  return {
    reconstructStepMessage: async () => ({}) as unknown as Anthropic.Message,
    runReconstruction: async () => ({
      sseResponseBodyAttempted: false,
      sseResponseBodyWritten: false,
    }),
    ...overrides,
  };
}

describe('AuditSseResponseHandler', () => {
  it('debería capturar líneas SSE en stepDir y escribir turnMeta al finalizar (end_turn)', async () => {
    const config = makeConfig();
    const appendedLines: unknown[] = [];
    let turnMetaWritten = false;

    const sseData = [
      'event: message_start',
      'data: {"type":"message_start","message":{"usage":{"input_tokens":5,"output_tokens":0}}}',
      '',
      'event: message_delta',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":10}}',
      '',
      'event: message_stop',
      'data: {"type":"message_stop"}',
      '',
    ].join('\n');

    const handler = new AuditSseResponseHandler(
      makeAuditWriter({
        appendSseLine: (_dir, line) => { appendedLines.push(line); },
        writeTurnMeta: async () => { turnMetaWritten = true; },
      }),
      makeSseReconstructor(),
      config,
      makeSessionStore(),
    );

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), { 'content-type': 'text/event-stream' });
    stream.write(sseData);
    stream.end();

    await new Promise((r) => setTimeout(r, 100));

    expect(appendedLines.length).toBeGreaterThanOrEqual(2);
    expect(turnMetaWritten).toBe(true);
  });

  it('debería NO escribir turnMeta si stop_reason=tool_use (turno continúa)', async () => {
    const config = makeConfig();
    let turnMetaWritten = false;

    const sseData = [
      'event: message_delta',
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}',
      '',
    ].join('\n');

    const handler = new AuditSseResponseHandler(
      makeAuditWriter({ writeTurnMeta: async () => { turnMetaWritten = true; } }),
      makeSseReconstructor(),
      config,
      makeSessionStore(),
    );

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), {});
    stream.write(sseData);
    stream.end();

    await new Promise((r) => setTimeout(r, 100));
    expect(turnMetaWritten).toBe(false);
  });

  it('debería cerrar turno preflight-warmup cuando termina el stream', async () => {
    const config = makeConfig();
    let turnCleared = false;
    let turnMetaWritten = false;

    const preflightTurn = makeActiveTurn({ interactionType: 'client-preflight' });
    const store = makeSessionStore(preflightTurn, {
      closeTurn: async (_dir, _sessionId) => { turnCleared = true; },
    });

    const handler = new AuditSseResponseHandler(
      makeAuditWriter({ writeTurnMeta: async () => { turnMetaWritten = true; } }),
      makeSseReconstructor(),
      config,
      store,
    );

    const stream = new PassThrough();
    handler.execute(
      stream,
      makeContext({ interactionType: 'client-preflight', turnClassification: { type: 'preflight-warmup' } }),
      {},
    );
    stream.write('data: {"type":"message_start"}\n\n');
    stream.end();

    await new Promise((r) => setTimeout(r, 100));
    expect(turnCleared).toBe(true);
    expect(turnMetaWritten).toBe(true);
  });

  it('debería registrar sseRawBytesWritten por step en StepMeta', async () => {
    const config = makeConfig();
    let capturedMeta: StepMeta | null = null;
    const turn = makeActiveTurn();
    const store = makeSessionStore(turn, {
      pushStepMetaByDir: async (_dir, meta) => { capturedMeta = meta; turn.stepsMeta.push(meta); },
    });

    const sseData = 'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n';
    const handler = new AuditSseResponseHandler(makeAuditWriter(), makeSseReconstructor(), config, store);
    const stream = new PassThrough();
    handler.execute(stream, makeContext(), {});
    stream.write(sseData);
    stream.end();

    await new Promise((r) => setTimeout(r, 100));
    expect(capturedMeta).not.toBeNull();
    expect(capturedMeta!.sseRawBytesWritten).toBeGreaterThan(0);
  });

  it('NO debería escribir headers top-level si la reconstrucción no produjo body', async () => {
    const config = makeConfig();
    const headerDirs: string[] = [];
    const handler = new AuditSseResponseHandler(
      makeAuditWriter({
        writeResponseHeadersAudit: async (dir) => { headerDirs.push(dir); },
      }),
      makeSseReconstructor({
        runReconstruction: async () => ({ sseResponseBodyAttempted: true, sseResponseBodyWritten: false }),
      }),
      config,
      makeSessionStore(),
    );

    const sseData = 'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n';
    const stream = new PassThrough();
    handler.execute(stream, makeContext(), {});
    stream.write(sseData);
    stream.end();

    await new Promise((r) => setTimeout(r, 100));
    // Solo el step dir, nunca el top-level
    expect(headerDirs.every((d) => /steps[/\\]\d{3}$/.test(d))).toBe(true);
  });

  it('debería escribir headers top-level cuando la reconstrucción escribió body', async () => {
    const config = makeConfig();
    const headerDirs: string[] = [];
    const handler = new AuditSseResponseHandler(
      makeAuditWriter({
        writeResponseHeadersAudit: async (dir) => { headerDirs.push(dir); },
      }),
      makeSseReconstructor({
        runReconstruction: async () => ({ sseResponseBodyAttempted: true, sseResponseBodyWritten: true }),
      }),
      config,
      makeSessionStore(),
    );

    const sseData = 'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n';
    const stream = new PassThrough();
    handler.execute(stream, makeContext(), {});
    stream.write(sseData);
    stream.end();

    await new Promise((r) => setTimeout(r, 100));
    expect(headerDirs.some((d) => !/steps[/\\]/.test(d))).toBe(true);
  });

  it('NO debería cerrar turno agentic si llega un warmup durante el turno', async () => {
    const config = makeConfig();
    let turnClosed = false;
    let turnMetaWritten = false;

    // Turno subyacente es agentic-turn, no preflight
    const agenticTurn = makeActiveTurn({ interactionType: 'agentic-turn' });
    const store = makeSessionStore(agenticTurn, {
      closeTurn: async () => { turnClosed = true; },
    });

    const handler = new AuditSseResponseHandler(
      makeAuditWriter({ writeTurnMeta: async () => { turnMetaWritten = true; } }),
      makeSseReconstructor(),
      config,
      store,
    );

    const stream = new PassThrough();
    handler.execute(
      stream,
      makeContext({ interactionType: 'client-preflight', turnClassification: { type: 'preflight-warmup' } }),
      {},
    );
    stream.write('data: {"type":"message_start"}\n\n');
    stream.end();

    await new Promise((r) => setTimeout(r, 100));
    expect(turnClosed).toBe(false);
    expect(turnMetaWritten).toBe(false);
  });

  it('debería llamar removeInteractionState al cerrar el turno', async () => {
    const config = makeConfig();
    let removeCalled = false;
    const handler = new AuditSseResponseHandler(
      makeAuditWriter({
        removeInteractionState: async () => { removeCalled = true; },
      }),
      makeSseReconstructor(),
      config,
      makeSessionStore(),
    );

    const sseData = 'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n';
    const stream = new PassThrough();
    handler.execute(stream, makeContext(), {});
    stream.write(sseData);
    stream.end();

    await new Promise((r) => setTimeout(r, 100));
    expect(removeCalled).toBe(true);
  });

  it('debería invocar reconstrucción SSE incondicionalmente al stop_reason=end_turn', async () => {
    const config = makeConfig();
    let reconstructCalled = false;

    const sseData = 'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n';

    const handler = new AuditSseResponseHandler(
      makeAuditWriter(),
      makeSseReconstructor({
        runReconstruction: async () => {
          reconstructCalled = true;
          return { sseResponseBodyAttempted: true, sseResponseBodyWritten: true };
        },
      }),
      config,
      makeSessionStore(),
    );

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), {});
    stream.write(sseData);
    stream.end();

    await new Promise((r) => setTimeout(r, 100));
    expect(reconstructCalled).toBe(true);
  });
});
