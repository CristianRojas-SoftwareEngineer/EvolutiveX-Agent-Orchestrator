import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ISessionStore } from '../../src/2-services/ports/session-store.port.js';
import { ContextSyncHandler } from '../../src/3-operations/context-sync.handler.js';
import type { ProxyEnvironmentConfig } from '../../src/1-domain/types/config.types.js';
import type { ActiveTurn, StepMeta, WebFetchStepResolution } from '../../src/1-domain/types/audit.types.js';

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
    CONTEXT_SYNC_MAX_WAIT_MS: 100,
    FILTERED_TOOLS: [],
    ...overrides,
  };
}

function makeStore(resolution: WebFetchStepResolution | null): ISessionStore {
  return {
    getBaseDir: () => '/tmp/sessions',
    ensureAuditSessionsRoot: async () => {},
    nextAuditInteractionSequence: async () => 1,
    registerTurn: (_turn: ActiveTurn) => {},
    registerToolUseId: () => {},
    getTurnByToolUseId: () => null,
    getTurnByDir: async () => null,
    getTurnByDirSync: () => null,
    incrementStepCountByDir: () => 1,
    pushStepMetaByDir: async (_dir: string, _meta: StepMeta) => {},
    closeTurn: () => {},
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
    resolveWebFetchStep: () => resolution,
    onceWebFetchStepResolved: async () => resolution,
    withSessionLock: async <T,>(_sessionId: string, fn: () => Promise<T>): Promise<T> => fn(),
  };
}

describe('ContextSyncHandler', () => {
  it('retorna hit con SSE simulada cuando hay step resuelto y body.json válido', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ctx-sync-'));
    const stepDir = path.join(tmp, 'steps', '002');
    await fs.mkdir(path.join(stepDir, 'response'), { recursive: true });
    await fs.writeFile(
      path.join(stepDir, 'response', 'body.json'),
      JSON.stringify({
        content: [{ type: 'text', text: 'Resumen desde cache' }],
      }),
      'utf8',
    );

    const handler = new ContextSyncHandler(
      makeStore({
        stepDir,
        url: 'https://example.com',
        sessionId: 's1',
        completedAt: Date.now(),
      }),
      makeConfig({ CONTEXT_SYNC_MAX_WAIT_MS: 50 }),
    );

    const result = await handler.tryServeFromCache({
      sessionId: 's1',
      url: 'https://example.com',
      model: 'claude-sonnet-4-6',
    });

    expect(result.kind).toBe('hit');
    if (result.kind === 'hit') {
      const chunks: Buffer[] = [];
      for await (const chunk of result.sseStream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const out = Buffer.concat(chunks).toString('utf8');
      expect(out).toContain('event: message_start');
      expect(out).toContain('Resumen desde cache');
    }
  });

  it('retorna miss cuando no hay step resuelto', async () => {
    const handler = new ContextSyncHandler(makeStore(null), makeConfig({ CONTEXT_SYNC_MAX_WAIT_MS: 10 }));
    const result = await handler.tryServeFromCache({
      sessionId: 's1',
      url: 'https://example.com',
      model: 'claude-sonnet-4-6',
    });
    expect(result).toEqual({ kind: 'miss' });
  });
});
