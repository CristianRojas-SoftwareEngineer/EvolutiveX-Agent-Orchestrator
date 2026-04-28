import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import type Anthropic from '@anthropic-ai/sdk';
import { AuditSseResponseHandler } from '../../src/3-operations/audit-sse-response.handler.js';
import type { IAuditWriter } from '../../src/2-services/ports/audit-writer.port.js';
import type { ISessionStore } from '../../src/2-services/ports/session-store.port.js';
import type { ISseReconstructor } from '../../src/2-services/ports/sse-reconstructor.port.js';
import { ProxyEnvironmentConfig } from '../../src/1-domain/types/config.types.js';
import { AuditInteractionContext, ActiveTurn, StepMeta, TurnMetadata } from '../../src/1-domain/types/audit.types.js';

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
    CONTEXT_SYNC_CACHE_ENABLED: true,
    CONTEXT_SYNC_MAX_WAIT_MS: 5000,
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
    sessionId: 'test',
    pendingAgentToolUses: [],
    pendingBuiltinToolUses: [],
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
  const pushedMetas: StepMeta[] = [];
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
    pushStepMetaByDir: async (dir: string, meta: StepMeta) => {
      pushedMetas.push(meta);
      const t = registry.get(dir);
      if (t) t.stepsMeta.push(meta);
    },
    closeTurn: (dir: string) => { registry.delete(dir); },
    registerPendingAgentToolUse: () => {},
    findTurnWithPendingAgents: () => null,
    consumePendingAgentToolUse: () => {},
    registerPendingBuiltinToolUse: () => {},
    findTurnWithPendingBuiltinTools: () => null,
    consumePendingBuiltinToolUse: () => {},
    findStaleTurnsAwaitingContinuation: () => [],
    getAllOpenTurns: () => [],
    registerWebFetchToolUseUrl: () => {},
    getWebFetchUrlByToolUseId: () => null,
    registerWebFetchStepResolution: () => {},
    resolveWebFetchStep: () => null,
    onceWebFetchStepResolved: async () => null,
    withSessionLock: async <T,>(_sessionId: string, fn: () => Promise<T>): Promise<T> => fn(),
    ...overrides,
  };
}

function makeAuditWriter(overrides: Partial<IAuditWriter> = {}): IAuditWriter {
  return {
    writeFileAtomic: async () => {},
    writeJsonAtomic: async () => {},
    writeFormattedAndMarkdown: async () => {},
    writeInteractionRequest: async () => ({ dir: '', requestBodyOmitted: false }),
    writeSubInteractionRequest: async () => ({ dir: '', requestBodyOmitted: false }),
    nextSubInteractionSequence: async () => 1,
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
      closeTurn: (_dir) => { turnCleared = true; },
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
      closeTurn: () => { turnClosed = true; },
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

  it('debería registrar pendingAgentToolUse al ver content_block_start tool_use name=Agent', async () => {
    const config = makeConfig();
    const calls: Array<{ dir: string; step: number; id: string; type?: string }> = [];
    const turn = makeActiveTurn();
    const store = makeSessionStore(turn, {
      registerPendingAgentToolUse: (dir, step, id, type) => {
        calls.push({ dir, step, id, type });
      },
    });
    const handler = new AuditSseResponseHandler(
      makeAuditWriter(),
      makeSseReconstructor(),
      config,
      store,
    );

    const sse = [
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_a","name":"Agent"}}',
      '',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"description\\":\\"x\\","}}',
      '',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"prompt\\":\\"do it\\","}}',
      '',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"subagent_type\\":\\"Explore\\"}"}}',
      '',
      'data: {"type":"content_block_stop","index":0}',
      '',
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}',
      '',
    ].join('\n');

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), {});
    stream.write(sse);
    stream.end();

    await new Promise((r) => setTimeout(r, 100));

    // Dos llamadas esperadas: una en content_block_start (sin subagent_type)
    // y una al cerrar el bloque (con subagent_type='Explore').
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[0]).toEqual({ dir: turn.interactionDir, step: 1, id: 'toolu_a', type: undefined });
    const enriched = calls.find((c) => c.type === 'Explore');
    expect(enriched).toBeDefined();
    expect(enriched!.id).toBe('toolu_a');
  });

  it('NO debería registrar pendingAgentToolUse para tool_use con name distinto de Agent', async () => {
    const config = makeConfig();
    const calls: unknown[] = [];
    const store = makeSessionStore(makeActiveTurn(), {
      registerPendingAgentToolUse: (...args) => { calls.push(args); },
    });
    const handler = new AuditSseResponseHandler(
      makeAuditWriter(),
      makeSseReconstructor(),
      config,
      store,
    );

    const sse = [
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_b","name":"Read"}}',
      '',
      'data: {"type":"content_block_stop","index":0}',
      '',
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}',
      '',
    ].join('\n');

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), {});
    stream.write(sse);
    stream.end();

    await new Promise((r) => setTimeout(r, 100));
    expect(calls).toHaveLength(0);
  });

  it('debería tolerar input_json incompleto / inválido sin lanzar (sin enriquecer subagent_type)', async () => {
    const config = makeConfig();
    const calls: Array<{ id: string; type?: string }> = [];
    const store = makeSessionStore(makeActiveTurn(), {
      registerPendingAgentToolUse: (_dir, _step, id, type) => { calls.push({ id, type }); },
    });
    const handler = new AuditSseResponseHandler(
      makeAuditWriter(),
      makeSseReconstructor(),
      config,
      store,
    );

    // JSON parcial nunca cierra correctamente.
    const sse = [
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_c","name":"Agent"}}',
      '',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"subagent_type\\":\\"Plan"}}',
      '',
      'data: {"type":"content_block_stop","index":0}',
      '',
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}',
      '',
    ].join('\n');

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), {});
    stream.write(sse);
    stream.end();

    await new Promise((r) => setTimeout(r, 100));
    // Sólo el primer registro (sin subagent_type), no hay segunda llamada porque parse falló.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ id: 'toolu_c', type: undefined });
  });

  it('debería detectar SSE event: error y cerrar con upstream-error + errorMessage/errorCode', async () => {
    const config = makeConfig();
    let captured: TurnMetadata | null = null;

    const sseData = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_test","usage":{"input_tokens":5}}}',
      '',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"","signature":""}}',
      '',
      'event: error',
      'data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded","details":null}}',
      '',
    ].join('\n');

    const handler = new AuditSseResponseHandler(
      makeAuditWriter({
        writeTurnMeta: async (_dir, meta) => { captured = meta; },
      }),
      makeSseReconstructor(),
      config,
      makeSessionStore(),
    );

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), {});
    stream.write(sseData);
    stream.end();

    await new Promise((r) => setTimeout(r, 100));
    expect(captured).not.toBeNull();
    expect(captured!.turnOutcome).toBe('upstream-error');
    expect(captured!.errorMessage).toBe('Overloaded');
    expect(captured!.errorCode).toBe('overloaded_error');
  });

  it('debería incluir lostPendingAgents en meta cuando SSE error ocurre con pendings activos', async () => {
    const config = makeConfig();
    let captured: TurnMetadata | null = null;

    const turn = makeActiveTurn({
      pendingAgentToolUses: [
        { stepIndex: 1, toolUseId: 'toolu_agent_1' },
        { stepIndex: 1, toolUseId: 'toolu_agent_2', subagentType: 'Explore' },
      ],
      pendingBuiltinToolUses: [],
    });

    const sseData = [
      'event: error',
      'data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
      '',
    ].join('\n');

    const handler = new AuditSseResponseHandler(
      makeAuditWriter({
        writeTurnMeta: async (_dir, meta) => { captured = meta; },
      }),
      makeSseReconstructor(),
      config,
      makeSessionStore(turn),
    );

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), {});
    stream.write(sseData);
    stream.end();

    await new Promise((r) => setTimeout(r, 100));
    expect(captured).not.toBeNull();
    expect(captured!.turnOutcome).toBe('upstream-error');
    expect(captured!.lostPendingAgents).toHaveLength(2);
    expect(captured!.lostPendingAgents![0].toolUseId).toBe('toolu_agent_1');
    expect(captured!.lostPendingAgents![1].subagentType).toBe('Explore');
  });

  it('debería marcar awaitingContinuation=true cuando stop_reason=tool_use', async () => {
    const config = makeConfig();
    const turn = makeActiveTurn();
    const store = makeSessionStore(turn);

    const sseData = [
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}',
      '',
    ].join('\n');

    const handler = new AuditSseResponseHandler(makeAuditWriter(), makeSseReconstructor(), config, store);
    const stream = new PassThrough();
    handler.execute(stream, makeContext(), {});
    stream.write(sseData);
    stream.end();

    await new Promise((r) => setTimeout(r, 100));
    expect(turn.awaitingContinuation).toBe(true);
    expect(turn.awaitingSince).toBeTypeOf('number');
  });

  it('NO debería incluir lostPendingAgents cuando no hay pendings activos', async () => {
    const config = makeConfig();
    let captured: TurnMetadata | null = null;

    const handler = new AuditSseResponseHandler(
      makeAuditWriter({
        writeTurnMeta: async (_dir, meta) => { captured = meta; },
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
    expect(captured).not.toBeNull();
    expect(captured!.lostPendingAgents).toBeUndefined();
  });

  it('debería propagar parentContext al meta.json si el turn es subagente', async () => {
    const config = makeConfig();
    let captured: TurnMetadata | null = null;
    const subTurn = makeActiveTurn({
      parentContext: {
        parentInteractionDir: '/tmp/parent',
        parentStepIndex: 1,
        triggeringToolUseId: 'toolu_zzz',
        subagentType: 'Explore',
      },
    });

    const handler = new AuditSseResponseHandler(
      makeAuditWriter({
        writeTurnMeta: async (_dir, meta) => { captured = meta; },
      }),
      makeSseReconstructor(),
      config,
      makeSessionStore(subTurn),
    );

    const sseData = [
      'event: message_delta',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}',
      '',
    ].join('\n');

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), { 'content-type': 'text/event-stream' });
    stream.write(sseData);
    stream.end();

    await new Promise((r) => setTimeout(r, 100));
    expect(captured).not.toBeNull();
    expect(captured!.parentContext).toEqual(subTurn.parentContext);
  });
});
