import { describe, it, expect } from 'vitest';
import { AuditUpstreamErrorHandler } from '../../src/3-operations/audit-upstream-error.handler.js';
import type { IAuditWriter } from '../../src/2-services/ports/audit-writer.port.js';
import type { ISessionStore } from '../../src/2-services/ports/session-store.port.js';
import { ProxyEnvironmentConfig } from '../../src/1-domain/types/config.types.js';
import { ActiveTurn, StepMeta, TurnMetadata } from '../../src/1-domain/types/audit.types.js';

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

function makeSessionStore(turn: ActiveTurn | null = null, overrides: Partial<ISessionStore> = {}): ISessionStore {
  let activeTurn = turn;
  const registry = new Map<string, ActiveTurn>();
  if (turn) registry.set(turn.interactionDir, turn);
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
    pushStepMetaByDir: async (dir: string, meta: StepMeta) => { registry.get(dir)?.stepsMeta.push(meta); },
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
    ...overrides,
  };
}

const BASE_PARAMS = {
  auditInteractionDir: '/tmp/sessions/s/interactions/000001_req-1',
  requestId: 'req-1',
  requestSequence: 1,
  auditSessionId: 'test-session',
  method: 'POST',
  url: '/v1/messages',
  requestStartTime: Date.now() - 100,
  requestBodyBytes: 100,
  requestBodyOmitted: false,
};

describe('AuditUpstreamErrorHandler', () => {
  it('debería escribir TurnMetadata con turnOutcome=upstream-error cuando hay turno activo', async () => {
    const config = makeConfig();
    let capturedDir: string | null = null;
    let capturedMeta: TurnMetadata | null = null;
    let turnCleared = false;
    let stateRemoved = false;

    const activeTurn: ActiveTurn = {
      interactionDir: '/tmp/sessions/s/interactions/000001_req-1',
      interactionType: 'agentic-turn',
      stepCount: 2,
      requestSequence: 1,
      startedAt: Date.now() - 200,
      requestBodyOmitted: false,
      requestBodyBytes: 100,
      stepsMeta: [
        { stepIndex: 1, sse: true, statusCode: 200, inputTokens: 5, outputTokens: 3 },
      ],
    };

    const handler = new AuditUpstreamErrorHandler(
      makeAuditWriter({
        writeTurnMeta: async (dir, meta) => {
          capturedDir = dir;
          capturedMeta = meta;
        },
        removeInteractionState: async () => { stateRemoved = true; },
      }),
      config,
      makeSessionStore(activeTurn, {
        closeTurn: async () => { turnCleared = true; },
      }),
    );

    await handler.execute({ ...BASE_PARAMS, error: Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }) });

    expect(capturedDir).toBe('/tmp/sessions/s/interactions/000001_req-1');
    expect(capturedMeta!.turnOutcome).toBe('upstream-error');
    expect(capturedMeta!.interactionType).toBe('agentic-turn');
    expect(capturedMeta!.errorMessage).toContain('ECONNREFUSED');
    expect(capturedMeta!.errorCode).toBe('ECONNREFUSED');
    expect(capturedMeta!.stepCount).toBe(1);
    expect(capturedMeta!.totals).toBeDefined();
    expect(capturedMeta!.totals!.inputTokens).toBe(5);
    expect(capturedMeta!.sse).toBe(true);
    expect(turnCleared).toBe(true);
    expect(stateRemoved).toBe(true);
  });

  it('debería escribir TurnMetadata sintético cuando no hay turno activo registrado', async () => {
    const config = makeConfig();
    let capturedMeta: TurnMetadata | null = null;

    const handler = new AuditUpstreamErrorHandler(
      makeAuditWriter({
        writeTurnMeta: async (_dir, meta) => { capturedMeta = meta; },
      }),
      config,
      makeSessionStore(null),
    );

    await handler.execute({ ...BASE_PARAMS, error: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }) });

    expect(capturedMeta).not.toBeNull();
    expect(capturedMeta!.turnOutcome).toBe('upstream-error');
    expect(capturedMeta!.interactionType).toBe('agentic-turn');
    expect(capturedMeta!.errorMessage).toContain('socket hang up');
    expect(capturedMeta!.errorCode).toBe('ECONNRESET');
    expect(capturedMeta!.stepCount).toBe(0);
    expect(capturedMeta!.steps).toEqual([]);
  });
});
