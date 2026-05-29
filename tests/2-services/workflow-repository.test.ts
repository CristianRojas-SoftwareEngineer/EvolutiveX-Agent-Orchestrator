import { describe, it, expect } from 'vitest';
import { WorkflowRepositoryService } from '../../src/2-services/workflow-repository.service.js';

describe('WorkflowRepositoryService', () => {
  it('openSubagentFromWire registra la entrada indexada por agentId', () => {
    const repo = new WorkflowRepositoryService();
    repo.openSubagentFromWire('session-1', {
      agentId: 'agent-child',
      parentAgentId: 'agent-root',
      isSubagentRequest: true,
    });
    const entry = repo.getWorkflowByAgentId('agent-child');
    expect(entry).toBeDefined();
    expect(entry!.sessionId).toBe('session-1');
    expect(entry!.agentId).toBe('agent-child');
    expect(entry!.parentAgentId).toBe('agent-root');
  });

  it('getWorkflowByAgentId devuelve undefined para agentId desconocido', () => {
    const repo = new WorkflowRepositoryService();
    expect(repo.getWorkflowByAgentId('agent-unknown')).toBeUndefined();
  });

  it('openSubagentFromWire sin agentId no indexa la entrada', () => {
    const repo = new WorkflowRepositoryService();
    repo.openSubagentFromWire('session-1', {
      agentId: undefined,
      parentAgentId: 'agent-root',
      isSubagentRequest: true,
    });
    // Sin agentId no hay nada en el índice
    expect(repo.getWorkflowByAgentId('')).toBeUndefined();
  });

  it('confirmSubagentFromHook wire-antes-hook: marca confirmed y registra toolUseId', () => {
    const repo = new WorkflowRepositoryService();
    repo.openSubagentFromWire('session-1', {
      agentId: 'agent-child',
      isSubagentRequest: true,
    });
    repo.confirmSubagentFromHook('agent-child', 'tu-abc');
    const entry = repo.getWorkflowByAgentId('agent-child');
    expect(entry?.confirmed).toBe(true);
    expect(entry?.triggeringToolUseId).toBe('tu-abc');
  });

  it('confirmSubagentFromHook hook-antes-wire: crea placeholder; openSubagentFromWire preserva confirmed', () => {
    const repo = new WorkflowRepositoryService();
    // Hook llega antes que wire
    repo.confirmSubagentFromHook('agent-child', 'tu-xyz');
    let entry = repo.getWorkflowByAgentId('agent-child');
    expect(entry?.confirmed).toBe(true);
    expect(entry?.triggeringToolUseId).toBe('tu-xyz');
    // Ahora llega el wire
    repo.openSubagentFromWire('session-2', { agentId: 'agent-child', isSubagentRequest: true });
    entry = repo.getWorkflowByAgentId('agent-child');
    expect(entry?.sessionId).toBe('session-2');
    expect(entry?.confirmed).toBe(true);
    expect(entry?.triggeringToolUseId).toBe('tu-xyz');
  });
});
