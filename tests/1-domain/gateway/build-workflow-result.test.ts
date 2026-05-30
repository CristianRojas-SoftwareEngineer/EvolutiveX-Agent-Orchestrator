import { describe, it, expect } from 'vitest';
import { buildWorkflowResult } from '../../../src/1-domain/services/gateway/build-workflow-result.js';
import type { IWorkflow } from '../../../src/1-domain/interfaces/gateway/IWorkflow.js';
import type { IStep } from '../../../src/1-domain/interfaces/gateway/IStep.js';
import type { IWorkflowResult } from '../../../src/1-domain/interfaces/gateway/IWorkflowResult.js';
import type { ClaudeHookEvent } from '../../../src/1-domain/types/hook.types.js';

function makeWorkflow(overrides: Partial<IWorkflow> = {}): IWorkflow {
  return {
    id: 'wf1',
    sessionId: 'sess1',
    kind: 'main',
    status: 'running',
    steps: [],
    startedAt: new Date(),
    ...overrides,
  };
}

function makeClosedStep(usage?: IStep['usage']): IStep {
  return {
    id: 's1',
    workflowId: 'wf1',
    index: 0,
    inferenceRequest: { model: 'm', messages: [], max_tokens: 1 },
    assistantMessage: { role: 'assistant', content: [] },
    toolUses: [],
    usage,
    startedAt: new Date(),
    closedAt: new Date(),
  };
}

function makeHook(overrides: Partial<ClaudeHookEvent> = {}): ClaudeHookEvent {
  return { eventName: 'Stop', sessionId: 'sess1', ...overrides };
}

describe('buildWorkflowResult', () => {
  it('construye resultado básico con hook Stop', () => {
    const wf = makeWorkflow();
    const steps = [makeClosedStep({ input_tokens: 100, output_tokens: 50 })];
    const hook = makeHook({ lastAssistantMessage: 'Respuesta final' });

    const result = buildWorkflowResult(wf, steps, [], hook);

    expect(result.outcome).toBe('success');
    expect(result.finalText).toBe('Respuesta final');
    expect(result.stepCount).toBe(1);
    expect(result.closedByEvent).toBe('Stop');
    expect(result.sessionId).toBe('sess1');
    expect(result.usage?.input_tokens).toBe(100);
    expect(result.usage?.output_tokens).toBe(50);
  });

  it('devuelve outcome api_error para StopFailure', () => {
    const wf = makeWorkflow();
    const hook = makeHook({ eventName: 'StopFailure' });
    const result = buildWorkflowResult(wf, [], [], hook);
    expect(result.outcome).toBe('api_error');
    expect(result.closedByEvent).toBe('StopFailure');
  });

  it('incluye tokens de child results', () => {
    const wf = makeWorkflow();
    const steps = [makeClosedStep({ input_tokens: 100, output_tokens: 50 })];
    const child: IWorkflowResult = {
      outcome: 'success',
      usage: { input_tokens: 500, output_tokens: 200 },
      stepCount: 2,
      closedByEvent: 'SubagentStop',
      sessionId: 'sess1',
    };
    const hook = makeHook();
    const result = buildWorkflowResult(wf, steps, [child], hook);
    expect(result.usage?.input_tokens).toBe(600);
    expect(result.usage?.output_tokens).toBe(250);
  });

  it('usage es undefined cuando no hay steps con uso', () => {
    const wf = makeWorkflow();
    const hook = makeHook();
    const result = buildWorkflowResult(wf, [], [], hook);
    expect(result.usage).toBeUndefined();
  });

  it('finalText es undefined cuando hook no incluye lastAssistantMessage', () => {
    const wf = makeWorkflow();
    const hook = makeHook();
    const result = buildWorkflowResult(wf, [], [], hook);
    expect(result.finalText).toBeUndefined();
  });

  it('usa fallback conservador para eventName desconocido', () => {
    const wf = makeWorkflow();
    const hook = makeHook({ eventName: 'EventoDesconocido' });
    const result = buildWorkflowResult(wf, [], [], hook);
    expect(result.closedByEvent).toBe('StopFailure');
    expect(result.outcome).toBe('unknown');
  });
});
