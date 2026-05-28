import type { AgentContext } from '../1-domain/types/audit.types.js';
import type { IWorkflowRepository, WireSubagentEntry } from '../1-domain/repositories/IWorkflowRepository.js';

export class WorkflowRepositoryService implements IWorkflowRepository {
  private readonly index = new Map<string, WireSubagentEntry>();

  public openSubagentFromWire(sessionId: string, agentCtx: AgentContext): WireSubagentEntry {
    const entry: WireSubagentEntry = {
      sessionId,
      agentId: agentCtx.agentId ?? '',
      ...(agentCtx.parentAgentId ? { parentAgentId: agentCtx.parentAgentId } : {}),
    };
    if (agentCtx.agentId) {
      this.index.set(agentCtx.agentId, entry);
    }
    return entry;
  }

  public getWorkflowByAgentId(agentId: string): WireSubagentEntry | undefined {
    return this.index.get(agentId);
  }
}
