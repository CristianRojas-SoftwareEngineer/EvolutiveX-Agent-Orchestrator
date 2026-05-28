import type { AgentContext } from '../types/audit.types.js';

export interface WireSubagentEntry {
  sessionId: string;
  agentId: string;
  parentAgentId?: string;
}

export interface IWorkflowRepository {
  /**
   * Registra un subagente abierto a partir de las cabeceras de agente wire.
   * Indexa la entrada por `agentCtx.agentId` si está presente.
   */
  openSubagentFromWire(sessionId: string, agentCtx: AgentContext): WireSubagentEntry;

  /**
   * Devuelve la entrada registrada para un agentId, o `undefined` si no existe.
   */
  getWorkflowByAgentId(agentId: string): WireSubagentEntry | undefined;
}
