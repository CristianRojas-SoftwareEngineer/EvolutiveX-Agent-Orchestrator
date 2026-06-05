import { describe, it, expect } from 'vitest';
import { WorkflowRepositoryService } from '../../src/2-services/workflow-repository.service.js';
import type { ClaudeHookEvent } from '../../src/1-domain/types/hook.types.js';
import type { IStep } from '../../src/1-domain/interfaces/gateway/IStep.js';
import type { IToolUse } from '../../src/1-domain/interfaces/gateway/IToolUse.js';
import type { IEventBus } from '../../src/1-domain/repositories/IEventBus.js';
import type { TelemetryEvent, SubscriptionRef } from '../../src/1-domain/types/telemetry.types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStopHook(overrides: Partial<ClaudeHookEvent> = {}): ClaudeHookEvent {
  return { eventName: 'Stop', sessionId: 'session-1', stopHookActive: false, backgroundTasks: 0, ...overrides };
}

function makeStep(id: string, workflowId: string, closed = false, index = 0): IStep {
  return {
    id,
    workflowId,
    index,
    inferenceRequest: { model: 'm', messages: [], max_tokens: 1 },
    assistantMessage: { role: 'assistant', content: [] },
    toolUses: [],
    startedAt: new Date(),
    ...(closed ? { closedAt: new Date() } : {}),
  };
}

function makeToolUse(id: string, stepId: string, name = 'Read'): IToolUse {
  return {
    id,
    stepId,
    name,
    arguments: { a: 1 },
    status: 'running',
    toolUseBlock: { type: 'tool_use', id, name, input: { a: 1 } } as never,
  };
}

/** EventBus espía que captura los eventos publicados. */
class SpyBus implements IEventBus {
  public readonly events: TelemetryEvent[] = [];
  publish(event: TelemetryEvent): void {
    this.events.push(event);
  }
  subscribe(): SubscriptionRef {
    return { id: 'noop', pattern: '*' };
  }
  unsubscribe(): void {
    /* no-op */
  }
  ofType(type: string): TelemetryEvent[] {
    return this.events.filter((e) => e.type === type);
  }
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

// ── Emisión de eventos al bus ──────────────────────────────────────────────────

describe('WorkflowRepositoryService — emisión al EventBus', () => {
  it('openWorkflow emite workflow_start con kind main', () => {
    const bus = new SpyBus();
    const repo = new WorkflowRepositoryService(bus);
    repo.openWorkflow('session-1', { agentId: 'agent-root', isSubagentRequest: false });
    const ev = bus.ofType('workflow_start');
    expect(ev).toHaveLength(1);
    expect(ev[0].sessionId).toBe('session-1');
    expect((ev[0].payload as Record<string, unknown>).kind).toBe('main');
  });

  it('openSubagentWorkflow emite workflow_spawn', () => {
    const bus = new SpyBus();
    const repo = new WorkflowRepositoryService(bus);
    repo.openSubagentWorkflow('s1', { agentId: 'child', isSubagentRequest: true }, 'wf-main', 'tu-1');
    const ev = bus.ofType('workflow_spawn');
    expect(ev).toHaveLength(1);
    expect((ev[0].payload as Record<string, unknown>).parentToolUseId).toBe('tu-1');
  });

  it('registerStep emite step_request con stepIndex y request', () => {
    const bus = new SpyBus();
    const repo = new WorkflowRepositoryService(bus);
    const wf = repo.openWorkflow('s1', { agentId: 'a', isSubagentRequest: false });
    repo.registerStep(wf.id, makeStep('step-1', wf.id, false, 0));
    const ev = bus.ofType('step_request');
    expect(ev).toHaveLength(1);
    expect((ev[0].payload as Record<string, unknown>).stepIndex).toBe(0);
    expect((ev[0].payload as Record<string, unknown>).request).toBeDefined();
  });

  it('registerToolUse emite tool_call', () => {
    const bus = new SpyBus();
    const repo = new WorkflowRepositoryService(bus);
    const wf = repo.openWorkflow('s1', { agentId: 'a', isSubagentRequest: false });
    repo.registerStep(wf.id, makeStep('step-1', wf.id));
    repo.registerToolUse(wf.id, makeToolUse('tu-1', 'step-1', 'Read'));
    const ev = bus.ofType('tool_call');
    expect(ev).toHaveLength(1);
    expect((ev[0].payload as Record<string, unknown>).toolName).toBe('Read');
  });

  it('close con outcome success emite workflow_complete', () => {
    const bus = new SpyBus();
    const repo = new WorkflowRepositoryService(bus);
    repo.openWorkflow('s1', { agentId: 'a', isSubagentRequest: false });
    repo.close('s1', makeStopHook({ sessionId: 's1' }));
    expect(bus.ofType('workflow_complete')).toHaveLength(1);
    expect(bus.ofType('workflow_cancel')).toHaveLength(0);
  });
});

// ── completeToolUse ─────────────────────────────────────────────────────────────

describe('WorkflowRepositoryService — completeToolUse', () => {
  it('completa tool y emite tool_result (success)', () => {
    const bus = new SpyBus();
    const repo = new WorkflowRepositoryService(bus);
    const wf = repo.openWorkflow('s1', { agentId: 'a', isSubagentRequest: false });
    repo.registerStep(wf.id, makeStep('step-1', wf.id));
    repo.registerToolUse(wf.id, makeToolUse('tu-1', 'step-1'));

    repo.completeToolUse(wf.id, 'tu-1', { isError: false, result: 'ok' });

    const step = repo.getWorkflow(wf.id)!.steps[0];
    expect(step.toolUses[0].status).toBe('completed');
    expect(step.toolUses[0].result).toEqual({ isError: false, result: 'ok' });
    expect(bus.ofType('tool_result')).toHaveLength(1);
  });

  it('isError true deja el tool en status error', () => {
    const bus = new SpyBus();
    const repo = new WorkflowRepositoryService(bus);
    const wf = repo.openWorkflow('s1', { agentId: 'a', isSubagentRequest: false });
    repo.registerStep(wf.id, makeStep('step-1', wf.id));
    repo.registerToolUse(wf.id, makeToolUse('tu-1', 'step-1'));
    repo.completeToolUse(wf.id, 'tu-1', { isError: true, result: 'boom' });
    expect(repo.getWorkflow(wf.id)!.steps[0].toolUses[0].status).toBe('error');
  });

  it('tool inexistente es no-op (sin emisión)', () => {
    const bus = new SpyBus();
    const repo = new WorkflowRepositoryService(bus);
    const wf = repo.openWorkflow('s1', { agentId: 'a', isSubagentRequest: false });
    repo.completeToolUse(wf.id, 'tu-999', { isError: false, result: 'ok' });
    expect(bus.ofType('tool_result')).toHaveLength(0);
  });
});

// ── Lookups ──────────────────────────────────────────────────────────────────────

describe('WorkflowRepositoryService — lookups', () => {
  it('getWorkflowBySessionId devuelve el workflow principal', () => {
    const repo = new WorkflowRepositoryService();
    repo.openWorkflow('s1', { agentId: 'a', isSubagentRequest: false });
    expect(repo.getWorkflowBySessionId('s1')?.kind).toBe('main');
  });

  it('registerPendingToolUse + findWorkflowWithPendingToolUse + consumePendingToolUse', () => {
    const repo = new WorkflowRepositoryService();
    const wf = repo.openWorkflow('s1', { agentId: 'a', isSubagentRequest: false });
    repo.registerStep(wf.id, makeStep('step-1', wf.id));
    const tu = makeToolUse('tu-1', 'step-1', 'Agent');
    repo.registerPendingToolUse(wf.id, 'step-1', tu);

    const found = repo.findWorkflowWithPendingToolUse('s1', 'tu-1');
    expect(found?.toolUse.id).toBe('tu-1');

    const consumed = repo.consumePendingToolUse(wf.id, 'tu-1');
    expect(consumed?.id).toBe('tu-1');
    expect(repo.findWorkflowWithPendingToolUse('s1', 'tu-1')).toBeUndefined();
  });

  it('nextSequence asigna secuencias crecientes por sesión', async () => {
    const repo = new WorkflowRepositoryService();
    expect(await repo.nextSequence('s1')).toBe(0);
    expect(await repo.nextSequence('s1')).toBe(1);
    expect(await repo.nextSequence('s2')).toBe(0);
  });

  it('withSessionLock serializa operaciones concurrentes', async () => {
    const repo = new WorkflowRepositoryService();
    const order: string[] = [];
    const a = repo.withSessionLock('s1', async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push('a');
    });
    const b = repo.withSessionLock('s1', async () => {
      order.push('b');
    });
    await Promise.all([a, b]);
    expect(order).toEqual(['a', 'b']);
  });
});

// ── forceClose ────────────────────────────────────────────────────────────────────

describe('WorkflowRepositoryService — forceClose', () => {
  it('forceClose por orphan produce outcome orphaned y NO incluye closedByEvent', () => {
    const repo = new WorkflowRepositoryService();
    const wf = repo.openWorkflow('s1', { agentId: 'a', isSubagentRequest: false }, { forceNew: true });
    repo.forceClose(wf.id, 'orphaned', { continuationOrphan: true });
    const result = repo.getWorkflow(wf.id)!.result!;
    expect(result.outcome).toBe('orphaned');
    expect(result.closedByEvent).toBeUndefined();
    expect((result as unknown as Record<string, unknown>).continuationOrphan).toBe(true);
    expect(repo.getWorkflow(wf.id)!.status).toBe('failed');
  });

  it('forceClose por upstream-error no incluye closedByEvent', () => {
    const repo = new WorkflowRepositoryService();
    const wf = repo.openWorkflow('s2', { agentId: 'a', isSubagentRequest: false });
    repo.forceClose(wf.id, 'upstream-error');
    const result = repo.getWorkflow(wf.id)!.result!;
    expect(result.outcome).toBe('upstream-error');
    expect(result.closedByEvent).toBeUndefined();
  });

  it('forceClose es idempotente — segunda llamada no muta el resultado', () => {
    const repo = new WorkflowRepositoryService();
    const wf = repo.openWorkflow('s3', { agentId: 'a', isSubagentRequest: false });
    repo.forceClose(wf.id, 'orphaned');
    const first = repo.getWorkflow(wf.id)!.result;
    repo.forceClose(wf.id, 'upstream-error');
    expect(repo.getWorkflow(wf.id)!.result).toBe(first);
  });
});

// ── clearToolUseIndexFor ─────────────────────────────────────────────────────────

describe('WorkflowRepositoryService — clearToolUseIndexFor', () => {
  it('elimina entradas del workflow indicado y conserva las de otros', () => {
    const repo = new WorkflowRepositoryService();
    const wfA = repo.openWorkflow('sA', { agentId: 'a', isSubagentRequest: false });
    const wfB = repo.openWorkflow('sB', { agentId: 'b', isSubagentRequest: false });
    repo.registerStep(wfA.id, makeStep('step-a', wfA.id));
    repo.registerStep(wfB.id, makeStep('step-b', wfB.id));
    repo.registerPendingToolUse(wfA.id, 'step-a', makeToolUse('tu-1', 'step-a', 'Agent'));
    repo.registerPendingToolUse(wfA.id, 'step-a', makeToolUse('tu-3', 'step-a', 'Agent'));
    repo.registerPendingToolUse(wfB.id, 'step-b', makeToolUse('tu-2', 'step-b', 'Agent'));

    // Consumir los pendings de wfA para que solo quede el índice toolUseIdToWorkflowId
    repo.consumePendingToolUse(wfA.id, 'tu-1');
    repo.consumePendingToolUse(wfA.id, 'tu-3');

    // Antes de limpiar, tu-1 y tu-3 se resuelven vía toolUseIdToWorkflowId
    expect(repo.findWorkflowByToolUseId('sA', 'tu-1')).toBeDefined();
    expect(repo.findWorkflowByToolUseId('sA', 'tu-3')).toBeDefined();

    repo.clearToolUseIndexFor(wfA.id);

    // Tras limpiar el índice, ya no se resuelven
    expect(repo.findWorkflowByToolUseId('sA', 'tu-1')).toBeUndefined();
    expect(repo.findWorkflowByToolUseId('sA', 'tu-3')).toBeUndefined();
    // El índice de wfB no se toca
    expect(repo.findWorkflowByToolUseId('sB', 'tu-2')).toBeDefined();
  });

  it('es no-op cuando el workflow no tiene entradas en el índice', () => {
    const repo = new WorkflowRepositoryService();
    expect(() => repo.clearToolUseIndexFor('wf-sin-entradas')).not.toThrow();
  });
});
