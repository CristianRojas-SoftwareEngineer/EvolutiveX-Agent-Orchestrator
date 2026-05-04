import { describe, it, expect } from 'vitest';
import { AuditInteractionHandler } from '../../src/3-operations/audit-interaction.handler.js';
import { SessionResolverService } from '../../src/1-domain/services/session-resolver.service.js';
import type { ISessionStore } from '../../src/2-services/ports/session-store.port.js';
import type { IAuditWriter } from '../../src/2-services/ports/audit-writer.port.js';
import { ProxyEnvironmentConfig } from '../../src/1-domain/types/config.types.js';
import { ActiveInteraction, StepMeta } from '../../src/1-domain/types/audit.types.js';

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

function makeSessionStore(overrides: Partial<ISessionStore> = {}): ISessionStore {
  const registry = new Map<string, ActiveInteraction>();
  const toolUseIndex = new Map<string, string>();
  return {
    getBaseDir: () => '/tmp/sessions',
    ensureAuditSessionsRoot: async () => {},
    nextAuditInteractionSequence: async () => 1,
    registerInteraction: (interaction: ActiveInteraction) => {
      registry.set(interaction.interactionDir, interaction);
    },
    registerToolUseId: (id: string, dir: string) => {
      toolUseIndex.set(id, dir);
    },
    getInteractionByToolUseId: (id: string) => {
      const dir = toolUseIndex.get(id);
      return dir ? (registry.get(dir) ?? null) : null;
    },
    getInteractionByDir: async (dir: string) => registry.get(dir) || null,
    getInteractionByDirSync: (dir: string) => registry.get(dir) || null,
    incrementStepCountByDir: (dir: string) => {
      const t = registry.get(dir);
      if (t) t.stepCount += 1;
      return t?.stepCount ?? 1;
    },
    pushStepMetaByDir: async (dir: string, meta: StepMeta) => {
      registry.get(dir)?.stepsMeta.push(meta);
    },
    closeInteraction: (dir: string) => {
      registry.delete(dir);
    },
    registerPendingAgentToolUse: () => {},
    findInteractionWithPendingAgents: () => null,
    consumePendingAgentToolUse: () => {},
    registerPendingBuiltinToolUse: () => {},
    findInteractionWithPendingBuiltinTools: () => null,
    consumePendingBuiltinToolUse: () => {},
    findStaleInteractionsAwaitingContinuation: () => [],
    getAllOpenInteractions: () => [],
    registerContextSyncCache: () => {},
    resolveContextSyncCache: () => null,
    withSessionLock: async <T>(_sessionId: string, fn: () => Promise<T>): Promise<T> => fn(),
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
    writeSubInteractionRequest: async () => ({
      dir: '/tmp/sessions/s/interactions/000001_req/steps/001/sub-interactions/001_sub',
      requestBodyOmitted: false,
    }),
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
    writeInteractionMeta: async () => {},
    appendSseLine: () => {},
    appendSseRawChunk: () => {},
    writeInteractionState: async () => {},
    removeInteractionState: async () => {},
    writeStepResponseMarkdown: async () => {},
    writeTopLevelMultiStepResponse: async () => ({ written: true }),
    updateSessionMetrics: async () => {},
    ...overrides,
  };
}

// Body con tools = fresh
const FRESH_BODY = Buffer.from(
  JSON.stringify({
    model: 'claude-3-5-sonnet',
    messages: [{ role: 'user', content: 'hola' }],
    tools: [{ name: 'Read', description: 'lee', input_schema: { type: 'object', properties: {} } }],
    max_tokens: 4096,
  }),
);

// Body con tool_result = continuation
const CONTINUATION_BODY = Buffer.from(
  JSON.stringify({
    messages: [
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool-x', content: 'ok' }] },
    ],
    max_tokens: 4096,
  }),
);

// Body con quota + max_tokens:1 = preflight-quota
const QUOTA_BODY = Buffer.from(
  '{"model":"claude","messages":[{"role":"user","content":"quota"}],"max_tokens":1}',
);

// Body con tools:[] = side-request
const SIDE_REQUEST_BODY = Buffer.from(
  JSON.stringify({
    model: 'claude-3-5-sonnet',
    messages: [{ role: 'user', content: 'titulo' }],
    tools: [],
    max_tokens: 256,
  }),
);

// Body con tool_result referenciando ID conocido
function makeContinuationBody(toolUseId: string): Buffer {
  return Buffer.from(
    JSON.stringify({
      messages: [
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'result' }],
        },
      ],
      max_tokens: 4096,
    }),
  );
}

describe('AuditInteractionHandler', () => {
  it('side-request context-sync HIT no audita y retorna stream SSE simulado', async () => {
    const config = makeConfig({ CONTEXT_SYNC_CACHE_ENABLED: true });
    const HARNESS_CONTEXT_SYNC_SUFFIX = `Provide a concise response based only on the content above. In your response:
    - Enforce a strict 125-character maximum for quotes from any source document. Open Source Software is ok as long as we respect the license.
    - Use quotation marks for exact language from articles; any language outside of the quotation should never be word-for-word the same.
    - You are not a lawyer and never comment on the legality of your own prompts and responses.
    - Never produce or reproduce exact song lyrics.`;
    const html = '<html><body>contenido</body></html>';
    const content = `Web page content:\n---\n${html}\n---\n${HARNESS_CONTEXT_SYNC_SUFFIX}`;

    const store = makeSessionStore({
      resolveContextSyncCache: (_h: string, _p: string) => 'cached response',
    });
    let writeInteractionRequestCalled = false;

    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      store,
      makeAuditWriter({
        writeInteractionRequest: async () => {
          writeInteractionRequestCalled = true;
          return { dir: '/tmp/should-not-be-used', requestBodyOmitted: false };
        },
      }),
      config,
    );

    const ctxBody = Buffer.from(
      JSON.stringify({
        model: 'claude-sonnet-4-6',
        tools: [],
        messages: [{ role: 'user', content }],
      }),
    );

    const result = await handler.execute({
      headers: {},
      rawBody: ctxBody,
      requestId: 'req-side-cache',
    });

    expect(result).not.toBeNull();
    expect(result!.contextSyncCacheHit).toBe(true);
    expect(result!.contextSyncSseStream).toBeDefined();
    expect(writeInteractionRequestCalled).toBe(false);
  });

  it('side-request context-sync MISS audita como side-request normal', async () => {
    const config = makeConfig({ CONTEXT_SYNC_CACHE_ENABLED: true });
    const HARNESS_CONTEXT_SYNC_SUFFIX = `Provide a concise response based only on the content above. In your response:
    - Enforce a strict 125-character maximum for quotes from any source document. Open Source Software is ok as long as we respect the license.
    - Use quotation marks for exact language from articles; any language outside of the quotation should never be word-for-word the same.
    - You are not a lawyer and never comment on the legality of your own prompts and responses.
    - Never produce or reproduce exact song lyrics.`;
    const html = '<html><body>contenido</body></html>';
    const content = `Web page content:\n---\n${html}\n---\n${HARNESS_CONTEXT_SYNC_SUFFIX}`;

    let writeInteractionRequestCalled = false;
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      makeSessionStore({
        resolveContextSyncCache: () => null,
      }),
      makeAuditWriter({
        writeInteractionRequest: async () => {
          writeInteractionRequestCalled = true;
          return { dir: '/tmp/sessions/s/interactions/000001_req-side', requestBodyOmitted: false };
        },
      }),
      config,
    );

    const ctxBody = Buffer.from(
      JSON.stringify({
        model: 'claude-sonnet-4-6',
        tools: [],
        messages: [{ role: 'user', content }],
      }),
    );

    const result = await handler.execute({
      headers: {},
      rawBody: ctxBody,
      requestId: 'req-side-cache-miss',
    });
    expect(result).not.toBeNull();
    expect(result!.contextSyncCacheHit).toBeUndefined();
    expect(result!.interactionType).toBe('side-request');
    expect(writeInteractionRequestCalled).toBe(true);
  });

  it('debería clasificar fresh: crear interacción y registrar interacción', async () => {
    const config = makeConfig();
    let registeredInteraction: ActiveInteraction | null = null;
    const store = makeSessionStore({
      registerInteraction: (interaction: ActiveInteraction) => {
        registeredInteraction = interaction;
      },
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
    expect(result!.interactionType).toBe('agentic');
    expect(result!.requestClassification).toEqual({ type: 'fresh' });
    expect(registeredInteraction).not.toBeNull();
    expect(registeredInteraction!.interactionType).toBe('agentic');
    expect(registeredInteraction!.stepCount).toBe(1);
  });

  it('dos fresh concurrentes crean dos interacciones independientes sin interrupción', async () => {
    const config = makeConfig();
    const registeredInteractions: ActiveInteraction[] = [];
    let seq = 0;
    const store = makeSessionStore({
      nextAuditInteractionSequence: async () => {
        seq += 1;
        return seq;
      },
      registerInteraction: (interaction: ActiveInteraction) => {
        registeredInteractions.push(interaction);
      },
    });
    const dirs: string[] = [];
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      store,
      makeAuditWriter({
        writeInteractionRequest: async () => {
          const dir = `/tmp/sessions/s/interactions/00000${seq}_req`;
          dirs.push(dir);
          return { dir, requestBodyOmitted: false };
        },
      }),
      config,
    );

    const [r1, r2] = await Promise.all([
      handler.execute({ headers: {}, rawBody: FRESH_BODY, requestId: 'req-1' }),
      handler.execute({ headers: {}, rawBody: FRESH_BODY, requestId: 'req-2' }),
    ]);

    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(registeredInteractions).toHaveLength(2);
    // Ninguno es marcado como interrupted
    expect(registeredInteractions.every((t) => t.interactionType === 'agentic')).toBe(true);
  });

  it('debería clasificar continuation: routear a la interacción padre por tool_use_id', async () => {
    const config = makeConfig();
    let stepRequestWritten = false;
    const parentInteraction: ActiveInteraction = {
      interactionDir: '/tmp/sessions/s/interactions/000001_req',
      interactionType: 'agentic',
      stepCount: 1,
      requestSequence: 1,
      startedAt: Date.now(),
      requestBodyOmitted: false,
      requestBodyBytes: 100,
      stepsMeta: [],
      sessionId: 's',
      pendingAgentToolUses: [],
      pendingBuiltinToolUses: [],
    };
    const store = makeSessionStore({
      getInteractionByToolUseId: (id: string) => (id === 'tool-x' ? parentInteraction : null),
      incrementStepCountByDir: (_dir: string) => {
        parentInteraction.stepCount = 2;
        return 2;
      },
    });
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      store,
      makeAuditWriter({
        writeStepRequest: async () => {
          stepRequestWritten = true;
        },
      }),
      config,
    );
    const result = await handler.execute({
      headers: {},
      rawBody: CONTINUATION_BODY,
      requestId: 'req-2',
    });
    expect(result).not.toBeNull();
    expect(result!.interactionType).toBe('agentic');
    expect(result!.requestClassification).toEqual({ type: 'continuation' });
    expect(result!.auditInteractionDir).toBe(parentInteraction.interactionDir);
    expect(stepRequestWritten).toBe(true);
  });

  it('continuation sin tool_use_id registrado crea interacción orphan con continuationOrphan=true', async () => {
    const config = makeConfig();
    const stateWrites: Array<{ dir: string; state: unknown }> = [];
    const store = makeSessionStore({
      getInteractionByToolUseId: () => null,
    });
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      store,
      makeAuditWriter({
        writeInteractionState: async (dir, state) => {
          stateWrites.push({ dir, state });
        },
      }),
      config,
    );
    const result = await handler.execute({
      headers: {},
      rawBody: CONTINUATION_BODY,
      requestId: 'req-1',
    });
    expect(result).not.toBeNull();
    expect(result!.interactionType).toBe('agentic');
    // Debe haber escrito state.json con continuationOrphan: true
    const orphanWrite = stateWrites.find(
      (w) => (w.state as Record<string, unknown>).continuationOrphan === true,
    );
    expect(orphanWrite).toBeDefined();
  });

  it('debería clasificar preflight-quota: crear interacción sin top-level request', async () => {
    const config = makeConfig();
    let skipTopLevelRequest = false;
    let registeredInteraction: ActiveInteraction | null = null;
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      makeSessionStore({
        registerInteraction: (t: ActiveInteraction) => {
          registeredInteraction = t;
        },
      }),
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
    expect(result!.requestClassification).toEqual({ type: 'preflight-quota' });
    expect(skipTopLevelRequest).toBe(true);
    expect(registeredInteraction!.interactionType).toBe('client-preflight');
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
        writeStepRequest: async (p) => {
          stepDirs.push(p.stepDir);
        },
      }),
      config,
    );
    await handler.execute({ headers: {}, rawBody: FRESH_BODY, requestId: 'req-1' });
    expect(stepDirs).toHaveLength(1);
    expect(stepDirs[0]).toMatch(/steps[/\\]001$/);
  });

  it('debería clasificar side-request con interactionType side-request', async () => {
    const config = makeConfig();
    let registered: ActiveInteraction | null = null;
    const store = makeSessionStore({
      registerInteraction: (t: ActiveInteraction) => {
        registered = t;
      },
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
    expect(result!.requestClassification).toEqual({ type: 'side-request' });
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
        writeStepRequest: async (p) => {
          stepDirs.push(p.stepDir);
        },
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
    expect(stateDirs.some((s) => s.startsWith('agentic:'))).toBe(true);
    expect(stateDirs.some((s) => s.startsWith('side-request:'))).toBe(true);
    expect(stateDirs.some((s) => s.startsWith('client-preflight:'))).toBe(true);
  });

  it('continuation con múltiples tool_use_ids: usa el primero para encontrar interacción padre', async () => {
    const config = makeConfig();
    const parentInteraction: ActiveInteraction = {
      interactionDir: '/tmp/parent',
      interactionType: 'agentic',
      stepCount: 1,
      requestSequence: 1,
      startedAt: Date.now(),
      requestBodyOmitted: false,
      requestBodyBytes: 100,
      stepsMeta: [],
      sessionId: 's',
      pendingAgentToolUses: [],
      pendingBuiltinToolUses: [],
    };
    const store = makeSessionStore({
      getInteractionByToolUseId: (id: string) => (id === 'first-id' ? parentInteraction : null),
    });
    const body = Buffer.from(
      JSON.stringify({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'first-id', content: 'r1' },
              { type: 'tool_result', tool_use_id: 'second-id', content: 'r2' },
            ],
          },
        ],
        max_tokens: 4096,
      }),
    );
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      store,
      makeAuditWriter(),
      config,
    );
    const result = await handler.execute({ headers: {}, rawBody: body, requestId: 'r' });
    expect(result!.auditInteractionDir).toBe('/tmp/parent');
  });

  it('extractToolUseIdsFromBody extrae IDs correctamente de body válido', async () => {
    const config = makeConfig();
    const captured: string[] = [];
    const store = makeSessionStore({
      getInteractionByToolUseId: (id: string) => {
        captured.push(id);
        return null;
      },
    });
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      store,
      makeAuditWriter(),
      config,
    );
    await handler.execute({
      headers: {},
      rawBody: makeContinuationBody('my-tool-id'),
      requestId: 'r',
    });
    expect(captured).toContain('my-tool-id');
  });

  it('extractToolUseIdsFromBody retorna vacío para body JSON inválido (no crash)', async () => {
    const config = makeConfig();
    // Body que clasifica como continuation por tener tool_result pero JSON inválido como buffer
    // Usamos cuerpo con tool_result válido para que clasifique, pero que no tenga IDs parseable
    const bodyNoIds = Buffer.from(
      JSON.stringify({
        messages: [{ role: 'user', content: [{ type: 'tool_result', content: 'no-id-field' }] }],
        max_tokens: 4096,
      }),
    );
    const store = makeSessionStore({ getInteractionByToolUseId: () => null });
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      store,
      makeAuditWriter(),
      config,
    );
    // No debe lanzar excepción
    const result = await handler.execute({ headers: {}, rawBody: bodyNoIds, requestId: 'r' });
    expect(result).not.toBeNull();
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

    const result = await handler.execute({
      headers: {
        'user-agent': 'Bun/1.3.13',
        accept: '*/*',
        host: '127.0.0.1:8787',
      },
      rawBody: Buffer.alloc(0),
      requestId: 'health-check-1',
    });

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

    const result = await handler.execute({
      headers: {
        'user-agent': 'Bun/1.3.13',
        authorization: 'Bearer <ANTHROPIC_KEY_REDACTED>xxx',
        host: '127.0.0.1:8787',
      },
      rawBody: Buffer.alloc(0),
      requestId: 'req-1',
    });

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

    const result = await handler.execute({
      headers: {
        'user-agent': 'Bun/1.3.13',
        host: '127.0.0.1:8787',
      },
      rawBody: Buffer.from('{"test":true}'),
      requestId: 'req-1',
    });

    expect(result).not.toBeNull();
    expect(interactionWritten).toBe(true);
  });

  it('subagente unívoco: fresh + 1 pending → handleSubagent crea sub-interaction y consume pending', async () => {
    const config = makeConfig();
    const parentInteraction: ActiveInteraction = {
      interactionDir: '/tmp/sessions/s/interactions/000001_parent',
      interactionType: 'agentic',
      stepCount: 3,
      requestSequence: 1,
      startedAt: Date.now(),
      requestBodyOmitted: false,
      requestBodyBytes: 100,
      stepsMeta: [],
      sessionId: 's',
      pendingAgentToolUses: [
        { stepIndex: 2, toolUseId: 'toolu_unique', subagentType: 'general-purpose' },
      ],
      pendingBuiltinToolUses: [],
    };
    let consumed: { dir: string; id: string } | null = null;
    let registeredSub: ActiveInteraction | null = null;
    const subWrites: unknown[] = [];
    const stateWrites: Array<{ dir: string; state: unknown }> = [];

    const store = makeSessionStore({
      findInteractionWithPendingAgents: () => ({
        interaction: parentInteraction,
        pendings: [...parentInteraction.pendingAgentToolUses],
      }),
      consumePendingAgentToolUse: (dir, id) => {
        consumed = { dir, id };
      },
      registerInteraction: (t: ActiveInteraction) => {
        registeredSub = t;
      },
    });
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      store,
      makeAuditWriter({
        nextSubInteractionSequence: async () => 1,
        writeSubInteractionRequest: async (p) => {
          subWrites.push(p);
          return {
            dir: `${p.parentInteractionDir}/steps/002/sub-interactions/${p.folderName}`,
            requestBodyOmitted: false,
          };
        },
        writeInteractionState: async (dir, state) => {
          stateWrites.push({ dir, state });
        },
      }),
      config,
    );

    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 's' },
      rawBody: FRESH_BODY,
      requestId: 'sub-req-1',
    });

    expect(result).not.toBeNull();
    expect(result!.interactionType).toBe('agentic');
    expect(result!.auditInteractionDir).toContain('sub-interactions');
    expect(result!.auditInteractionDir).toContain('steps/002');
    expect(consumed).toEqual({ dir: parentInteraction.interactionDir, id: 'toolu_unique' });
    expect(subWrites).toHaveLength(1);
    expect(registeredSub).not.toBeNull();
    expect(registeredSub!.parentContext).toEqual({
      parentInteractionDir: parentInteraction.interactionDir,
      parentStepIndex: 2,
      triggeringToolUseId: 'toolu_unique',
      subagentType: 'general-purpose',
    });
    const subState = stateWrites.find(
      (s) => (s.state as Record<string, unknown>).parentContext !== undefined,
    );
    expect(subState).toBeDefined();
  });

  it('subagente ambiguo: fresh + >1 pending → triggeringToolUseId=null y NO se consume pending', async () => {
    const config = makeConfig();
    const parentInteraction: ActiveInteraction = {
      interactionDir: '/tmp/sessions/s/interactions/000001_parent',
      interactionType: 'agentic',
      stepCount: 2,
      requestSequence: 1,
      startedAt: Date.now(),
      requestBodyOmitted: false,
      requestBodyBytes: 100,
      stepsMeta: [],
      sessionId: 's',
      pendingAgentToolUses: [
        { stepIndex: 1, toolUseId: 'toolu_a', subagentType: 'Explore' },
        { stepIndex: 1, toolUseId: 'toolu_b', subagentType: 'Plan' },
      ],
      pendingBuiltinToolUses: [],
    };
    let consumeCalls = 0;
    let registeredSub: ActiveInteraction | null = null;

    const store = makeSessionStore({
      findInteractionWithPendingAgents: () => ({
        interaction: parentInteraction,
        pendings: [...parentInteraction.pendingAgentToolUses],
      }),
      consumePendingAgentToolUse: () => {
        consumeCalls += 1;
      },
      registerInteraction: (t: ActiveInteraction) => {
        registeredSub = t;
      },
    });
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      store,
      makeAuditWriter({
        nextSubInteractionSequence: async () => 1,
        writeSubInteractionRequest: async (p) => ({
          dir: `${p.parentInteractionDir}/steps/001/sub-interactions/${p.folderName}`,
          requestBodyOmitted: false,
        }),
      }),
      config,
    );

    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 's' },
      rawBody: FRESH_BODY,
      requestId: 'sub-amb',
    });

    expect(result).not.toBeNull();
    expect(consumeCalls).toBe(0);
    expect(registeredSub!.parentContext).toEqual({
      parentInteractionDir: parentInteraction.interactionDir,
      parentStepIndex: 1,
      triggeringToolUseId: null,
    });
  });

  it('handleSubagent serializa la asignación de secuencia dentro de withSessionLock', async () => {
    const config = makeConfig();
    const parentInteraction: ActiveInteraction = {
      interactionDir: '/tmp/sessions/s/interactions/000001_parent',
      interactionType: 'agentic',
      stepCount: 2,
      requestSequence: 1,
      startedAt: Date.now(),
      requestBodyOmitted: false,
      requestBodyBytes: 100,
      stepsMeta: [],
      sessionId: 's',
      pendingAgentToolUses: [{ stepIndex: 1, toolUseId: 'toolu_x' }],
      pendingBuiltinToolUses: [],
    };
    const order: string[] = [];
    const store = makeSessionStore({
      findInteractionWithPendingAgents: () => ({
        interaction: parentInteraction,
        pendings: [...parentInteraction.pendingAgentToolUses],
      }),
      withSessionLock: async <T>(_sessionId: string, fn: () => Promise<T>): Promise<T> => {
        order.push('lock-acquire');
        const r = await fn();
        order.push('lock-release');
        return r;
      },
    });
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      store,
      makeAuditWriter({
        nextSubInteractionSequence: async () => {
          order.push('next-seq');
          return 5;
        },
        writeSubInteractionRequest: async (p) => {
          order.push('write-sub');
          return { dir: `${p.parentInteractionDir}/sub`, requestBodyOmitted: false };
        },
      }),
      config,
    );

    await handler.execute({ headers: {}, rawBody: FRESH_BODY, requestId: 'sub' });
    expect(order[0]).toBe('lock-acquire');
    expect(order[order.length - 1]).toBe('lock-release');
    expect(order.indexOf('next-seq')).toBeGreaterThan(order.indexOf('lock-acquire'));
    expect(order.indexOf('next-seq')).toBeLessThan(order.indexOf('lock-release'));
    expect(order.indexOf('write-sub')).toBeGreaterThan(order.indexOf('next-seq'));
  });

  it('continuation consume pendings cuyo toolUseId aparece en tool_result_ids del body', async () => {
    const config = makeConfig();
    const parentInteraction: ActiveInteraction = {
      interactionDir: '/tmp/sessions/s/interactions/000001_parent',
      interactionType: 'agentic',
      stepCount: 1,
      requestSequence: 1,
      startedAt: Date.now(),
      requestBodyOmitted: false,
      requestBodyBytes: 100,
      stepsMeta: [],
      sessionId: 's',
      pendingAgentToolUses: [{ stepIndex: 1, toolUseId: 'tool-x', subagentType: 'Plan' }],
      pendingBuiltinToolUses: [],
    };
    const consumed: Array<{ dir: string; id: string }> = [];

    const store = makeSessionStore({
      getInteractionByToolUseId: (id: string) => (id === 'tool-x' ? parentInteraction : null),
      consumePendingAgentToolUse: (dir, id) => {
        consumed.push({ dir, id });
      },
    });
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      store,
      makeAuditWriter(),
      config,
    );

    const result = await handler.execute({
      headers: {},
      rawBody: CONTINUATION_BODY, // contiene tool_result con tool_use_id 'tool-x'
      requestId: 'cont-1',
    });

    expect(result).not.toBeNull();
    expect(consumed).toEqual([{ dir: parentInteraction.interactionDir, id: 'tool-x' }]);
  });

  it('fresh sin pendings agent → handleFresh (no se invoca writeSubInteractionRequest)', async () => {
    const config = makeConfig();
    let subCalled = false;
    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      makeSessionStore({ findInteractionWithPendingAgents: () => null }),
      makeAuditWriter({
        writeSubInteractionRequest: async () => {
          subCalled = true;
          return { dir: '', requestBodyOmitted: false };
        },
      }),
      config,
    );
    const result = await handler.execute({
      headers: {},
      rawBody: FRESH_BODY,
      requestId: 'r-plain',
    });
    expect(result).not.toBeNull();
    expect(subCalled).toBe(false);
  });

  it('closeOrphanInteraction invoca updateSessionMetrics dentro de withSessionLock', async () => {
    const config = makeConfig();
    let lockSessionId: string | null = null;
    let metricsCalled = false;

    const orphanInteraction: ActiveInteraction = {
      interactionDir: '/tmp/sessions/test/interactions/000001_orphan',
      interactionType: 'agentic',
      stepCount: 1,
      requestSequence: 1,
      startedAt: Date.now() - 120_000,
      requestBodyOmitted: false,
      requestBodyBytes: 100,
      stepsMeta: [{ stepIndex: 1, sse: true, statusCode: 200, inputTokens: 10, outputTokens: 5 }],
      sessionId: 'test-session',
      pendingAgentToolUses: [],
      pendingBuiltinToolUses: [],
      modelId: 'claude-opus-4-5',
    };

    const store = makeSessionStore({
      findStaleInteractionsAwaitingContinuation: () => [orphanInteraction],
      withSessionLock: async <T>(sessionId: string, fn: () => Promise<T>): Promise<T> => {
        lockSessionId = sessionId;
        return fn();
      },
    });

    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      store,
      makeAuditWriter({
        updateSessionMetrics: async () => {
          metricsCalled = true;
        },
      }),
      config,
    );

    await handler.execute({
      headers: {},
      rawBody: FRESH_BODY,
      requestId: 'req-new',
    });

    expect(lockSessionId).toBe('test-session');
    expect(metricsCalled).toBe(true);
  });

  it('fresh interaction debe cerrar orphan interactions stale de la misma sesión', async () => {
    const config = makeConfig();
    const orphanInteraction = {
      interactionDir: '/tmp/sessions/test/interactions/000001_orphan',
      interactionType: 'agentic' as const,
      stepCount: 1,
      requestSequence: 1,
      startedAt: Date.now() - 120_000,
      requestBodyOmitted: false,
      requestBodyBytes: 100,
      stepsMeta: [{ stepIndex: 1, sse: true, statusCode: 200, stopReason: 'tool_use' }],
      sessionId: 'test-session',
      pendingAgentToolUses: [{ stepIndex: 1, toolUseId: 'toolu_orphan' }],
      pendingBuiltinToolUses: [],
      awaitingContinuation: true,
      awaitingSince: Date.now() - 120_000,
    };

    let orphanMetaWritten: Record<string, unknown> | null = null;
    let orphanStateRemoved = false;
    let orphanClosed = false;

    const store = makeSessionStore({
      findStaleInteractionsAwaitingContinuation: (_sid: string, _maxAge: number) => [orphanInteraction],
      closeInteraction: (dir: string) => {
        if (dir === orphanInteraction.interactionDir) orphanClosed = true;
      },
    });

    const handler = new AuditInteractionHandler(
      new SessionResolverService(config),
      store,
      makeAuditWriter({
        writeInteractionMeta: async (dir, meta) => {
          if (dir === orphanInteraction.interactionDir)
            orphanMetaWritten = meta as unknown as Record<string, unknown>;
        },
        removeInteractionState: async (dir) => {
          if (dir === orphanInteraction.interactionDir) orphanStateRemoved = true;
        },
      }),
      config,
    );

    await handler.execute({
      headers: {},
      rawBody: FRESH_BODY,
      requestId: 'req-new',
    });

    expect(orphanClosed).toBe(true);
    expect(orphanMetaWritten).not.toBeNull();
    expect(orphanMetaWritten!.outcome).toBe('orphaned');
    expect(orphanMetaWritten!.lostPendingAgents).toHaveLength(1);
    expect(orphanStateRemoved).toBe(true);
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

    const result = await handler.execute({
      headers: {
        'user-agent': 'claude-cli/2.1.113',
        authorization: 'Bearer <ANTHROPIC_KEY_REDACTED>xxx',
        host: '127.0.0.1:8787',
      },
      rawBody: FRESH_BODY,
      requestId: 'req-1',
    });

    expect(result).not.toBeNull();
    expect(interactionWritten).toBe(true);
  });
});
