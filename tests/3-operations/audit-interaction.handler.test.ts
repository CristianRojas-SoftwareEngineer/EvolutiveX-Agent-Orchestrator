import { describe, it, expect, vi } from 'vitest';
import { AuditInteractionHandler } from '../../src/3-operations/audit-interaction.handler.js';
import { SessionResolverService } from '../../src/1-domain/services/session-resolver.service.js';
import type { ISessionStore } from '../../src/2-services/ports/session-store.port.js';
import type { IAuditWriter } from '../../src/2-services/ports/audit-writer.port.js';
import type { IWorkflowRepository, WireSubagentEntry } from '../../src/1-domain/repositories/IWorkflowRepository.js';
import type { AgentContext } from '../../src/1-domain/types/audit.types.js';
import { ActiveInteraction, StepMeta } from '../../src/1-domain/types/audit.types.js';
import { makeTestConfig as makeConfig } from '../helpers/test-config.js';

function makeWorkflowRepo(overrides: Partial<IWorkflowRepository> = {}): IWorkflowRepository & { calls: AgentContext[] } {
  const calls: AgentContext[] = [];
  const store = new Map<string, WireSubagentEntry>();
  return {
    calls,
    openSubagentFromWire: vi.fn().mockImplementation((sessionId: string, agentCtx: AgentContext) => {
      calls.push(agentCtx);
      const entry: WireSubagentEntry = { sessionId, agentId: agentCtx.agentId ?? '', ...(agentCtx.parentAgentId ? { parentAgentId: agentCtx.parentAgentId } : {}) };
      if (agentCtx.agentId) store.set(agentCtx.agentId, entry);
      return entry;
    }),
    getWorkflowByAgentId: (id: string) => store.get(id),
    confirmSubagentFromHook: vi.fn(),
    openWorkflow: vi.fn(),
    openSubagentWorkflow: vi.fn(),
    getWorkflow: vi.fn(),
    registerStep: vi.fn(),
    closeStep: vi.fn(),
    registerToolUse: vi.fn(),
    readyToClose: vi.fn(),
    close: vi.fn(),
    setWorkflowModel: vi.fn(),
    completeToolUse: vi.fn(),
    getWorkflowBySessionId: vi.fn(),
    findWorkflowWithPendingToolUse: vi.fn(),
    registerPendingToolUse: vi.fn(),
    consumePendingToolUse: vi.fn(),
    findStaleWorkflows: vi.fn(() => []),
    nextSequence: vi.fn(async () => 0),
    withSessionLock: vi.fn(async (_s, fn) => fn()),
    ...overrides,
  };
}

function makeSessionStore(overrides: Partial<ISessionStore> = {}): ISessionStore {
  const registry = new Map<string, ActiveInteraction>();
  const toolUseIndex = new Map<string, string>();
  return {
    getBaseDir: () => '/tmp/sessions',
    ensureAuditSessionsRoot: async () => {},
    nextMainAgentSequence: async () => 1,
    nextSideInteractionSequence: async () => 1,
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
    registerPendingWebSearchToolUse: vi.fn(),
    findInteractionWithPendingWebSearch: vi.fn().mockReturnValue(null),
    consumeWebSearchPending: vi.fn().mockReturnValue(null),
    registerPendingWebFetchToolUse: vi.fn(),
    findInteractionWithPendingWebFetch: vi.fn().mockReturnValue(null),
    consumeWebFetchPending: vi.fn().mockReturnValue(null),
    consumeWebSearchPendingByToolUseId: vi.fn().mockReturnValue(null),
    consumeWebFetchPendingByToolUseId: vi.fn().mockReturnValue(null),
    registerResolvedInternalTool: vi.fn(),
    findStaleInteractionsAwaitingContinuation: () => [],
    getAllOpenInteractions: () => [],
    withSessionLock: async <T>(_sessionId: string, fn: () => Promise<T>): Promise<T> => fn(),
    findInteractionForWorkflowClose: () => null,
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
    writeTopLevelResponseHeaders: async () => {},
    writeInteractionMeta: async () => {},
    appendSseLine: () => {},
    appendSseRawChunk: () => {},
    writeInteractionState: async () => {},
    removeInteractionState: async () => {},
    writeStepResponseMarkdown: async () => {},
    writeCoalescedAgentStepResponse: async () => {},
    writeStepThought: async () => {},
    writeTopLevelMultiStepResponse: async () => ({ written: true }),
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
  it('debería clasificar fresh: crear interacción y registrar interacción', async () => {
    const config = makeConfig();
    let registeredInteraction: ActiveInteraction | null = null;
    const store = makeSessionStore({
      registerInteraction: (interaction: ActiveInteraction) => {
        registeredInteraction = interaction;
      },
    });
    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
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
      nextSideInteractionSequence: async () => {
        seq += 1;
        return seq;
      },
      registerInteraction: (interaction: ActiveInteraction) => {
        registeredInteractions.push(interaction);
      },
    });
    const dirs: string[] = [];
    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
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
      handler.execute({
        headers: { 'x-cc-audit-session': 's' },
        rawBody: FRESH_BODY,
        requestId: 'req-1',
      }),
      handler.execute({
        headers: { 'x-cc-audit-session': 's' },
        rawBody: FRESH_BODY,
        requestId: 'req-2',
      }),
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
      pendingWebSearchToolUses: [],
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
    };
    const store = makeSessionStore({
      getInteractionByToolUseId: (id: string) => (id === 'tool-x' ? parentInteraction : null),
      incrementStepCountByDir: (_dir: string) => {
        parentInteraction.stepCount = 2;
        return 2;
      },
    });
    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
      store,
      makeAuditWriter({
        writeStepRequest: async () => {
          stepRequestWritten = true;
        },
      }),
      config,
    );
    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 'test-session' },
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
      new SessionResolverService(),
      store,
      makeAuditWriter({
        writeInteractionState: async (dir, state) => {
          stateWrites.push({ dir, state });
        },
      }),
      config,
    );
    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 'test-session' },
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
      new SessionResolverService(),
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
      headers: { 'x-cc-audit-session': 'test-session' },
      rawBody: QUOTA_BODY,
      requestId: 'req-1',
    });
    expect(result!.interactionType).toBe('client-preflight');
    expect(result!.requestClassification).toEqual({ type: 'preflight-quota' });
    expect(skipTopLevelRequest).toBe(true);
    expect(registeredInteraction!.interactionType).toBe('client-preflight');
  });

  it('debería eliminar la cabecera de sesión antes de reenviar al upstream', async () => {
    const config = makeConfig();
    const headers: Record<string, string | string[] | undefined> = {
      'x-cc-audit-session': 'my-session',
      'content-type': 'application/json',
    };
    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
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
      new SessionResolverService(),
      makeSessionStore(),
      makeAuditWriter({
        writeStepRequest: async (p) => {
          stepDirs.push(p.stepDir);
        },
      }),
      config,
    );
    await handler.execute({
      headers: { 'x-cc-audit-session': 'test' },
      rawBody: FRESH_BODY,
      requestId: 'req-1',
    });
    expect(stepDirs).toHaveLength(1);
    expect(stepDirs[0]).toMatch(/steps[/\\]01$/);
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
      new SessionResolverService(),
      store,
      makeAuditWriter(),
      config,
    );
    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 'test' },
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
      new SessionResolverService(),
      makeSessionStore(),
      makeAuditWriter({
        writeStepRequest: async (p) => {
          stepDirs.push(p.stepDir);
        },
      }),
      config,
    );
    await handler.execute({
      headers: { 'x-cc-audit-session': 'test' },
      rawBody: SIDE_REQUEST_BODY,
      requestId: 'req-side',
    });
    expect(stepDirs).toHaveLength(1);
    expect(stepDirs[0]).toMatch(/steps[/\\]01$/);
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
      new SessionResolverService(),
      makeSessionStore(),
      writer,
      config,
    );
    await handler.execute({
      headers: { 'x-cc-audit-session': 'test' },
      rawBody: FRESH_BODY,
      requestId: 'r1',
    });
    await handler.execute({
      headers: { 'x-cc-audit-session': 'test' },
      rawBody: SIDE_REQUEST_BODY,
      requestId: 'r2',
    });
    await handler.execute({
      headers: { 'x-cc-audit-session': 'test' },
      rawBody: QUOTA_BODY,
      requestId: 'r3',
    });
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
      pendingWebSearchToolUses: [],
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
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
      new SessionResolverService(),
      store,
      makeAuditWriter(),
      config,
    );
    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 's' },
      rawBody: body,
      requestId: 'r',
    });
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
      new SessionResolverService(),
      store,
      makeAuditWriter(),
      config,
    );
    await handler.execute({
      headers: { 'x-cc-audit-session': 's' },
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
      new SessionResolverService(),
      store,
      makeAuditWriter(),
      config,
    );
    // No debe lanzar excepción
    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 'test' },
      rawBody: bodyNoIds,
      requestId: 'r',
    });
    expect(result).not.toBeNull();
  });

  it('debería ignorar TODAS las requests resueltas como _unknown sin importar headers', async () => {
    const config = makeConfig();
    let interactionWritten = false;
    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
      makeSessionStore(),
      makeAuditWriter({
        writeInteractionRequest: async () => {
          interactionWritten = true;
          return { dir: '/tmp/test', requestBodyOmitted: false };
        },
      }),
      config,
    );

    // Headers con user-agent claude-cli, authorization, body fresh — pero sin session headers
    const result = await handler.execute({
      headers: {
        'user-agent': 'claude-cli/2.1.113',
        authorization: 'Bearer <ANTHROPIC_KEY_REDACTED>xxx',
        host: '127.0.0.1:8787',
      },
      rawBody: FRESH_BODY,
      requestId: 'pre-session-1',
    });

    expect(result).toBeNull();
    expect(interactionWritten).toBe(false);
  });

  it('debería ignorar HEAD request sin session header (preflight de Claude Code)', async () => {
    const config = makeConfig();
    let interactionWritten = false;
    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
      makeSessionStore(),
      makeAuditWriter({
        writeInteractionRequest: async () => {
          interactionWritten = true;
          return { dir: '/tmp/test', requestBodyOmitted: false };
        },
      }),
      config,
    );

    // HEAD request típica de Claude Code antes de establecer sesión
    const result = await handler.execute({
      headers: {
        'user-agent': 'claude-cli/2.1.113',
        authorization: 'Bearer <ANTHROPIC_KEY_REDACTED>xxx',
        host: '127.0.0.1:8787',
      },
      rawBody: Buffer.alloc(0),
      requestId: 'head-preflight',
    });

    expect(result).toBeNull();
    expect(interactionWritten).toBe(false);
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
      pendingWebSearchToolUses: [],
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
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
      new SessionResolverService(),
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
      correlationStatus: 'resolved',
      correlationMethod: 'unique-pending',
    });
    const subState = stateWrites.find(
      (s) => (s.state as Record<string, unknown>).parentContext !== undefined,
    );
    expect(subState).toBeDefined();
  });

  it('sin cabeceras + >1 pending sin match de prompt → fifo-pending / resuelto al primer pending', async () => {
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
      pendingWebSearchToolUses: [],
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
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
      new SessionResolverService(),
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
    // Con C2, N pendings sin match de prompt → FIFO resuelve al primer pending
    expect(consumeCalls).toBe(1);
    expect(registeredSub!.parentContext).toEqual({
      parentInteractionDir: parentInteraction.interactionDir,
      parentStepIndex: 1,
      triggeringToolUseId: 'toolu_a',
      subagentType: 'Explore',
      correlationStatus: 'resolved',
      correlationMethod: 'fifo-pending',
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
      pendingWebSearchToolUses: [],
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
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
      new SessionResolverService(),
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

    await handler.execute({
      headers: { 'x-cc-audit-session': 's' },
      rawBody: FRESH_BODY,
      requestId: 'sub',
    });
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
      pendingWebSearchToolUses: [],
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
    };
    const consumed: Array<{ dir: string; id: string }> = [];

    const store = makeSessionStore({
      getInteractionByToolUseId: (id: string) => (id === 'tool-x' ? parentInteraction : null),
      consumePendingAgentToolUse: (dir, id) => {
        consumed.push({ dir, id });
      },
    });
    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
      store,
      makeAuditWriter(),
      config,
    );

    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 'test' },
      rawBody: CONTINUATION_BODY, // contiene tool_result con tool_use_id 'tool-x'
      requestId: 'cont-1',
    });

    expect(result).not.toBeNull();
    expect(consumed).toEqual([{ dir: parentInteraction.interactionDir, id: 'tool-x' }]);
  });

  it('continuation de Agent se coalesce en el step padre sin incrementar stepCount', async () => {
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
      pendingWebSearchToolUses: [],
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
    };
    let incrementCalled = false;

    const store = makeSessionStore({
      getInteractionByToolUseId: (id: string) => (id === 'tool-x' ? parentInteraction : null),
      incrementStepCountByDir: () => {
        incrementCalled = true;
        return 2;
      },
    });
    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
      store,
      makeAuditWriter({}),
      config,
    );

    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 'test' },
      rawBody: CONTINUATION_BODY,
      requestId: 'cont-1',
    });

    expect(result).not.toBeNull();
    expect(incrementCalled).toBe(false);
    expect(parentInteraction.stepCount).toBe(1);
    expect(result!.coalescedAgentContinuation).toEqual({
      targetStepIndex: 1,
      toolUseIds: ['tool-x'],
    });
  });

  it('fresh sin pendings agent → handleFresh (no se invoca writeSubInteractionRequest)', async () => {
    const config = makeConfig();
    let subCalled = false;
    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
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
      headers: { 'x-cc-audit-session': 's' },
      rawBody: FRESH_BODY,
      requestId: 'r-plain',
    });
    expect(result).not.toBeNull();
    expect(subCalled).toBe(false);
  });

  it('closeOrphanInteraction escribe meta sin SessionMetricsService per-step', async () => {
    const config = makeConfig();
    let metaWritten = false;

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
      pendingWebSearchToolUses: [],
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
      modelId: 'model-1',
    };

    const store = makeSessionStore({
      findStaleInteractionsAwaitingContinuation: () => [orphanInteraction],
    });

    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
      store,
      makeAuditWriter({
        writeInteractionMeta: async () => {
          metaWritten = true;
        },
      }),
      config,
    );

    await handler.execute({
      headers: { 'x-cc-audit-session': 's' },
      rawBody: FRESH_BODY,
      requestId: 'req-new',
    });

    expect(metaWritten).toBe(true);
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
      pendingWebSearchToolUses: [],
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
      awaitingContinuation: true,
      awaitingSince: Date.now() - 120_000,
    };

    let orphanMetaWritten: Record<string, unknown> | null = null;
    let orphanStateRemoved = false;
    let orphanClosed = false;

    const store = makeSessionStore({
      findStaleInteractionsAwaitingContinuation: (_sid: string, _maxAge: number) => [
        orphanInteraction,
      ],
      closeInteraction: (dir: string) => {
        if (dir === orphanInteraction.interactionDir) orphanClosed = true;
      },
    });

    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
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
      headers: { 'x-cc-audit-session': 's' },
      rawBody: FRESH_BODY,
      requestId: 'req-new',
    });

    expect(orphanClosed).toBe(true);
    expect(orphanMetaWritten).not.toBeNull();
    expect(orphanMetaWritten!.outcome).toBe('orphaned');
    expect(orphanMetaWritten!.lostPendingAgents).toHaveLength(1);
    expect(orphanStateRemoved).toBe(true);
  });

  it('fresh + pending web_fetch → handleWebFetchStep crea step adicional del padre', async () => {
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
      pendingAgentToolUses: [],
      pendingWebSearchToolUses: [],
      pendingWebFetchToolUses: [{ stepIndex: 1, toolUseId: 'toolu_fetch_1' }],
      resolvedInternalTools: [],
    };

    let consumedFetch: string | null = null;
    let stepDirWritten: string | null = null;

    const store = makeSessionStore({
      findInteractionWithPendingWebFetch: vi.fn().mockReturnValue({
        interaction: parentInteraction,
        pendings: [...parentInteraction.pendingWebFetchToolUses],
      }),
      consumeWebFetchPending: vi.fn().mockImplementation((dir: string) => {
        consumedFetch = dir;
        return { stepIndex: 1, toolUseId: 'toolu_fetch_1' };
      }),
      incrementStepCountByDir: (_dir: string) => {
        parentInteraction.stepCount = 3;
        return 3;
      },
    });

    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
      store,
      makeAuditWriter({
        writeStepRequest: async (p) => {
          stepDirWritten = p.stepDir;
        },
      }),
      config,
    );

    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 's' },
      rawBody: FRESH_BODY,
      requestId: 'fetch-req',
    });

    expect(result).not.toBeNull();
    expect(result!.auditInteractionDir).toBe(parentInteraction.interactionDir);
    expect(result!.requestClassification).toEqual({ type: 'fresh' });
    expect(consumedFetch).toBe(parentInteraction.interactionDir);
    expect(stepDirWritten).toContain('steps');
  });

  it('fresh con pending web_fetch Y pending agent → web_fetch tiene prioridad', async () => {
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
      pendingAgentToolUses: [{ stepIndex: 1, toolUseId: 'toolu_agent' }],
      pendingWebSearchToolUses: [],
      pendingWebFetchToolUses: [{ stepIndex: 1, toolUseId: 'toolu_fetch' }],
      resolvedInternalTools: [],
    };

    const store = makeSessionStore({
      findInteractionWithPendingWebFetch: vi.fn().mockReturnValue({
        interaction: parentInteraction,
        pendings: [...parentInteraction.pendingWebFetchToolUses],
      }),
      consumeWebFetchPending: vi.fn().mockReturnValue({ stepIndex: 1, toolUseId: 'toolu_fetch' }),
      incrementStepCountByDir: (_dir: string) => {
        parentInteraction.stepCount = 3;
        return 3;
      },
    });

    let subCalled = false;
    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
      store,
      makeAuditWriter({
        writeSubInteractionRequest: async () => {
          subCalled = true;
          return { dir: '', requestBodyOmitted: false };
        },
      }),
      config,
    );

    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 's' },
      rawBody: FRESH_BODY,
      requestId: 'fetch-vs-agent',
    });

    // WebFetch tiene prioridad: no se crea sub-agente
    expect(result).not.toBeNull();
    expect(result!.auditInteractionDir).toBe(parentInteraction.interactionDir);
    expect(subCalled).toBe(false);
  });

  it('fresh concurrentes con pendings WebSearch asignan steps únicos del padre', async () => {
    const config = makeConfig();
    const parentInteraction: ActiveInteraction = {
      interactionDir: '/tmp/sessions/s/main-agent/interactions/01',
      interactionType: 'agentic',
      stepCount: 3,
      requestSequence: 1,
      startedAt: Date.now(),
      requestBodyOmitted: false,
      requestBodyBytes: 100,
      stepsMeta: [],
      sessionId: 's',
      pendingAgentToolUses: [],
      pendingWebSearchToolUses: [
        { stepIndex: 1, toolUseId: 'websearch-1' },
        { stepIndex: 1, toolUseId: 'websearch-2' },
      ],
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
    };

    const stepDirs: string[] = [];
    const lockCalls: string[] = [];

    const store = makeSessionStore({
      findInteractionWithPendingWebSearch: vi.fn().mockImplementation(() => {
        if (parentInteraction.pendingWebSearchToolUses.length > 0) {
          return {
            interaction: parentInteraction,
            pendings: [...parentInteraction.pendingWebSearchToolUses],
          };
        }
        return null;
      }),
      consumeWebSearchPending: vi.fn().mockImplementation((_dir: string) => {
        const pending = parentInteraction.pendingWebSearchToolUses.shift();
        return pending ?? null;
      }),
      incrementStepCountByDir: (dir: string) => {
        if (dir === parentInteraction.interactionDir) {
          parentInteraction.stepCount += 1;
          return parentInteraction.stepCount;
        }
        return 1;
      },
      withSessionLock: async <T>(sessionId: string, fn: () => Promise<T>): Promise<T> => {
        lockCalls.push(sessionId);
        return fn();
      },
    });

    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
      store,
      makeAuditWriter({
        writeStepRequest: async (p) => {
          stepDirs.push(p.stepDir);
        },
      }),
      config,
    );

    await Promise.all([
      handler.execute({
        headers: { 'x-cc-audit-session': 's' },
        rawBody: FRESH_BODY,
        requestId: 'req-web-1',
      }),
      handler.execute({
        headers: { 'x-cc-audit-session': 's' },
        rawBody: FRESH_BODY,
        requestId: 'req-web-2',
      }),
    ]);

    // Verificar que se llamó al lock para la sesión
    expect(lockCalls).toHaveLength(2);
    expect(lockCalls.every((s) => s === 's')).toBe(true);

    // Verificar que los stepDirs son únicos y diferentes
    expect(new Set(stepDirs).size).toBe(2);
    expect(stepDirs[0]).not.toBe(stepDirs[1]);
    expect(stepDirs.every((d) => d.includes('steps'))).toBe(true);

    // Verificar que se consumieron ambos pendings
    expect(parentInteraction.pendingWebSearchToolUses).toHaveLength(0);
  });

  it('fresh concurrentes con pendings WebFetch asignan steps únicos del padre', async () => {
    const config = makeConfig();
    const parentInteraction: ActiveInteraction = {
      interactionDir: '/tmp/sessions/s/main-agent/interactions/01',
      interactionType: 'agentic',
      stepCount: 3,
      requestSequence: 1,
      startedAt: Date.now(),
      requestBodyOmitted: false,
      requestBodyBytes: 100,
      stepsMeta: [],
      sessionId: 's',
      pendingAgentToolUses: [],
      pendingWebSearchToolUses: [],
      pendingWebFetchToolUses: [
        { stepIndex: 1, toolUseId: 'webfetch-1' },
        { stepIndex: 1, toolUseId: 'webfetch-2' },
      ],
      resolvedInternalTools: [],
    };

    const stepDirs: string[] = [];
    const lockCalls: string[] = [];

    const store = makeSessionStore({
      findInteractionWithPendingWebFetch: vi.fn().mockImplementation(() => {
        if (parentInteraction.pendingWebFetchToolUses.length > 0) {
          return {
            interaction: parentInteraction,
            pendings: [...parentInteraction.pendingWebFetchToolUses],
          };
        }
        return null;
      }),
      consumeWebFetchPending: vi.fn().mockImplementation((_dir: string) => {
        const pending = parentInteraction.pendingWebFetchToolUses.shift();
        return pending ?? null;
      }),
      incrementStepCountByDir: (dir: string) => {
        if (dir === parentInteraction.interactionDir) {
          parentInteraction.stepCount += 1;
          return parentInteraction.stepCount;
        }
        return 1;
      },
      withSessionLock: async <T>(sessionId: string, fn: () => Promise<T>): Promise<T> => {
        lockCalls.push(sessionId);
        return fn();
      },
    });

    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
      store,
      makeAuditWriter({
        writeStepRequest: async (p) => {
          stepDirs.push(p.stepDir);
        },
      }),
      config,
    );

    await Promise.all([
      handler.execute({
        headers: { 'x-cc-audit-session': 's' },
        rawBody: FRESH_BODY,
        requestId: 'req-fetch-1',
      }),
      handler.execute({
        headers: { 'x-cc-audit-session': 's' },
        rawBody: FRESH_BODY,
        requestId: 'req-fetch-2',
      }),
    ]);

    // Verificar que se llamó al lock para la sesión
    expect(lockCalls).toHaveLength(2);
    expect(lockCalls.every((s) => s === 's')).toBe(true);

    // Verificar que los stepDirs son únicos y diferentes
    expect(new Set(stepDirs).size).toBe(2);
    expect(stepDirs[0]).not.toBe(stepDirs[1]);
    expect(stepDirs.every((d) => d.includes('steps'))).toBe(true);

    // Verificar que se consumieron ambos pendings
    expect(parentInteraction.pendingWebFetchToolUses).toHaveLength(0);
  });

  it('assignedStepIndex se asigna correctamente en handleWebSearchStep', async () => {
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
      pendingAgentToolUses: [],
      pendingWebSearchToolUses: [{ stepIndex: 1, toolUseId: 'toolu_search_1' }],
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
    };

    const store = makeSessionStore({
      findInteractionWithPendingWebSearch: vi.fn().mockReturnValue({
        interaction: parentInteraction,
        pendings: [...parentInteraction.pendingWebSearchToolUses],
      }),
      consumeWebSearchPending: vi.fn().mockImplementation((_dir: string) => {
        return { stepIndex: 1, toolUseId: 'toolu_search_1' };
      }),
      incrementStepCountByDir: (_dir: string) => {
        parentInteraction.stepCount = 3;
        return 3;
      },
    });

    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
      store,
      makeAuditWriter({}),
      config,
    );

    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 's' },
      rawBody: FRESH_BODY,
      requestId: 'search-req',
    });

    expect(result).not.toBeNull();
    expect(result!.assignedStepIndex).toBe(3);
    expect(result!.isInternalToolStep).toBe(true);
  });

  it('assignedStepIndex se asigna correctamente en handleWebFetchStep', async () => {
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
      pendingAgentToolUses: [],
      pendingWebSearchToolUses: [],
      pendingWebFetchToolUses: [{ stepIndex: 1, toolUseId: 'toolu_fetch_1' }],
      resolvedInternalTools: [],
    };

    const store = makeSessionStore({
      findInteractionWithPendingWebFetch: vi.fn().mockReturnValue({
        interaction: parentInteraction,
        pendings: [...parentInteraction.pendingWebFetchToolUses],
      }),
      consumeWebFetchPending: vi.fn().mockImplementation((_dir: string) => {
        return { stepIndex: 1, toolUseId: 'toolu_fetch_1' };
      }),
      incrementStepCountByDir: (_dir: string) => {
        parentInteraction.stepCount = 4;
        return 4;
      },
    });

    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
      store,
      makeAuditWriter({}),
      config,
    );

    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 's' },
      rawBody: FRESH_BODY,
      requestId: 'fetch-req',
    });

    expect(result).not.toBeNull();
    expect(result!.assignedStepIndex).toBe(4);
    expect(result!.isInternalToolStep).toBe(true);
  });

  it('assignedStepIndex es 1 para fresh agentic', async () => {
    const config = makeConfig();
    const store = makeSessionStore({});

    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
      store,
      makeAuditWriter({}),
      config,
    );

    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 's' },
      rawBody: FRESH_BODY,
      requestId: 'fresh-req',
    });

    expect(result).not.toBeNull();
    expect(result!.assignedStepIndex).toBe(1);
  });

  it('tools: [] con Web page content: y pending WebFetch se correlaciona como step interno', async () => {
    const config = makeConfig();
    const parentInteraction: ActiveInteraction = {
      interactionDir: '/tmp/sessions/s/main-agent/interactions/01',
      interactionType: 'agentic',
      stepCount: 1,
      requestSequence: 1,
      startedAt: Date.now(),
      requestBodyOmitted: false,
      requestBodyBytes: 100,
      stepsMeta: [],
      sessionId: 's',
      pendingAgentToolUses: [],
      pendingWebSearchToolUses: [],
      pendingWebFetchToolUses: [{ stepIndex: 1, toolUseId: 'toolu_fetch_1' }],
      resolvedInternalTools: [],
    };

    const webFetchBody = Buffer.from(
      JSON.stringify({
        model: 'claude-3-5-sonnet',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Web page content:\n---\nExample Domain\n\nThis domain is for use in documentation examples.',
              },
            ],
          },
        ],
        tools: [],
        max_tokens: 4096,
      }),
    );

    let stepDirWritten: string | null = null;
    let sideInteractionWritten = false;
    let consumeCalled = false;

    const store = makeSessionStore({
      findInteractionWithPendingWebFetch: vi.fn().mockReturnValue({
        interaction: parentInteraction,
        pendings: [...parentInteraction.pendingWebFetchToolUses],
      }),
      consumeWebFetchPending: vi.fn().mockImplementation(() => {
        consumeCalled = true;
        return { stepIndex: 1, toolUseId: 'toolu_fetch_1' };
      }),
      incrementStepCountByDir: () => {
        parentInteraction.stepCount = 2;
        return 2;
      },
      withSessionLock: async <T>(_: string, fn: () => Promise<T>): Promise<T> => fn(),
    });

    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
      store,
      makeAuditWriter({
        writeStepRequest: async (p) => {
          stepDirWritten = p.stepDir;
        },
        writeInteractionRequest: async () => {
          sideInteractionWritten = true;
          return { dir: '', requestBodyOmitted: false };
        },
      }),
      config,
    );

    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 's' },
      rawBody: webFetchBody,
      requestId: 'fetch-req',
    });

    expect(result).not.toBeNull();
    expect(result!.isInternalToolStep).toBe(true);
    expect(result!.assignedStepIndex).toBe(2);
    expect(consumeCalled).toBe(true);
    expect(stepDirWritten).toContain('steps');
    expect(sideInteractionWritten).toBe(false);
  });

  it('tools: [] side-request normal sin Web page content: crea side-interaction', async () => {
    const config = makeConfig();
    const sideRequestBody = Buffer.from(
      JSON.stringify({
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'count tokens' }],
        tools: [],
        max_tokens: 4096,
      }),
    );

    let sideInteractionWritten = false;
    let stepDirWritten: string | null = null;

    const store = makeSessionStore({
      findInteractionWithPendingWebFetch: vi.fn().mockReturnValue(null),
      withSessionLock: async <T>(_: string, fn: () => Promise<T>): Promise<T> => fn(),
    });

    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
      store,
      makeAuditWriter({
        writeInteractionRequest: async () => {
          sideInteractionWritten = true;
          return { dir: '', requestBodyOmitted: false };
        },
        writeStepRequest: async (p) => {
          stepDirWritten = p.stepDir;
        },
      }),
      config,
    );

    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 's' },
      rawBody: sideRequestBody,
      requestId: 'side-req',
    });

    expect(result).not.toBeNull();
    expect(result!.interactionType).toBe('side-request');
    expect(sideInteractionWritten).toBe(true);
    expect(stepDirWritten).not.toBeNull(); // side-requests también escriben steps
    expect(result!.isInternalToolStep).toBeUndefined(); // no es step interno de herramienta
  });

  it('fresh con X-Claude-Code-Parent-Agent-Id + pending → correlationMethod agent-headers, openSubagentFromWire llamado', async () => {
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
      pendingAgentToolUses: [{ stepIndex: 1, toolUseId: 'toolu_abc', subagentType: 'Explore' }],
      pendingWebSearchToolUses: [],
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
    };
    let registeredSub: ActiveInteraction | null = null;
    const workflowRepo = makeWorkflowRepo();

    const store = makeSessionStore({
      findInteractionWithPendingAgents: () => ({
        interaction: parentInteraction,
        pendings: [...parentInteraction.pendingAgentToolUses],
      }),
      registerInteraction: (t: ActiveInteraction) => {
        registeredSub = t;
      },
    });

    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
      store,
      makeAuditWriter({
        nextSubInteractionSequence: async () => 1,
        writeSubInteractionRequest: async (p) => ({
          dir: `${p.parentInteractionDir}/steps/001/sub-interactions/${p.folderName}`,
          requestBodyOmitted: false,
        }),
      }),
      config,
      undefined,
      workflowRepo,
    );

    await handler.execute({
      headers: {
        'x-cc-audit-session': 's',
        'X-Claude-Code-Agent-Id': 'agent-child',
        'X-Claude-Code-Parent-Agent-Id': 'agent-parent',
      },
      rawBody: FRESH_BODY,
      requestId: 'sub-wire-1',
    });

    // openSubagentFromWire debe haberse llamado
    expect(workflowRepo.openSubagentFromWire).toHaveBeenCalledOnce();
    expect(workflowRepo.calls[0].parentAgentId).toBe('agent-parent');

    // correlationMethod debe ser agent-headers
    expect(registeredSub).not.toBeNull();
    expect(registeredSub!.parentContext?.correlationMethod).toBe('agent-headers');
    expect(registeredSub!.parentContext?.correlationStatus).toBe('resolved');
    expect(registeredSub!.parentContext?.wireAgentId).toBe('agent-child');
    expect(registeredSub!.parentContext?.wireParentAgentId).toBe('agent-parent');
  });

  it('fresh sin cabeceras de agente + pending único → fallback unique-pending, openSubagentFromWire no invocado', async () => {
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
      pendingAgentToolUses: [{ stepIndex: 1, toolUseId: 'toolu_xyz', subagentType: 'Plan' }],
      pendingWebSearchToolUses: [],
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
    };
    let registeredSub: ActiveInteraction | null = null;
    const workflowRepo = makeWorkflowRepo();

    const store = makeSessionStore({
      findInteractionWithPendingAgents: () => ({
        interaction: parentInteraction,
        pendings: [...parentInteraction.pendingAgentToolUses],
      }),
      registerInteraction: (t: ActiveInteraction) => {
        registeredSub = t;
      },
    });

    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
      store,
      makeAuditWriter({
        nextSubInteractionSequence: async () => 1,
        writeSubInteractionRequest: async (p) => ({
          dir: `${p.parentInteractionDir}/steps/001/sub-interactions/${p.folderName}`,
          requestBodyOmitted: false,
        }),
      }),
      config,
      undefined,
      workflowRepo,
    );

    await handler.execute({
      headers: { 'x-cc-audit-session': 's' },
      rawBody: FRESH_BODY,
      requestId: 'sub-legacy-1',
    });

    // openSubagentFromWire NO debe haberse llamado
    expect(workflowRepo.openSubagentFromWire).not.toHaveBeenCalled();

    // correlationMethod debe ser unique-pending (heurística)
    expect(registeredSub).not.toBeNull();
    expect(registeredSub!.parentContext?.correlationMethod).toBe('unique-pending');
    expect(registeredSub!.parentContext?.wireAgentId).toBeUndefined();
  });

  it('con cabeceras + 2 pendings con prompts distintos + request que matchea uno → agent-headers / triggeringToolUseId del match', async () => {
    const config = makeConfig();
    // El body del subagente tiene prompt "Task Alpha" que matchea toolu_alpha
    const subagentBody = Buffer.from(
      JSON.stringify({
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Task Alpha' }] }],
        tools: [{ name: 'Read', description: 'lee', input_schema: { type: 'object', properties: {} } }],
        max_tokens: 256,
      }),
    );
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
        { stepIndex: 1, toolUseId: 'toolu_alpha', subagentType: 'general-purpose', prompt: 'Task Alpha' },
        { stepIndex: 1, toolUseId: 'toolu_beta', subagentType: 'Plan', prompt: 'Task Beta' },
      ],
      pendingWebSearchToolUses: [],
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
    };
    let consumed: { dir: string; id: string } | null = null;
    let registeredSub: ActiveInteraction | null = null;
    const workflowRepo = makeWorkflowRepo();

    const store = makeSessionStore({
      findInteractionWithPendingAgents: () => ({
        interaction: parentInteraction,
        pendings: [...parentInteraction.pendingAgentToolUses],
      }),
      consumePendingAgentToolUse: (dir, id) => { consumed = { dir, id }; },
      registerInteraction: (t: ActiveInteraction) => { registeredSub = t; },
    });

    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
      store,
      makeAuditWriter({
        nextSubInteractionSequence: async () => 1,
        writeSubInteractionRequest: async (p) => ({
          dir: `${p.parentInteractionDir}/steps/001/sub-interactions/${p.folderName}`,
          requestBodyOmitted: false,
        }),
      }),
      config,
      undefined,
      workflowRepo,
    );

    await handler.execute({
      headers: {
        'x-cc-audit-session': 's',
        'X-Claude-Code-Agent-Id': 'agent-child',
        'X-Claude-Code-Parent-Agent-Id': 'agent-parent',
      },
      rawBody: subagentBody,
      requestId: 'sub-headers-match',
    });

    expect(workflowRepo.openSubagentFromWire).toHaveBeenCalledOnce();
    expect(registeredSub).not.toBeNull();
    expect(registeredSub!.parentContext?.correlationMethod).toBe('agent-headers');
    expect(registeredSub!.parentContext?.correlationStatus).toBe('resolved');
    expect(registeredSub!.parentContext?.triggeringToolUseId).toBe('toolu_alpha');
    expect(consumed).toEqual({ dir: parentInteraction.interactionDir, id: 'toolu_alpha' });
  });

  it('sin cabeceras + 2 pendings sin match de prompt → fifo-pending / triggeringToolUseId=primer pending / correlationStatus resolved', async () => {
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
        { stepIndex: 1, toolUseId: 'toolu_first', subagentType: 'Explore', prompt: 'Task X' },
        { stepIndex: 1, toolUseId: 'toolu_second', subagentType: 'Plan', prompt: 'Task Y' },
      ],
      pendingWebSearchToolUses: [],
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
    };
    let consumed: { dir: string; id: string } | null = null;
    let registeredSub: ActiveInteraction | null = null;
    const workflowRepo = makeWorkflowRepo();

    const store = makeSessionStore({
      findInteractionWithPendingAgents: () => ({
        interaction: parentInteraction,
        pendings: [...parentInteraction.pendingAgentToolUses],
      }),
      consumePendingAgentToolUse: (dir, id) => { consumed = { dir, id }; },
      registerInteraction: (t: ActiveInteraction) => { registeredSub = t; },
    });

    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
      store,
      makeAuditWriter({
        nextSubInteractionSequence: async () => 1,
        writeSubInteractionRequest: async (p) => ({
          dir: `${p.parentInteractionDir}/steps/001/sub-interactions/${p.folderName}`,
          requestBodyOmitted: false,
        }),
      }),
      config,
      undefined,
      workflowRepo,
    );

    await handler.execute({
      headers: { 'x-cc-audit-session': 's' },
      rawBody: FRESH_BODY, // sin prompt en messages.content (string simple), no matchea
      requestId: 'sub-fifo',
    });

    // openSubagentFromWire NO debe invocarse sin cabeceras
    expect(workflowRepo.openSubagentFromWire).not.toHaveBeenCalled();
    expect(registeredSub).not.toBeNull();
    expect(registeredSub!.parentContext?.correlationMethod).toBe('fifo-pending');
    expect(registeredSub!.parentContext?.correlationStatus).toBe('resolved');
    expect(registeredSub!.parentContext?.triggeringToolUseId).toBe('toolu_first');
    expect(consumed).toEqual({ dir: parentInteraction.interactionDir, id: 'toolu_first' });
  });

  it('Web page content: sin pending WebFetch cae a side-request normal', async () => {
    const config = makeConfig();
    const webFetchBody = Buffer.from(
      JSON.stringify({
        model: 'claude-3-5-sonnet',
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Web page content:\n---\nExample Domain' }],
          },
        ],
        tools: [],
        max_tokens: 4096,
      }),
    );

    let sideInteractionWritten = false;
    let stepDirWritten: string | null = null;

    const store = makeSessionStore({
      findInteractionWithPendingWebFetch: vi.fn().mockReturnValue(null),
      withSessionLock: async <T>(_: string, fn: () => Promise<T>): Promise<T> => fn(),
    });

    const handler = new AuditInteractionHandler(
      new SessionResolverService(),
      store,
      makeAuditWriter({
        writeInteractionRequest: async () => {
          sideInteractionWritten = true;
          return { dir: '', requestBodyOmitted: false };
        },
        writeStepRequest: async (p) => {
          stepDirWritten = p.stepDir;
        },
      }),
      config,
    );

    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 's' },
      rawBody: webFetchBody,
      requestId: 'fetch-no-pending',
    });

    expect(result).not.toBeNull();
    expect(result!.interactionType).toBe('side-request');
    expect(sideInteractionWritten).toBe(true);
    expect(stepDirWritten).not.toBeNull(); // side-requests también escriben steps
    expect(result!.isInternalToolStep).toBeUndefined(); // no es step interno de herramienta
  });
});
