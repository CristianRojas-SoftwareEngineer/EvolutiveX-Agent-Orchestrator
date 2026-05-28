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
});
