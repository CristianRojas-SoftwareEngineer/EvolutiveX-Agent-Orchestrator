import type { AgentContext } from '../1-domain/types/audit.types.js';
import type { IWorkflowRepository, WireSubagentEntry } from '../1-domain/repositories/IWorkflowRepository.js';

export class WorkflowRepositoryService implements IWorkflowRepository {
  private readonly index = new Map<string, WireSubagentEntry>();

  public openSubagentFromWire(sessionId: string, agentCtx: AgentContext): WireSubagentEntry {
    const agentId = agentCtx.agentId ?? '';
    // Si ya existe un placeholder creado por hook-antes-wire, preservar confirmed/triggeringToolUseId
    const existing = agentId ? this.index.get(agentId) : undefined;
    const entry: WireSubagentEntry = {
      sessionId,
      agentId,
      ...(agentCtx.parentAgentId ? { parentAgentId: agentCtx.parentAgentId } : {}),
      ...(existing?.confirmed !== undefined ? { confirmed: existing.confirmed } : {}),
      ...(existing?.triggeringToolUseId ? { triggeringToolUseId: existing.triggeringToolUseId } : {}),
    };
    if (agentCtx.agentId) {
      this.index.set(agentCtx.agentId, entry);
    }
    return entry;
  }

  public getWorkflowByAgentId(agentId: string): WireSubagentEntry | undefined {
    return this.index.get(agentId);
  }

  public confirmSubagentFromHook(agentId: string, toolUseId?: string): void {
    const existing = this.index.get(agentId);
    if (existing) {
      // Wire llegó antes: marcar confirmado y registrar toolUseId si viene
      existing.confirmed = true;
      if (toolUseId) existing.triggeringToolUseId = toolUseId;
    } else {
      // Hook-antes-wire (carrera §28): crear placeholder para que openSubagentFromWire lo complete
      const placeholder: WireSubagentEntry = {
        sessionId: '',
        agentId,
        confirmed: true,
        ...(toolUseId ? { triggeringToolUseId: toolUseId } : {}),
      };
      this.index.set(agentId, placeholder);
    }
  }
}
