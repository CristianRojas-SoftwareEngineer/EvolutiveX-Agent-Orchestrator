import { describe, it, expect, vi } from 'vitest';
import { AuditHookEventHandler } from '../../src/3-operations/audit-hook-event.handler.js';
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
    setWorkflowModel: vi.fn(),
    ...overrides,
  };
}

function stubWorkflow(id = 'session-1'): IWorkflow {
  return { id, sessionId: id, kind: 'main', status: 'running', steps: [], startedAt: new Date() };
}

describe('AuditHookEventHandler', () => {
  // ── SubagentStart (C3, sin cambio) ───────────────────────────────────────

  it('SubagentStart → confirmSubagentFromHook llamado con agentId y toolUseId', () => {
    const repo = makeRepo();
    const handler = new AuditHookEventHandler(repo);

    handler.execute({
      eventName: 'SubagentStart',
      sessionId: 'session-1',
      agentId: 'agent-child',
      toolUseId: 'tu-abc',
    });

    expect(repo.confirmSubagentFromHook).toHaveBeenCalledOnce();
    expect(repo.confirmSubagentFromHook).toHaveBeenCalledWith('agent-child', 'tu-abc');
  });

  // ── PreToolUse (stub) ─────────────────────────────────────────────────────

  it('PreToolUse → completa sin excepción; close no llamado', () => {
    const repo = makeRepo();
    const handler = new AuditHookEventHandler(repo);

    expect(() =>
      handler.execute({ eventName: 'PreToolUse', sessionId: 'session-1', toolUseId: 'tu-xyz' }),
    ).not.toThrow();

    expect(repo.close).not.toHaveBeenCalled();
  });

  // ── Stop ──────────────────────────────────────────────────────────────────

  it('Stop con workflow activo y readyToClose:true → close invocado', () => {
    const readyToClose = vi.fn().mockReturnValue(true);
    const close = vi.fn();
    const getWorkflow = vi.fn().mockReturnValue(stubWorkflow());
    const repo = makeRepo({ getWorkflow, readyToClose, close });
    const handler = new AuditHookEventHandler(repo);

    handler.execute({ eventName: 'Stop', sessionId: 'session-1', stopHookActive: false, backgroundTasks: 0 });

    expect(readyToClose).toHaveBeenCalledWith('session-1', expect.objectContaining({ eventName: 'Stop' }));
    expect(close).toHaveBeenCalledWith('session-1', expect.objectContaining({ eventName: 'Stop' }));
  });

  it('Stop con stopHookActive:true → readyToClose:false, close no invocado', () => {
    const readyToClose = vi.fn().mockReturnValue(false);
    const close = vi.fn();
    const getWorkflow = vi.fn().mockReturnValue(stubWorkflow());
    const repo = makeRepo({ getWorkflow, readyToClose, close });
    const handler = new AuditHookEventHandler(repo);

    handler.execute({ eventName: 'Stop', sessionId: 'session-1', stopHookActive: true });

    expect(readyToClose).toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('Stop sin workflow en repo → no lanza excepción, close no invocado', () => {
    const close = vi.fn();
    const getWorkflow = vi.fn().mockReturnValue(undefined);
    const repo = makeRepo({ getWorkflow, close });
    const handler = new AuditHookEventHandler(repo);

    expect(() =>
      handler.execute({ eventName: 'Stop', sessionId: 'session-1' }),
    ).not.toThrow();

    expect(close).not.toHaveBeenCalled();
  });

  // ── StopFailure ───────────────────────────────────────────────────────────

  it('StopFailure → close directo sin readyToClose', () => {
    const readyToClose = vi.fn();
    const close = vi.fn();
    const getWorkflow = vi.fn().mockReturnValue(stubWorkflow());
    const repo = makeRepo({ getWorkflow, readyToClose, close });
    const handler = new AuditHookEventHandler(repo);

    handler.execute({ eventName: 'StopFailure', sessionId: 'session-1' });

    expect(readyToClose).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledWith('session-1', expect.objectContaining({ eventName: 'StopFailure' }));
  });

  // ── UserPromptSubmit ──────────────────────────────────────────────────────

  it('UserPromptSubmit → openWorkflow invocado con sessionId', () => {
    const openWorkflow = vi.fn();
    const repo = makeRepo({ openWorkflow });
    const handler = new AuditHookEventHandler(repo);

    handler.execute({ eventName: 'UserPromptSubmit', sessionId: 'session-1', agentId: 'agent-root' });

    expect(openWorkflow).toHaveBeenCalledWith('session-1', expect.objectContaining({ isSubagentRequest: false }));
  });
});
