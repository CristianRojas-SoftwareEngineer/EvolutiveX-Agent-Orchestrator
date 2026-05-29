import type { AgentContext } from '../types/audit.types.js';

export interface WireSubagentEntry {
  sessionId: string;
  agentId: string;
  parentAgentId?: string;
  confirmed?: boolean;
  triggeringToolUseId?: string;
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

  /**
   * Confirma un subagente a partir de un evento hook `SubagentStart`.
   * Maneja la carrera hook-antes-wire creando un placeholder si la entrada aún no existe.
   */
  confirmSubagentFromHook(agentId: string, toolUseId?: string): void;
}
