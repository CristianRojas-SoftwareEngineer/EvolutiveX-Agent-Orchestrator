import type { AgentContext } from '../types/audit.types.js';

const HEADER_AGENT_ID = 'x-claude-code-agent-id';
const HEADER_PARENT_AGENT_ID = 'x-claude-code-parent-agent-id';

function getHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) {
      const v = headers[k];
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return undefined;
}

/**
 * Extrae el contexto de agente de las cabeceras HTTP de forma case-insensitive.
 * Función pura: sin I/O ni efectos secundarios.
 */
export function resolveAgentContext(
  headers: Record<string, string | string[] | undefined>,
): AgentContext {
  const agentId = getHeaderValue(headers, HEADER_AGENT_ID) || undefined;
  const parentAgentId = getHeaderValue(headers, HEADER_PARENT_AGENT_ID) || undefined;
  return {
    agentId,
    parentAgentId,
    isSubagentRequest: !!parentAgentId,
  };
}
