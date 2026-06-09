import { describe, it, expect } from 'vitest';
import { WorkflowRepositoryService } from '../../src/2-services/workflow-repository.service.js';
import type { IStep } from '../../src/1-domain/interfaces/gateway/IStep.js';
import {
  enrichOpenWireStepWithResponse,
  registerWireStepInCorrelator,
  resolveOpenWireStepIndex,
  buildWireStep,
} from '../../src/3-operations/gateway-wire-step.util.js';

function makeRequestStep(workflowId: string, index: number): IStep {
  return {
    id: `step-req-${index}`,
    workflowId,
    index,
    inferenceRequest: {
      model: 'claude-test',
      messages: [{ role: 'user', content: 'hola' }],
      max_tokens: 1024,
    },
    assistantMessage: { role: 'assistant', content: [] },
    toolUses: [],
    startedAt: new Date(),
  };
}

describe('gateway-wire-step.util', () => {
  it('enrichOpenWireStepWithResponse: un hop → un IStep con request y response', () => {
    const repo = new WorkflowRepositoryService();
    const wf = repo.openWorkflow('session-1', { agentId: undefined, isSubagentRequest: false }, {
      forceNew: true,
      layoutIndex: 0,
      workflowKind: 'agentic',
    });

    const requestStep = makeRequestStep(wf.id, 0);
    repo.registerStep(wf.id, requestStep);

    const now = new Date();
    const enriched = enrichOpenWireStepWithResponse(
      repo,
      wf.id,
      {
        assistantMessage: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
        usage: { input_tokens: 10, output_tokens: 5 },
        stopReason: 'end_turn',
        closedAt: now,
      },
      'end_turn',
    );

    expect(enriched).toBeDefined();
    const updated = repo.getWorkflow(wf.id)!;
    expect(updated.steps).toHaveLength(1);
    expect(updated.steps[0].inferenceRequest.messages).toHaveLength(1);
    expect(updated.steps[0].assistantMessage.content).toHaveLength(1);
    expect(updated.steps[0].closedAt).toBeDefined();
    expect(updated.result?.stepCount).toBe(1);
  });

  it('registerWireStepInCorrelator: 3 hops → 3 steps (no 6)', () => {
    const repo = new WorkflowRepositoryService();
    const wf = repo.openWorkflow('session-wire', { agentId: undefined, isSubagentRequest: false }, {
      forceNew: true,
      layoutIndex: 1,
      workflowKind: 'agentic',
    });

    for (let hop = 0; hop < 3; hop++) {
      repo.registerStep(wf.id, makeRequestStep(wf.id, hop));
      const isLast = hop === 2;
      const stopReason = isLast ? 'end_turn' : 'tool_use';
      const responseStep = buildWireStep({
        workflow: wf,
        inferenceRequest: { model: 'm', messages: [], max_tokens: 1 },
        assistantMessage: {
          role: 'assistant',
          content: isLast
            ? [{ type: 'text', text: 'done' }]
            : [{ type: 'tool_use', id: `tu-${hop}`, name: 'Bash', input: {} }],
        },
        usage: { input_tokens: 1, output_tokens: 1 },
        stopReason,
        startedAt: new Date(),
        closedAt: new Date(),
      });
      registerWireStepInCorrelator(repo, responseStep, stopReason);
    }

    const updated = repo.getWorkflow(wf.id)!;
    expect(updated.steps).toHaveLength(3);
    for (const step of updated.steps) {
      expect(step.inferenceRequest.messages.length).toBeGreaterThan(0);
      expect(step.assistantMessage.content.length).toBeGreaterThan(0);
      expect(step.closedAt).toBeDefined();
    }
    expect(updated.result?.stepCount).toBe(3);
  });

  it('tool_use: cierra el step al completar el hop', () => {
    const repo = new WorkflowRepositoryService();
    const wf = repo.openWorkflow('session-tu', { agentId: undefined, isSubagentRequest: false }, {
      forceNew: true,
      layoutIndex: 0,
      workflowKind: 'agentic',
    });
    repo.registerStep(wf.id, makeRequestStep(wf.id, 0));

    const enriched = enrichOpenWireStepWithResponse(
      repo,
      wf.id,
      {
        assistantMessage: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tu-1', name: 'Bash', input: {} }],
        },
        usage: { input_tokens: 1, output_tokens: 1 },
        stopReason: 'tool_use',
        closedAt: new Date(),
      },
      'tool_use',
    );

    expect(enriched?.closedAt).toBeDefined();
    expect(repo.getWorkflow(wf.id)!.steps).toHaveLength(1);
  });

  it('registerWireStepInCorrelator: 3× tool_use + end_turn → stepCount 4', () => {
    const repo = new WorkflowRepositoryService();
    const wf = repo.openWorkflow('session-4hop', { agentId: undefined, isSubagentRequest: false }, {
      forceNew: true,
      layoutIndex: 2,
      workflowKind: 'agentic',
    });

    for (let hop = 0; hop < 4; hop++) {
      repo.registerStep(wf.id, makeRequestStep(wf.id, hop));
      const isLast = hop === 3;
      const stopReason = isLast ? 'end_turn' : 'tool_use';
      const responseStep = buildWireStep({
        workflow: wf,
        inferenceRequest: { model: 'm', messages: [], max_tokens: 1 },
        assistantMessage: {
          role: 'assistant',
          content: isLast
            ? [{ type: 'text', text: 'done' }]
            : [{ type: 'tool_use', id: `tu-${hop}`, name: 'Bash', input: {} }],
        },
        usage: { input_tokens: 1, output_tokens: 1 },
        stopReason,
        startedAt: new Date(),
        closedAt: new Date(),
      });
      registerWireStepInCorrelator(repo, responseStep, stopReason);
    }

    const updated = repo.getWorkflow(wf.id)!;
    expect(updated.steps).toHaveLength(4);
    expect(updated.result?.stepCount).toBe(4);
  });

  it('registerWireStepInCorrelator fallback: tool_use sin step previo cierra el step', () => {
    const repo = new WorkflowRepositoryService();
    const wf = repo.openWorkflow('session-fb', { agentId: undefined, isSubagentRequest: false }, {
      forceNew: true,
      layoutIndex: 3,
      workflowKind: 'agentic',
    });

    const responseStep = buildWireStep({
      workflow: wf,
      inferenceRequest: { model: 'm', messages: [], max_tokens: 1 },
      assistantMessage: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tu-fb', name: 'Bash', input: {} }],
      },
      usage: { input_tokens: 1, output_tokens: 1 },
      stopReason: 'tool_use',
      startedAt: new Date(),
      closedAt: new Date(),
    });

    const registered = registerWireStepInCorrelator(repo, responseStep, 'tool_use');
    expect(registered?.closedAt).toBeDefined();
    expect(repo.getWorkflow(wf.id)!.steps).toHaveLength(1);
    expect(repo.getWorkflow(wf.id)!.steps[0].closedAt).toBeDefined();
  });

  it('resolveOpenWireStepIndex: apunta al step abierto, no a steps.length', () => {
    const repo = new WorkflowRepositoryService();
    const wf = repo.openWorkflow('session-idx', { agentId: undefined, isSubagentRequest: false }, {
      forceNew: true,
      layoutIndex: 0,
      workflowKind: 'agentic',
    });
    repo.registerStep(wf.id, makeRequestStep(wf.id, 0));

    expect(resolveOpenWireStepIndex(repo.getWorkflow(wf.id)!)).toBe(0);
    expect(wf.steps.length).toBe(1);
  });
});
