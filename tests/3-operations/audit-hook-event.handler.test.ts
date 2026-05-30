import { describe, it, expect, vi } from 'vitest';
import { AuditHookEventHandler } from '../../src/3-operations/audit-hook-event.handler.js';
import type { IWorkflowRepository } from '../../src/1-domain/repositories/IWorkflowRepository.js';
import type { IWorkflow } from '../../src/1-domain/interfaces/gateway/IWorkflow.js';
import type { ISessionStore } from '../../src/2-services/ports/session-store.port.js';
import type { AuditWorkflowClosureHandler } from '../../src/3-operations/audit-workflow-closure.handler.js';
import type { ActiveInteraction } from '../../src/1-domain/types/audit.types.js';

function makeRepo(overrides: Partial<IWorkflowRepository> = {}): IWorkflowRepository {
  return {
    openSubagentFromWire: vi.fn(),
    getWorkflowByAgentId: vi.fn(),
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
    ...overrides,
  };
}

function stubWorkflow(id = 'session-1'): IWorkflow {
  return { id, sessionId: id, kind: 'main', status: 'running', steps: [], startedAt: new Date() };
}

function makeSessionStore(interaction: ActiveInteraction | null = null): ISessionStore {
  return {
    getBaseDir: () => '/tmp/sessions',
    ensureAuditSessionsRoot: async () => {},
    nextMainAgentSequence: async () => 1,
    nextSideInteractionSequence: async () => 1,
    registerInteraction: () => {},
    registerToolUseId: () => {},
    getInteractionByToolUseId: () => null,
    getInteractionByDir: async () => interaction,
    getInteractionByDirSync: () => interaction,
    incrementStepCountByDir: () => 1,
    pushStepMetaByDir: async () => {},
    closeInteraction: vi.fn(),
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
    getAllOpenInteractions: () => (interaction ? [interaction] : []),
    withSessionLock: async <T>(_s: string, fn: () => Promise<T>) => fn(),
    findInteractionForWorkflowClose: () => interaction,
  };
}

function makeClosureHandler(): AuditWorkflowClosureHandler {
  return {
    execute: vi.fn().mockResolvedValue(undefined),
    executeWireFallback: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditWorkflowClosureHandler;
}

function makeHandler(
  repo: IWorkflowRepository,
  sessionStore: ISessionStore,
  closure = makeClosureHandler(),
): AuditHookEventHandler {
  return new AuditHookEventHandler(repo, sessionStore, closure);
}

describe('AuditHookEventHandler', () => {
  it('SubagentStart → confirmSubagentFromHook llamado con agentId y toolUseId', () => {
    const repo = makeRepo();
    const handler = makeHandler(repo, makeSessionStore());

    handler.execute({
      eventName: 'SubagentStart',
      sessionId: 'session-1',
      agentId: 'agent-child',
      toolUseId: 'tu-abc',
    });

    expect(repo.confirmSubagentFromHook).toHaveBeenCalledOnce();
    expect(repo.confirmSubagentFromHook).toHaveBeenCalledWith('agent-child', 'tu-abc');
  });

  it('PreToolUse → completa sin excepción; close no llamado', () => {
    const repo = makeRepo();
    const handler = makeHandler(repo, makeSessionStore());

    expect(() =>
      handler.execute({ eventName: 'PreToolUse', sessionId: 'session-1', toolUseId: 'tu-xyz' }),
    ).not.toThrow();

    expect(repo.close).not.toHaveBeenCalled();
  });

  it('Stop con workflow activo y readyToClose:true → close y delegación al closure handler', async () => {
    const readyToClose = vi.fn().mockReturnValue(true);
    const close = vi.fn().mockReturnValue({
      outcome: 'success',
      stepCount: 1,
      closedByEvent: 'Stop',
      sessionId: 'session-1',
    });
    const getWorkflow = vi.fn().mockReturnValue(stubWorkflow());
    const repo = makeRepo({ getWorkflow, readyToClose, close });
    const turn = {
      interactionDir: '/tmp/i',
      interactionType: 'agentic' as const,
      stepCount: 1,
      requestSequence: 1,
      startedAt: Date.now(),
      requestBodyOmitted: false,
      requestBodyBytes: 0,
      stepsMeta: [],
      sessionId: 'session-1',
      pendingAgentToolUses: [],
      pendingWebSearchToolUses: [],
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
    };
    const closure = makeClosureHandler();
    const handler = makeHandler(repo, makeSessionStore(turn), closure);

    handler.execute({ eventName: 'Stop', sessionId: 'session-1', stopHookActive: false, backgroundTasks: 0 });

    await new Promise((r) => setTimeout(r, 50));

    expect(readyToClose).toHaveBeenCalledWith('session-1', expect.objectContaining({ eventName: 'Stop' }));
    expect(close).toHaveBeenCalledWith('session-1', expect.objectContaining({ eventName: 'Stop' }));
    expect(closure.execute).toHaveBeenCalled();
  });

  it('Stop con stopHookActive:true → readyToClose:false, close no invocado', () => {
    const readyToClose = vi.fn().mockReturnValue(false);
    const close = vi.fn();
    const getWorkflow = vi.fn().mockReturnValue(stubWorkflow());
    const repo = makeRepo({ getWorkflow, readyToClose, close });
    const handler = makeHandler(repo, makeSessionStore());

    handler.execute({ eventName: 'Stop', sessionId: 'session-1', stopHookActive: true });

    expect(readyToClose).toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('Stop sin workflow en repo → no lanza excepción, close no invocado', () => {
    const close = vi.fn();
    const getWorkflow = vi.fn().mockReturnValue(undefined);
    const repo = makeRepo({ getWorkflow, close });
    const handler = makeHandler(repo, makeSessionStore());

    expect(() =>
      handler.execute({ eventName: 'Stop', sessionId: 'session-1' }),
    ).not.toThrow();

    expect(close).not.toHaveBeenCalled();
  });

  it('StopFailure → close directo sin readyToClose', async () => {
    const readyToClose = vi.fn();
    const close = vi.fn().mockReturnValue({
      outcome: 'api_error',
      stepCount: 0,
      closedByEvent: 'StopFailure',
      sessionId: 'session-1',
    });
    const getWorkflow = vi.fn().mockReturnValue(stubWorkflow());
    const repo = makeRepo({ getWorkflow, readyToClose, close });
    const closure = makeClosureHandler();
    const handler = makeHandler(repo, makeSessionStore({
      interactionDir: '/tmp/i',
      interactionType: 'agentic',
      stepCount: 0,
      requestSequence: 1,
      startedAt: Date.now(),
      requestBodyOmitted: false,
      requestBodyBytes: 0,
      stepsMeta: [],
      sessionId: 'session-1',
      pendingAgentToolUses: [],
      pendingWebSearchToolUses: [],
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
    }), closure);

    handler.execute({ eventName: 'StopFailure', sessionId: 'session-1' });

    await new Promise((r) => setTimeout(r, 50));

    expect(readyToClose).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledWith('session-1', expect.objectContaining({ eventName: 'StopFailure' }));
    expect(closure.execute).toHaveBeenCalled();
  });

  it('UserPromptSubmit → openWorkflow invocado con sessionId', () => {
    const openWorkflow = vi.fn();
    const repo = makeRepo({ openWorkflow });
    const handler = makeHandler(repo, makeSessionStore());

    handler.execute({ eventName: 'UserPromptSubmit', sessionId: 'session-1', agentId: 'agent-root' });

    expect(openWorkflow).toHaveBeenCalledWith('session-1', expect.objectContaining({ isSubagentRequest: false }));
  });
});
