import { describe, it, expect } from 'vitest';
import { resolveAgentContext } from '../../src/1-domain/services/resolve-agent-context.service.js';

describe('resolveAgentContext', () => {
  it('ambas cabeceras presentes → isSubagentRequest=true con agentId y parentAgentId', () => {
    const result = resolveAgentContext({
      'X-Claude-Code-Agent-Id': 'agent-abc',
      'X-Claude-Code-Parent-Agent-Id': 'agent-root',
    });
    expect(result).toEqual({
      agentId: 'agent-abc',
      parentAgentId: 'agent-root',
      isSubagentRequest: true,
    });
  });

  it('solo Agent-Id presente → isSubagentRequest=false, parentAgentId=undefined', () => {
    const result = resolveAgentContext({
      'X-Claude-Code-Agent-Id': 'agent-root',
    });
    expect(result.agentId).toBe('agent-root');
    expect(result.parentAgentId).toBeUndefined();
    expect(result.isSubagentRequest).toBe(false);
  });

  it('sin cabeceras de agente → todo undefined e isSubagentRequest=false', () => {
    const result = resolveAgentContext({
      'x-cc-audit-session': 'some-session',
      'content-type': 'application/json',
    });
    expect(result).toEqual({
      agentId: undefined,
      parentAgentId: undefined,
      isSubagentRequest: false,
    });
  });

  it('cabeceras en minúsculas → lookup case-insensitive', () => {
    const result = resolveAgentContext({
      'x-claude-code-agent-id': 'agent-xyz',
      'x-claude-code-parent-agent-id': 'agent-parent-xyz',
    });
    expect(result.agentId).toBe('agent-xyz');
    expect(result.parentAgentId).toBe('agent-parent-xyz');
    expect(result.isSubagentRequest).toBe(true);
  });
});
