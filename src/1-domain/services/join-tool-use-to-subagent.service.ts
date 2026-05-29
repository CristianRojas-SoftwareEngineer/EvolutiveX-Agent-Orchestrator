import type {
  AgentContext,
  CorrelationMethod,
  CorrelationStatus,
  PendingAgentToolUse,
} from '../types/audit.types.js';

/**
 * Función pura de dominio que resuelve el join tool_use_id↔subagente según la
 * tabla de política §23. Sin I/O ni efectos secundarios.
 *
 * Tabla de decisión (en orden de prioridad decreciente):
 * - Con cabeceras (isSubagentRequest=true): correlationMethod siempre 'agent-headers'.
 *   - 0 pendings → toolUseId=null.
 *   - 1 pending → ese pending.
 *   - N pendings + prompt match único → el del match.
 *   - N pendings sin match → FIFO (primer pending registrado).
 * - Sin cabeceras (legacy):
 *   - 0 pendings → null / 'none' / unresolved.
 *   - 1 pending → ese pending / 'unique-pending' / resolved.
 *   - N pendings + prompt match único → el del match / 'prompt' / resolved.
 *   - N pendings sin match → FIFO / 'fifo-pending' / resolved.
 */
export function joinToolUseToSubagent(
  pendings: PendingAgentToolUse[],
  agentCtx: AgentContext | undefined,
  subagentPrompt: string | null,
): {
  toolUseId: string | null;
  subagentType?: string;
  correlationMethod: CorrelationMethod;
  correlationStatus: CorrelationStatus;
} {
  const hasHeaders = agentCtx?.isSubagentRequest === true;

  if (hasHeaders) {
    if (pendings.length === 0) {
      return { toolUseId: null, correlationMethod: 'agent-headers', correlationStatus: 'resolved' };
    }
    if (pendings.length === 1) {
      return {
        toolUseId: pendings[0].toolUseId,
        subagentType: pendings[0].subagentType,
        correlationMethod: 'agent-headers',
        correlationStatus: 'resolved',
      };
    }
    // N pendings con cabeceras: intentar prompt-match único
    if (subagentPrompt) {
      const matches = pendings.filter((p) => p.prompt === subagentPrompt);
      if (matches.length === 1) {
        return {
          toolUseId: matches[0].toolUseId,
          subagentType: matches[0].subagentType,
          correlationMethod: 'agent-headers',
          correlationStatus: 'resolved',
        };
      }
    }
    // FIFO
    return {
      toolUseId: pendings[0].toolUseId,
      subagentType: pendings[0].subagentType,
      correlationMethod: 'agent-headers',
      correlationStatus: 'resolved',
    };
  }

  // Ruta sin cabeceras (legacy)
  if (pendings.length === 0) {
    return { toolUseId: null, correlationMethod: 'none', correlationStatus: 'unresolved' };
  }
  if (pendings.length === 1) {
    return {
      toolUseId: pendings[0].toolUseId,
      subagentType: pendings[0].subagentType,
      correlationMethod: 'unique-pending',
      correlationStatus: 'resolved',
    };
  }
  // N pendings sin cabeceras: intentar prompt-match único
  if (subagentPrompt) {
    const matches = pendings.filter((p) => p.prompt === subagentPrompt);
    if (matches.length === 1) {
      return {
        toolUseId: matches[0].toolUseId,
        subagentType: matches[0].subagentType,
        correlationMethod: 'prompt',
        correlationStatus: 'resolved',
      };
    }
  }
  // FIFO
  return {
    toolUseId: pendings[0].toolUseId,
    subagentType: pendings[0].subagentType,
    correlationMethod: 'fifo-pending',
    correlationStatus: 'resolved',
  };
}
