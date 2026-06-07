import { describe, it, expect } from 'vitest';
import { joinToolUseToSubagent } from '../../src/1-domain/services/join-tool-use-to-subagent.service.js';
import type { AgentContext, PendingAgentToolUse } from '../../src/1-domain/types/audit.types.js';

const withHeaders: AgentContext = {
  agentId: 'agent-child',
  parentAgentId: 'agent-root',
  isSubagentRequest: true,
};

const noHeaders: AgentContext = {
  agentId: undefined,
  parentAgentId: undefined,
  isSubagentRequest: false,
};

function makePending(
  toolUseId: string,
  prompt?: string,
  subagentType?: string,
): PendingAgentToolUse {
  return { stepIndex: 1, toolUseId, prompt, subagentType };
}

describe('joinToolUseToSubagent', () => {
  // --- Escenarios con cabeceras (agent-headers) ---

  it('cabeceras + 1 pending → agent-headers / resolved / ese pending', () => {
    const result = joinToolUseToSubagent(
      [makePending('toolu_a', 'Task A', 'general-purpose')],
      withHeaders,
      null,
    );
    expect(result).toEqual({
      toolUseId: 'toolu_a',
      subagentType: 'general-purpose',
      correlationMethod: 'agent-headers',
      correlationStatus: 'resolved',
    });
  });

  it('cabeceras + N pendings + prompt match único → agent-headers / resolved / el del match', () => {
    const pendings = [
      makePending('toolu_a', 'Task A', 'general-purpose'),
      makePending('toolu_b', 'Task B', 'Plan'),
    ];
    const result = joinToolUseToSubagent(pendings, withHeaders, 'Task B');
    expect(result).toEqual({
      toolUseId: 'toolu_b',
      subagentType: 'Plan',
      correlationMethod: 'agent-headers',
      correlationStatus: 'resolved',
    });
  });

  it('cabeceras + N pendings sin match de prompt → agent-headers / resolved / FIFO (primero)', () => {
    const pendings = [
      makePending('toolu_a', 'Task A', 'general-purpose'),
      makePending('toolu_b', 'Task B', 'Plan'),
    ];
    const result = joinToolUseToSubagent(pendings, withHeaders, 'Task desconocida');
    expect(result).toEqual({
      toolUseId: 'toolu_a',
      subagentType: 'general-purpose',
      correlationMethod: 'agent-headers',
      correlationStatus: 'resolved',
    });
  });

  it('cabeceras + 0 pendings → agent-headers / resolved / toolUseId=null', () => {
    const result = joinToolUseToSubagent([], withHeaders, null);
    expect(result).toEqual({
      toolUseId: null,
      correlationMethod: 'agent-headers',
      correlationStatus: 'resolved',
    });
    expect(result.subagentType).toBeUndefined();
  });

  // --- Escenarios sin cabeceras (legacy) ---

  it('sin cabeceras + 1 pending → unique-pending / resolved / ese pending', () => {
    const result = joinToolUseToSubagent(
      [makePending('toolu_x', undefined, 'Explore')],
      noHeaders,
      null,
    );
    expect(result).toEqual({
      toolUseId: 'toolu_x',
      subagentType: 'Explore',
      correlationMethod: 'unique-pending',
      correlationStatus: 'resolved',
    });
  });

  it('sin cabeceras + N pendings + prompt match único → prompt / resolved / el del match', () => {
    const pendings = [
      makePending('toolu_x', 'busca esto', 'Explore'),
      makePending('toolu_y', 'planifica esto', 'Plan'),
    ];
    const result = joinToolUseToSubagent(pendings, noHeaders, 'busca esto');
    expect(result).toEqual({
      toolUseId: 'toolu_x',
      subagentType: 'Explore',
      correlationMethod: 'prompt',
      correlationStatus: 'resolved',
    });
  });

  it('sin cabeceras + N pendings sin match de prompt → fifo-pending / resolved / FIFO (primero)', () => {
    const pendings = [
      makePending('toolu_x', 'Task X', 'Explore'),
      makePending('toolu_y', 'Task Y', 'Plan'),
    ];
    const result = joinToolUseToSubagent(pendings, noHeaders, null);
    expect(result).toEqual({
      toolUseId: 'toolu_x',
      subagentType: 'Explore',
      correlationMethod: 'fifo-pending',
      correlationStatus: 'resolved',
    });
  });

  it('sin cabeceras + 0 pendings → none / unresolved / toolUseId=null', () => {
    const result = joinToolUseToSubagent([], noHeaders, null);
    expect(result).toEqual({
      toolUseId: null,
      correlationMethod: 'none',
      correlationStatus: 'unresolved',
    });
    expect(result.subagentType).toBeUndefined();
  });

  // --- Casos de borde ---

  it('sin cabeceras + N pendings + prompt matchea 0 → FIFO', () => {
    const pendings = [makePending('toolu_1'), makePending('toolu_2')];
    const result = joinToolUseToSubagent(pendings, noHeaders, 'prompt sin match');
    expect(result.correlationMethod).toBe('fifo-pending');
    expect(result.toolUseId).toBe('toolu_1');
  });

  it('sin cabeceras + N pendings + prompt matchea >1 → FIFO', () => {
    const pendings = [
      makePending('toolu_1', 'mismo prompt'),
      makePending('toolu_2', 'mismo prompt'),
    ];
    const result = joinToolUseToSubagent(pendings, noHeaders, 'mismo prompt');
    expect(result.correlationMethod).toBe('fifo-pending');
    expect(result.toolUseId).toBe('toolu_1');
  });

  it('agentCtx undefined (sin cabeceras) + 1 pending → unique-pending', () => {
    const result = joinToolUseToSubagent([makePending('toolu_z')], undefined, null);
    expect(result.correlationMethod).toBe('unique-pending');
    expect(result.toolUseId).toBe('toolu_z');
  });
});
