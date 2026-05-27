import { describe, it, expect, vi } from 'vitest';
import { AuditUpstreamErrorHandler } from '../../src/3-operations/audit-upstream-error.handler.js';
import type { IAuditWriter } from '../../src/2-services/ports/audit-writer.port.js';
import type { ISessionStore } from '../../src/2-services/ports/session-store.port.js';
import {
  ActiveInteraction,
  StepMeta,
  InteractionMetadata,
} from '../../src/1-domain/types/audit.types.js';
import { makeTestConfig as makeConfig } from '../helpers/test-config.js';

function makeSessionStore(
  interaction: ActiveInteraction | null = null,
  overrides: Partial<ISessionStore> = {},
): ISessionStore {
  const registry = new Map<string, ActiveInteraction>();
  if (interaction) registry.set(interaction.interactionDir, interaction);
  return {
    getBaseDir: () => '/tmp/sessions',
    ensureAuditSessionsRoot: async () => {},
    nextMainAgentSequence: async () => 1,
    nextSideInteractionSequence: async () => 1,
    registerInteraction: (t: ActiveInteraction) => {
      registry.set(t.interactionDir, t);
    },
    registerToolUseId: () => {},
    getInteractionByToolUseId: () => null,
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
    updateSessionMetrics: async () => {},
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
  it('debería escribir InteractionMetadata con outcome=upstream-error cuando hay interacción activa', async () => {
    const config = makeConfig();
    let capturedDir: string | null = null;
    let capturedMeta: InteractionMetadata | null = null;
    let interactionCleared = false;
    let stateRemoved = false;

    const activeInteraction: ActiveInteraction = {
      interactionDir: '/tmp/sessions/s/interactions/000001_req-1',
      interactionType: 'agentic',
      stepCount: 2,
      requestSequence: 1,
      startedAt: Date.now() - 200,
      requestBodyOmitted: false,
      requestBodyBytes: 100,
      stepsMeta: [{ stepIndex: 1, sse: true, statusCode: 200, inputTokens: 5, outputTokens: 3 }],
      sessionId: 's',
      pendingAgentToolUses: [],
      pendingWebSearchToolUses: [],
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
    };

    const handler = new AuditUpstreamErrorHandler(
      makeAuditWriter({
        writeInteractionMeta: async (dir, meta) => {
          capturedDir = dir;
          capturedMeta = meta;
        },
        removeInteractionState: async () => {
          stateRemoved = true;
        },
      }),
      config,
      makeSessionStore(activeInteraction, {
        closeInteraction: async () => {
          interactionCleared = true;
        },
      }),
    );

    await handler.execute({
      ...BASE_PARAMS,
      error: Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    });

    expect(capturedDir).toBe('/tmp/sessions/s/interactions/000001_req-1');
    expect(capturedMeta!.outcome).toBe('upstream-error');
    expect(capturedMeta!.interactionType).toBe('agentic');
    expect(capturedMeta!.errorMessage).toContain('ECONNREFUSED');
    expect(capturedMeta!.errorCode).toBe('ECONNREFUSED');
    expect(capturedMeta!.stepCount).toBe(1);
    expect(capturedMeta!.totals).toBeDefined();
    expect(capturedMeta!.totals!.inputTokens).toBe(5);
    expect(capturedMeta!.sse).toBe(true);
    expect(interactionCleared).toBe(true);
    expect(stateRemoved).toBe(true);
  });

  it('debería escribir InteractionMetadata sintético cuando no hay interacción activa registrada', async () => {
    const config = makeConfig();
    let capturedMeta: InteractionMetadata | null = null;

    const handler = new AuditUpstreamErrorHandler(
      makeAuditWriter({
        writeInteractionMeta: async (_dir, meta) => {
          capturedMeta = meta;
        },
      }),
      config,
      makeSessionStore(null),
    );

    await handler.execute({
      ...BASE_PARAMS,
      error: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
    });

    expect(capturedMeta).not.toBeNull();
    expect(capturedMeta!.outcome).toBe('upstream-error');
    expect(capturedMeta!.interactionType).toBe('agentic');
    expect(capturedMeta!.errorMessage).toContain('socket hang up');
    expect(capturedMeta!.errorCode).toBe('ECONNRESET');
    expect(capturedMeta!.stepCount).toBe(0);
    expect(capturedMeta!.steps).toEqual([]);
  });

  it('debería invocar updateSessionMetrics dentro de withSessionLock al cerrar interacción agentic', async () => {
    const config = makeConfig();
    let lockSessionId: string | null = null;
    let metricsCalled = false;

    const activeInteraction: ActiveInteraction = {
      interactionDir: '/tmp/sessions/s/interactions/000001_req-1',
      interactionType: 'agentic',
      stepCount: 2,
      requestSequence: 1,
      startedAt: Date.now() - 200,
      requestBodyOmitted: false,
      requestBodyBytes: 100,
      stepsMeta: [{ stepIndex: 1, sse: true, statusCode: 200, inputTokens: 5, outputTokens: 3 }],
      sessionId: 's',
      pendingAgentToolUses: [],
      pendingWebSearchToolUses: [],
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
      modelId: 'claude-opus-4-5',
    };

    const handler = new AuditUpstreamErrorHandler(
      makeAuditWriter({
        updateSessionMetrics: async () => {
          metricsCalled = true;
        },
      }),
      config,
      makeSessionStore(activeInteraction, {
        withSessionLock: async <T>(sessionId: string, fn: () => Promise<T>): Promise<T> => {
          lockSessionId = sessionId;
          return fn();
        },
      }),
    );

    await handler.execute({
      ...BASE_PARAMS,
      error: Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    });

    expect(lockSessionId).toBe('s');
    expect(metricsCalled).toBe(true);
  });

  it('debería propagar parentContext si el interaction activo es subagente', async () => {
    const config = makeConfig();
    let capturedMeta: InteractionMetadata | null = null;
    const subInteraction: ActiveInteraction = {
      interactionDir: '/tmp/sessions/s/interactions/000001_req-1',
      interactionType: 'agentic',
      stepCount: 1,
      requestSequence: 1,
      startedAt: Date.now() - 100,
      requestBodyOmitted: false,
      requestBodyBytes: 100,
      stepsMeta: [],
      sessionId: 's',
      pendingAgentToolUses: [],
      pendingWebSearchToolUses: [],
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
      parentContext: {
        parentInteractionDir: '/tmp/parent',
        parentStepIndex: 1,
        triggeringToolUseId: 'toolu_z',
        subagentType: 'Plan',
      },
    };

    const handler = new AuditUpstreamErrorHandler(
      makeAuditWriter({
        writeInteractionMeta: async (_dir, meta) => {
          capturedMeta = meta;
        },
      }),
      config,
      makeSessionStore(subInteraction),
    );

    await handler.execute({
      ...BASE_PARAMS,
      error: Object.assign(new Error('boom'), { code: 'ECONNREFUSED' }),
    });

    expect(capturedMeta!.parentContext).toEqual(subInteraction.parentContext);
  });
});
