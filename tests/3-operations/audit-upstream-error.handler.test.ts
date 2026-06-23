import { describe, it, expect, vi } from 'vitest';
import { AuditUpstreamErrorHandler } from '../../src/3-operations/audit-upstream-error.handler.js';
import type { IWorkflowRepository } from '../../src/1-domain/repositories/IWorkflowRepository.js';
import type { IWorkflow } from '../../src/1-domain/interfaces/gateway/IWorkflow.js';

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
    completeToolUse: vi.fn(),
    getToolCompletionAuthority: vi.fn(),
    getWorkflowBySessionId: vi.fn(),
    findWorkflowWithPendingToolUse: vi.fn(),
    registerPendingToolUse: vi.fn(),
    consumePendingToolUse: vi.fn(),
    findStaleWorkflows: vi.fn(() => []),
    findStaleWorkflowsAwaitingContinuation: vi.fn(() => []),
    getAllRunningWorkflows: vi.fn(() => []),
    findWorkflowWithPendingTools: vi.fn(),
    findWorkflowByToolUseId: vi.fn(),
    consumeFirstPendingToolUseByName: vi.fn(),
    getWireMeta: vi.fn(),
    patchWireMeta: vi.fn(),
    allocLayoutIndex: vi.fn(async () => 0),
    nextSequence: vi.fn(async () => 0),
    withSessionLock: vi.fn(async (_s, fn) => fn()),
    forceClose: vi.fn(),
    clearToolUseIndexFor: vi.fn(),
    ...overrides,
  };
}

function stubWorkflow(id = 'session-1'): IWorkflow {
  return {
    id,
    sessionId: id,
    kind: 'main',
    closeAuthority: 'stop-hook',
    status: 'running',
    steps: [],
    startedAt: new Date(),
  };
}

const BASE_PARAMS = {
  auditSessionId: 'session-1',
  error: Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }),
};

describe('AuditUpstreamErrorHandler', () => {
  it('llama clearToolUseIndexFor y forceClose con outcome upstream-error cuando existe un workflow', () => {
    const wf = stubWorkflow('session-1');
    const forceClose = vi.fn();
    const clearToolUseIndexFor = vi.fn();
    const repo = makeRepo({
      getWorkflowBySessionId: vi.fn(() => wf),
      forceClose,
      clearToolUseIndexFor,
    });
    const handler = new AuditUpstreamErrorHandler(repo);

    handler.execute(BASE_PARAMS);

    expect(repo.getWorkflowBySessionId).toHaveBeenCalledWith('session-1');
    expect(clearToolUseIndexFor).toHaveBeenCalledWith('session-1');
    expect(forceClose).toHaveBeenCalledWith('session-1', 'upstream-error');
  });

  it('es no-op cuando no existe workflow para la sesión', () => {
    const forceClose = vi.fn();
    const repo = makeRepo({
      getWorkflowBySessionId: vi.fn(() => undefined),
      forceClose,
    });
    const handler = new AuditUpstreamErrorHandler(repo);

    handler.execute(BASE_PARAMS);

    expect(forceClose).not.toHaveBeenCalled();
  });

  it('no lanza si la sesión está vacía', () => {
    const repo = makeRepo({ getWorkflowBySessionId: vi.fn(() => undefined) });
    const handler = new AuditUpstreamErrorHandler(repo);

    expect(() => handler.execute({ auditSessionId: '', error: new Error('x') })).not.toThrow();
  });
});
