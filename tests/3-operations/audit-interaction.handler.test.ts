import { describe, it, expect } from 'vitest';
import { AuditInteractionHandler } from '../../src/3-operations/audit-interaction.handler.js';
import { SessionResolverService } from '../../src/1-domain/services/session-resolver.service.js';
import type { ISessionStore } from '../../src/2-services/ports/session-store.port.js';
import type { IAuditWriter } from '../../src/2-services/ports/audit-writer.port.js';
import { ProxyEnvironmentConfig } from '../../src/1-domain/types/config.types.js';
import { ActiveTurn, StepMeta } from '../../src/1-domain/types/audit.types.js';

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
    ...overrides,
  };
}

function makeSessionStore(overrides: Partial<ISessionStore> = {}): ISessionStore {
  let activeTurn: ActiveTurn | null = null;
  const registry = new Map<string, ActiveTurn>();
  return {
    getBaseDir: () => '/tmp/sessions',
    ensureAuditSessionsRoot: async () => {},
    nextAuditInteractionSequence: async () => 1,
    getActiveTurn: async () => activeTurn,
    setActiveTurn: async (_id: string, turn: ActiveTurn) => { activeTurn = turn; registry.set(turn.interactionDir, turn); },
    registerTurn: (dir: string, turn: ActiveTurn) => { registry.set(dir, turn); },
    getTurnByDir: async (dir: string) => registry.get(dir) || null,
    getTurnByDirSync: (dir: string) => registry.get(dir) || null,
    incrementStepCountByDir: (dir: string) => {
      const t = registry.get(dir);
      if (t) t.stepCount += 1;
      return t?.stepCount ?? 1;
    },
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
    writeInteractionRequest: async () => ({
      dir: '/tmp/sessions/s/interactions/000001_req',
      requestBodyOmitted: false,
    }),
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

// Body con tools = fresh
const FRESH_BODY = Buffer.from(JSON.stringify({
  model: 'claude-3-5-sonnet',
  messages: [{ role: 'user', content: 'hola' }],
  tools: [{ name: 'Read', description: 'lee', input_schema: { type: 'object', properties: {} } }],
  max_tokens: 4096,
}));

// Body con tool_result = continuation
const CONTINUATION_BODY = Buffer.from(JSON.stringify({
  messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] }],
  max_tokens: 4096,
}));

// Body con quota + max_tokens:1 = preflight-quota
const QUOTA_BODY = Buffer.from('{"model":"claude","messages":[{"role":"user","content":"quota"}],"max_tokens":1}');

// Body con tools:[] = side-request
const SIDE_REQUEST_BODY = Buffer.from(JSON.stringify({
  model: 'claude-3-5-sonnet',
  messages: [{ role: 'user', content: 'titulo' }],
  tools: [],
  max_tokens: 256,
}));

describe('AuditInteractionHandler', () => {
  it('debería clasificar fresh: crear interacción y setActiveTurn', async () => {
    const config = makeConfig();
    let turnSet: ActiveTurn | null = null;
    const store = makeSessionStore({
      setActiveTurn: async (_id, turn) => { turnSet = turn; },
    });
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      store,
      makeAuditWriter(),
      config,
    );
    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 'my-session' },
      rawBody: FRESH_BODY,
      requestId: 'req-1',
    });
    expect(result).not.toBeNull();
    expect(result!.interactionType).toBe('agentic-turn');
    expect(result!.turnClassification).toEqual({ type: 'fresh' });
    expect(turnSet).not.toBeNull();
    expect(turnSet!.interactionType).toBe('agentic-turn');
    expect(turnSet!.stepCount).toBe(1);
  });

  it('debería clasificar continuation: incrementar step y escribir step request', async () => {
    const config = makeConfig();
    let stepRequestWritten = false;
    const existingTurn: ActiveTurn = {
      interactionDir: '/tmp/sessions/s/interactions/000001_req',
      interactionType: 'agentic-turn',
      stepCount: 1,
      requestSequence: 1,
      startedAt: Date.now(),
      requestBodyOmitted: false,
      requestBodyBytes: 100,
      stepsMeta: [],
    };
    const store = makeSessionStore({
      getActiveTurn: async () => existingTurn,
      incrementStepCountByDir: (_dir: string) => { existingTurn.stepCount = 2; return 2; },
    });
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      store,
      makeAuditWriter({
        writeStepRequest: async () => { stepRequestWritten = true; },
      }),
      config,
    );
    const result = await handler.execute({
      headers: {},
      rawBody: CONTINUATION_BODY,
      requestId: 'req-2',
    });
    expect(result).not.toBeNull();
    expect(result!.interactionType).toBe('agentic-turn');
    expect(result!.turnClassification).toEqual({ type: 'continuation' });
    expect(stepRequestWritten).toBe(true);
  });

  it('debería clasificar preflight-quota: crear interacción sin top-level request', async () => {
    const config = makeConfig();
    let skipTopLevelRequest = false;
    let turnSet: ActiveTurn | null = null;
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      makeSessionStore({ setActiveTurn: async (_id, t) => { turnSet = t; } }),
      makeAuditWriter({
        writeInteractionRequest: async (params) => {
          skipTopLevelRequest = !!params.skipTopLevelRequest;
          return { dir: '/tmp/sessions/s/interactions/000001_req', requestBodyOmitted: false };
        },
      }),
      config,
    );
    const result = await handler.execute({
      headers: {},
      rawBody: QUOTA_BODY,
      requestId: 'req-1',
    });
    expect(result!.interactionType).toBe('client-preflight');
    expect(result!.turnClassification).toEqual({ type: 'preflight-quota' });
    expect(skipTopLevelRequest).toBe(true);
    expect(turnSet!.interactionType).toBe('client-preflight');
  });

  it('debería strip header de sesión si STRIP_AUDIT_SESSION_HEADER=true', async () => {
    const config = makeConfig({ STRIP_AUDIT_SESSION_HEADER: true });
    const headers: Record<string, string | string[] | undefined> = {
      'x-cc-audit-session': 'my-session',
      'content-type': 'application/json',
    };
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      makeSessionStore(),
      makeAuditWriter(),
      config,
    );
    await handler.execute({ headers, rawBody: FRESH_BODY, requestId: 'req-2' });
    expect(headers['x-cc-audit-session']).toBeUndefined();
    expect(headers['content-type']).toBe('application/json');
  });

  it('debería escribir steps/001/request para fresh (simetría estructural)', async () => {
    const config = makeConfig();
    const stepDirs: string[] = [];
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      makeSessionStore(),
      makeAuditWriter({
        writeStepRequest: async (p) => { stepDirs.push(p.stepDir); },
      }),
      config,
    );
    await handler.execute({ headers: {}, rawBody: FRESH_BODY, requestId: 'req-1' });
    expect(stepDirs).toHaveLength(1);
    expect(stepDirs[0]).toMatch(/steps[/\\]001$/);
  });

  it('debería clasificar side-request con interactionType side-request', async () => {
    const config = makeConfig();
    let registered: ActiveTurn | null = null;
    const store = makeSessionStore({
      registerTurn: (_dir, t) => { registered = t; },
    });
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      store,
      makeAuditWriter(),
      config,
    );
    const result = await handler.execute({
      headers: {},
      rawBody: SIDE_REQUEST_BODY,
      requestId: 'req-side',
    });
    expect(result!.interactionType).toBe('side-request');
    expect(result!.turnClassification).toEqual({ type: 'side-request' });
    expect(registered).not.toBeNull();
    expect(registered!.interactionType).toBe('side-request');
  });

  it('debería escribir steps/001/request para side-request (simetría estructural)', async () => {
    const config = makeConfig();
    const stepDirs: string[] = [];
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      makeSessionStore(),
      makeAuditWriter({
        writeStepRequest: async (p) => { stepDirs.push(p.stepDir); },
      }),
      config,
    );
    await handler.execute({ headers: {}, rawBody: SIDE_REQUEST_BODY, requestId: 'req-side' });
    expect(stepDirs).toHaveLength(1);
    expect(stepDirs[0]).toMatch(/steps[/\\]001$/);
  });

  it('debería llamar writeInteractionState para fresh/side/preflight-quota (state.json)', async () => {
    const config = makeConfig();
    const stateDirs: string[] = [];
    const writer = makeAuditWriter({
      writeInteractionState: async (dir, state) => {
        stateDirs.push(`${state.interactionType}:${dir}`);
      },
    });
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      makeSessionStore(),
      writer,
      config,
    );
    await handler.execute({ headers: {}, rawBody: FRESH_BODY, requestId: 'r1' });
    await handler.execute({ headers: {}, rawBody: SIDE_REQUEST_BODY, requestId: 'r2' });
    await handler.execute({ headers: {}, rawBody: QUOTA_BODY, requestId: 'r3' });
    expect(stateDirs.some((s) => s.startsWith('agentic-turn:'))).toBe(true);
    expect(stateDirs.some((s) => s.startsWith('side-request:'))).toBe(true);
    expect(stateDirs.some((s) => s.startsWith('client-preflight:'))).toBe(true);
  });

  it('debería escribir metadata completa del turno interrumpido', async () => {
    const config = makeConfig();
    const prevTurn: ActiveTurn = {
      interactionDir: '/tmp/sessions/s/interactions/000001_prev',
      interactionType: 'agentic-turn',
      stepCount: 2,
      requestSequence: 1,
      startedAt: Date.now() - 1000,
      requestBodyOmitted: false,
      requestBodyBytes: 100,
      stepsMeta: [
        { stepIndex: 1, sse: true, statusCode: 200, stopReason: 'tool_use', inputTokens: 10, outputTokens: 5 },
        { stepIndex: 2, sse: true, statusCode: 200, inputTokens: 3, outputTokens: 7, sseRawBytesWritten: 1024 },
      ],
    };
    let capturedMeta: { statusCode: number | null; sse: boolean; totals: { inputTokens: number } | null; truncation: { sseRawBytesAudited: number | null } } | null = null;
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      makeSessionStore({ getActiveTurn: async () => prevTurn }),
      makeAuditWriter({
        writeTurnMeta: async (_dir, meta) => { capturedMeta = meta; },
      }),
      config,
    );
    await handler.execute({ headers: {}, rawBody: FRESH_BODY, requestId: 'new-req' });
    expect(capturedMeta).not.toBeNull();
    expect(capturedMeta!.statusCode).toBe(200);
    expect(capturedMeta!.sse).toBe(true);
    expect(capturedMeta!.totals).toBeDefined();
    expect(capturedMeta!.totals!.inputTokens).toBe(13);
    expect(capturedMeta!.truncation!.sseRawBytesAudited).toBe(1024);
  });

  it('debería fallback a fresh si continuation llega sin activeTurn', async () => {
    const config = makeConfig();
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      makeSessionStore({ getActiveTurn: async () => null }),
      makeAuditWriter(),
      config,
    );
    const result = await handler.execute({
      headers: {},
      rawBody: CONTINUATION_BODY,
      requestId: 'req-1',
    });
    // Fallback to fresh: interactionType = agentic-turn
    expect(result!.interactionType).toBe('agentic-turn');
  });

  it('debería ignorar health checks de Bun (sin body, sin auth, sin session headers)', async () => {
    const config = makeConfig();
    let interactionWritten = false;
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      makeSessionStore(),
      makeAuditWriter({
        writeInteractionRequest: async () => {
          interactionWritten = true;
          return { dir: '/tmp/test', requestBodyOmitted: false };
        },
      }),
      config,
    );

    // Request tipo Bun health check: Bun UA, sin body, sin auth, sin session headers
    const result = await handler.execute({
      headers: {
        'user-agent': 'Bun/1.3.13',
        'accept': '*/*',
        'host': '127.0.0.1:8787',
      },
      rawBody: Buffer.alloc(0),
      requestId: 'health-check-1',
    });

    // Debería retornar null (ignorado)
    expect(result).toBeNull();
    expect(interactionWritten).toBe(false);
  });

  it('debería auditar request de Bun si tiene authorization header (no es health check)', async () => {
    const config = makeConfig();
    let interactionWritten = false;
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      makeSessionStore(),
      makeAuditWriter({
        writeInteractionRequest: async () => {
          interactionWritten = true;
          return { dir: '/tmp/test', requestBodyOmitted: false };
        },
      }),
      config,
    );

    // Request de Bun CON authorization (no es health check)
    const result = await handler.execute({
      headers: {
        'user-agent': 'Bun/1.3.13',
        'authorization': 'Bearer <ANTHROPIC_KEY_REDACTED>xxx',
        'host': '127.0.0.1:8787',
      },
      rawBody: Buffer.alloc(0),
      requestId: 'req-1',
    });

    // NO debería ser ignorado porque tiene auth
    expect(result).not.toBeNull();
    expect(interactionWritten).toBe(true);
  });

  it('debería auditar request de Bun si tiene body (no es health check)', async () => {
    const config = makeConfig();
    let interactionWritten = false;
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      makeSessionStore(),
      makeAuditWriter({
        writeInteractionRequest: async () => {
          interactionWritten = true;
          return { dir: '/tmp/test', requestBodyOmitted: false };
        },
      }),
      config,
    );

    // Request de Bun CON body (no es health check)
    const result = await handler.execute({
      headers: {
        'user-agent': 'Bun/1.3.13',
        'host': '127.0.0.1:8787',
      },
      rawBody: Buffer.from('{"test":true}'),
      requestId: 'req-1',
    });

    // NO debería ser ignorado porque tiene body
    expect(result).not.toBeNull();
    expect(interactionWritten).toBe(true);
  });

  it('debería auditar request de claude-cli aunque tenga session _unknown', async () => {
    const config = makeConfig();
    let interactionWritten = false;
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      makeSessionStore(),
      makeAuditWriter({
        writeInteractionRequest: async () => {
          interactionWritten = true;
          return { dir: '/tmp/test', requestBodyOmitted: false };
        },
      }),
      config,
    );

    // Request de claude-cli sin session headers (causa _unknown) pero CON body real
    const result = await handler.execute({
      headers: {
        'user-agent': 'claude-cli/2.1.113',
        'authorization': 'Bearer <ANTHROPIC_KEY_REDACTED>xxx',
        'host': '127.0.0.1:8787',
      },
      rawBody: FRESH_BODY,
      requestId: 'req-1',
    });

    // NO debería ser ignorado porque tiene body (es request real de Claude Code)
    expect(result).not.toBeNull();
    expect(interactionWritten).toBe(true);
  });
});
