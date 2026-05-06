import { describe, it, expect, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { AuditStandardResponseHandler } from '../../src/3-operations/audit-standard-response.handler.js';
import type { IAuditWriter } from '../../src/2-services/ports/audit-writer.port.js';
import type { ISessionStore } from '../../src/2-services/ports/session-store.port.js';
import { ProxyEnvironmentConfig } from '../../src/1-domain/types/config.types.js';
import {
  AuditInteractionContext,
  ActiveInteraction,
  StepMeta,
  InteractionMetadata,
} from '../../src/1-domain/types/audit.types.js';

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

function makeActiveInteraction(overrides: Partial<ActiveInteraction> = {}): ActiveInteraction {
  return {
    interactionDir: '/tmp/sessions/test/interactions/000001_req-1',
    interactionType: 'agentic',
    stepCount: 1,
    requestSequence: 1,
    startedAt: Date.now(),
    sessionId: 'test',
    pendingAgentToolUses: [],
    pendingWebSearchToolUses: [],
    pendingWebFetchToolUses: [],
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
    interactionType: 'agentic',
    ...overrides,
  };
}

function makeSessionStore(
  interaction: ActiveInteraction | null = makeActiveInteraction(),
  overrides: Partial<ISessionStore> = {},
): ISessionStore {
  const registry = new Map<string, ActiveInteraction>();
  const toolUseIndex = new Map<string, string>();
  if (interaction) registry.set(interaction.interactionDir, interaction);
  return {
    getBaseDir: () => '/tmp/sessions',
    ensureAuditSessionsRoot: async () => {},
    nextMainAgentSequence: async () => 1,
    nextSideInteractionSequence: async () => 1,
    registerInteraction: (t: ActiveInteraction) => {
      registry.set(t.interactionDir, t);
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
      for (const [id, d] of toolUseIndex) {
        if (d === dir) toolUseIndex.delete(id);
      }
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
    writeCoalescedAgentContinuationRequest: async () => {},
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

describe('AuditStandardResponseHandler', () => {
  it('debería escribir en step dir (finalizeNonSseResponseAudit) y top-level (writeTopLevelMultiStepResponse), y cerrar interacción (terminal)', async () => {
    const config = makeConfig();
    const finalizedDirs: string[] = [];
    let topLevelCalls = 0;
    let interactionMetaWritten = false;
    let interactionCleared = false;

    const handler = new AuditStandardResponseHandler(
      makeAuditWriter({
        finalizeNonSseResponseAudit: async (params) => {
          finalizedDirs.push(params.interactionDir);
          return {
            responseBodyBytesAudited: params.bodyBuffer.length,
            responseTruncatedByProxyBuffer: false,
            responseTruncatedByAuditLimit: false,
          };
        },
        writeTopLevelMultiStepResponse: async () => {
          topLevelCalls++;
          return { written: true };
        },
        writeInteractionMeta: async () => {
          interactionMetaWritten = true;
        },
      }),
      config,
      makeSessionStore(makeActiveInteraction(), {
        closeInteraction: (_dir: string) => {
          interactionCleared = true;
        },
      }),
    );

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), 'application/json');
    stream.write(Buffer.from('{"message":"hello"}'));
    stream.end();

    await new Promise((r) => setTimeout(r, 100));

    // Step dir: finalizeNonSseResponseAudit llamado 1 vez
    expect(finalizedDirs).toHaveLength(1);
    expect(finalizedDirs[0]).toMatch(/steps[/\\]01/);
    // Top-level: writeTopLevelMultiStepResponse llamado 1 vez
    expect(topLevelCalls).toBe(1);
    expect(interactionMetaWritten).toBe(true);
    expect(interactionCleared).toBe(true);
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
          return {
            responseBodyBytesAudited: params.bodyBuffer.length,
            responseTruncatedByProxyBuffer: true,
            responseTruncatedByAuditLimit: false,
          };
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

  it('debería llamar removeInteractionState al cerrar interacción agentic terminal', async () => {
    const config = makeConfig();
    let removeCalled = false;

    const handler = new AuditStandardResponseHandler(
      makeAuditWriter({
        finalizeNonSseResponseAudit: async () => ({
          responseBodyBytesAudited: 10,
          responseTruncatedByProxyBuffer: false,
          responseTruncatedByAuditLimit: false,
        }),
        removeInteractionState: async () => {
          removeCalled = true;
        },
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

  it('debería cerrar interacción preflight inmediatamente y escribir interactionMeta', async () => {
    const config = makeConfig();
    let interactionMetaWritten = false;
    let interactionClosed = false;
    let stepMetaPushed: StepMeta | null = null;
    const preflightInteraction = makeActiveInteraction({ interactionType: 'client-preflight' });

    const handler = new AuditStandardResponseHandler(
      makeAuditWriter({
        writeInteractionMeta: async () => {
          interactionMetaWritten = true;
        },
      }),
      config,
      makeSessionStore(preflightInteraction, {
        pushStepMetaByDir: async (_dir, meta) => {
          stepMetaPushed = meta;
          preflightInteraction.stepsMeta.push(meta);
        },
        closeInteraction: () => {
          interactionClosed = true;
        },
      }),
    );

    const stream = new PassThrough();
    handler.execute(
      stream,
      makeContext({
        interactionType: 'client-preflight',
        requestClassification: { type: 'preflight-quota' },
      }),
      'application/json',
    );
    stream.write('{"ok":true}');
    stream.end();

    await new Promise((r) => setTimeout(r, 100));

    expect(interactionMetaWritten).toBe(true);
    expect(interactionClosed).toBe(true);
    expect(stepMetaPushed).not.toBeNull();
    expect(stepMetaPushed!.label).toBe('quota-check');
  });

  it('debería invocar updateSessionMetrics dentro de withSessionLock al cerrar interacción agentic', async () => {
    const config = makeConfig();
    let lockSessionId: string | null = null;
    let metricsCalled = false;

    const interaction = makeActiveInteraction({
      modelId: 'claude-opus-4-5',
      stepsMeta: [{ stepIndex: 1, sse: false, statusCode: 200, inputTokens: 10, outputTokens: 5 }],
    });

    const handler = new AuditStandardResponseHandler(
      makeAuditWriter({
        finalizeNonSseResponseAudit: async () => ({
          responseBodyBytesAudited: 10,
          responseTruncatedByProxyBuffer: false,
          responseTruncatedByAuditLimit: false,
        }),
        updateSessionMetrics: async () => {
          metricsCalled = true;
        },
      }),
      config,
      makeSessionStore(interaction, {
        withSessionLock: async <T>(sessionId: string, fn: () => Promise<T>): Promise<T> => {
          lockSessionId = sessionId;
          return fn();
        },
      }),
    );

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), 'application/json');
    stream.write(Buffer.from('{"id":"msg_1","stop_reason":"end_turn"}'));
    stream.end();

    await new Promise((r) => setTimeout(r, 100));
    expect(lockSessionId).toBe('test');
    expect(metricsCalled).toBe(true);
  });

  it('debería propagar parentContext al meta.json si el interaction es subagente', async () => {
    const config = makeConfig();
    let captured: InteractionMetadata | null = null;
    const subInteraction = makeActiveInteraction({
      parentContext: {
        parentInteractionDir: '/tmp/parent',
        parentStepIndex: 2,
        triggeringToolUseId: 'toolu_zzz',
        subagentType: 'general-purpose',
      },
    });

    const handler = new AuditStandardResponseHandler(
      makeAuditWriter({
        writeInteractionMeta: async (_dir, meta) => {
          captured = meta;
        },
      }),
      config,
      makeSessionStore(subInteraction),
    );

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), 'application/json');
    stream.write(Buffer.from('{"id":"msg_1","stop_reason":"end_turn"}'));
    stream.end();

    await new Promise((r) => setTimeout(r, 100));
    expect(captured).not.toBeNull();
    expect(captured!.parentContext).toEqual(subInteraction.parentContext);
  });
});
