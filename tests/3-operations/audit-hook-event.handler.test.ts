import { describe, it, expect, vi } from 'vitest';
import { AuditHookEventHandler } from '../../src/3-operations/audit-hook-event.handler.js';
import type { IWorkflowRepository } from '../../src/1-domain/repositories/IWorkflowRepository.js';

function makeRepo(): IWorkflowRepository {
  return {
    openSubagentFromWire: vi.fn(),
    getWorkflowByAgentId: vi.fn(),
    confirmSubagentFromHook: vi.fn(),
  };
}

describe('AuditHookEventHandler', () => {
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

  it('PreToolUse → completa sin excepción; confirmSubagentFromHook no llamado', () => {
    const repo = makeRepo();
    const handler = new AuditHookEventHandler(repo);

    expect(() =>
      handler.execute({ eventName: 'PreToolUse', sessionId: 'session-1', toolUseId: 'tu-xyz' }),
    ).not.toThrow();

    expect(repo.confirmSubagentFromHook).not.toHaveBeenCalled();
  });

  it('Stop con stopHookActive:true → completa sin excepción, sin mutación', () => {
    const repo = makeRepo();
    const handler = new AuditHookEventHandler(repo);

    expect(() =>
      handler.execute({ eventName: 'Stop', sessionId: 'session-1', stopHookActive: true }),
    ).not.toThrow();

    expect(repo.confirmSubagentFromHook).not.toHaveBeenCalled();
  });

  it('Stop con stopHookActive:false → completa sin excepción, sin mutación (cierre diferido)', () => {
    const repo = makeRepo();
    const handler = new AuditHookEventHandler(repo);

    expect(() =>
      handler.execute({ eventName: 'Stop', sessionId: 'session-1', stopHookActive: false }),
    ).not.toThrow();

    expect(repo.confirmSubagentFromHook).not.toHaveBeenCalled();
  });
});
