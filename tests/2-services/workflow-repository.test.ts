import { describe, it, expect } from 'vitest';
import { WorkflowRepositoryService } from '../../src/2-services/workflow-repository.service.js';
import type { ClaudeHookEvent } from '../../src/1-domain/types/hook.types.js';
import type { IStep } from '../../src/1-domain/interfaces/gateway/IStep.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStopHook(overrides: Partial<ClaudeHookEvent> = {}): ClaudeHookEvent {
  return { eventName: 'Stop', sessionId: 'session-1', stopHookActive: false, backgroundTasks: 0, ...overrides };
}

function makeStep(id: string, workflowId: string, closed = false): IStep {
  return {
    id,
    workflowId,
    index: 0,
    inferenceRequest: { model: 'm', messages: [], max_tokens: 1 },
    assistantMessage: { role: 'assistant', content: [] },
    toolUses: [],
    startedAt: new Date(),
    ...(closed ? { closedAt: new Date() } : {}),
  };
}

// ── Wire methods (C1/C2/C3) ───────────────────────────────────────────────────

describe('WorkflowRepositoryService — wire', () => {
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
    repo.confirmSubagentFromHook('agent-child', 'tu-xyz');
    let entry = repo.getWorkflowByAgentId('agent-child');
    expect(entry?.confirmed).toBe(true);
    expect(entry?.triggeringToolUseId).toBe('tu-xyz');
    repo.openSubagentFromWire('session-2', { agentId: 'agent-child', isSubagentRequest: true });
    entry = repo.getWorkflowByAgentId('agent-child');
    expect(entry?.sessionId).toBe('session-2');
    expect(entry?.confirmed).toBe(true);
    expect(entry?.triggeringToolUseId).toBe('tu-xyz');
  });
});

// ── Lifecycle — apertura ──────────────────────────────────────────────────────

describe('WorkflowRepositoryService — lifecycle: apertura', () => {
  it('openWorkflow crea workflow main con status running', () => {
    const repo = new WorkflowRepositoryService();
    const wf = repo.openWorkflow('session-1', { agentId: 'agent-root', isSubagentRequest: false });
    expect(wf.kind).toBe('main');
    expect(wf.status).toBe('running');
    expect(wf.id).toBe('session-1');
    expect(wf.sessionId).toBe('session-1');
  });

  it('openWorkflow es idempotente: segunda llamada devuelve el mismo objeto', () => {
    const repo = new WorkflowRepositoryService();
    const w1 = repo.openWorkflow('session-1', { agentId: 'agent-root', isSubagentRequest: false });
    const w2 = repo.openWorkflow('session-1', { agentId: 'agent-root', isSubagentRequest: false });
    expect(w1).toBe(w2);
  });

  it('openWorkflow + registerStep: getWorkflow devuelve workflow con step', () => {
    const repo = new WorkflowRepositoryService();
    const wf = repo.openWorkflow('session-1', { agentId: 'agent-root', isSubagentRequest: false });
    const step = makeStep('step-1', wf.id);
    repo.registerStep(wf.id, step);
    const found = repo.getWorkflow(wf.id);
    expect(found?.steps).toHaveLength(1);
    expect(found?.steps[0].id).toBe('step-1');
  });

  it('apertura de subagente enlazado: kind subagent, parentWorkflowId, parentToolUseId', () => {
    const repo = new WorkflowRepositoryService();
    const sub = repo.openSubagentWorkflow(
      'session-1',
      { agentId: 'agent-child', isSubagentRequest: true },
      'wf-main',
      'tu-abc',
    );
    expect(sub.kind).toBe('subagent');
    expect(sub.parentWorkflowId).toBe('wf-main');
    expect(sub.parentToolUseId).toBe('tu-abc');
    expect(sub.id).toBe('agent-child');
  });
});

// ── Lifecycle — readyToClose ──────────────────────────────────────────────────

describe('WorkflowRepositoryService — lifecycle: readyToClose', () => {
  it('stopHookActive:true → false', () => {
    const repo = new WorkflowRepositoryService();
    repo.openWorkflow('session-1', { agentId: 'agent-root', isSubagentRequest: false });
    const hook = makeStopHook({ stopHookActive: true });
    expect(repo.readyToClose('session-1', hook)).toBe(false);
  });

  it('backgroundTasks:1 → false', () => {
    const repo = new WorkflowRepositoryService();
    repo.openWorkflow('session-1', { agentId: 'agent-root', isSubagentRequest: false });
    const hook = makeStopHook({ backgroundTasks: 1 });
    expect(repo.readyToClose('session-1', hook)).toBe(false);
  });

  it('sin bloqueos → true', () => {
    const repo = new WorkflowRepositoryService();
    repo.openWorkflow('session-1', { agentId: 'agent-root', isSubagentRequest: false });
    const hook = makeStopHook();
    expect(repo.readyToClose('session-1', hook)).toBe(true);
  });

  it('workflow inexistente → false', () => {
    const repo = new WorkflowRepositoryService();
    expect(repo.readyToClose('wf-desconocido', makeStopHook())).toBe(false);
  });

  it('readyToClose no muta el estado del workflow', () => {
    const repo = new WorkflowRepositoryService();
    const wf = repo.openWorkflow('session-1', { agentId: 'agent-root', isSubagentRequest: false });
    repo.readyToClose('session-1', makeStopHook({ stopHookActive: true }));
    expect(wf.status).toBe('running');
    expect(wf.result).toBeUndefined();
  });
});

// ── Lifecycle — close ─────────────────────────────────────────────────────────

describe('WorkflowRepositoryService — lifecycle: close', () => {
  it('hook Stop → outcome success, status completed', () => {
    const repo = new WorkflowRepositoryService();
    const wf = repo.openWorkflow('session-1', { agentId: 'agent-root', isSubagentRequest: false });
    const step = makeStep('step-1', wf.id, true);
    repo.registerStep(wf.id, step);

    const hook = makeStopHook({ lastAssistantMessage: 'Listo' });
    const result = repo.close(wf.id, hook);

    expect(result.outcome).toBe('success');
    expect(result.closedByEvent).toBe('Stop');
    expect(result.finalText).toBe('Listo');
    expect(wf.status).toBe('completed');
    expect(wf.result).toBe(result);
    expect(wf.completedAt).toBeDefined();
  });

  it('hook StopFailure → outcome api_error, status failed', () => {
    const repo = new WorkflowRepositoryService();
    repo.openWorkflow('session-1', { agentId: 'agent-root', isSubagentRequest: false });

    const hook: ClaudeHookEvent = { eventName: 'StopFailure', sessionId: 'session-1' };
    const result = repo.close('session-1', hook);

    expect(result.outcome).toBe('api_error');
    expect(result.closedByEvent).toBe('StopFailure');
    const wf = repo.getWorkflow('session-1');
    expect(wf?.status).toBe('failed');
  });

  it('setWorkflowModel fija languageModelId con el primer modelo', () => {
    const repo = new WorkflowRepositoryService();
    repo.openWorkflow('session-1', { agentId: 'agent-root', isSubagentRequest: false });
    repo.setWorkflowModel('session-1', 'claude-sonnet-4-6');
    expect(repo.getWorkflow('session-1')?.languageModelId).toBe('claude-sonnet-4-6');
  });

  it('setWorkflowModel no sobrescribe un modelo ya fijado', () => {
    const repo = new WorkflowRepositoryService();
    repo.openWorkflow('session-1', { agentId: 'agent-root', isSubagentRequest: false });
    repo.setWorkflowModel('session-1', 'model-a');
    repo.setWorkflowModel('session-1', 'model-b');
    expect(repo.getWorkflow('session-1')?.languageModelId).toBe('model-a');
  });

  it('setWorkflowModel es no-op si el workflow no existe', () => {
    const repo = new WorkflowRepositoryService();
    expect(() => repo.setWorkflowModel('missing', 'model-x')).not.toThrow();
    expect(repo.getWorkflow('missing')).toBeUndefined();
  });

  it('segundo hook de cierre ignorado — idempotencia §28', () => {
    const repo = new WorkflowRepositoryService();
    repo.openWorkflow('session-1', { agentId: 'agent-root', isSubagentRequest: false });

    const hook1 = makeStopHook({ lastAssistantMessage: 'primera' });
    const result1 = repo.close('session-1', hook1);

    const hook2 = makeStopHook({ lastAssistantMessage: 'segunda' });
    const result2 = repo.close('session-1', hook2);

    expect(result2).toBe(result1);
    expect(result2.finalText).toBe('primera');
  });
});
