import { describe, it, expect, vi } from 'vitest';
import * as path from 'node:path';
import { persistBillableStepMetricsIfNeeded } from '../../src/3-operations/persist-billable-step-metrics.util.js';
import type { SessionMetricsService } from '../../src/2-services/session-metrics.service.js';
import type { IWorkflow } from '../../src/1-domain/interfaces/gateway/IWorkflow.js';
import type { IStep } from '../../src/1-domain/interfaces/gateway/IStep.js';

function makeStep(): IStep {
  return {
    id: 'step-1',
    workflowId: 'wf-1',
    index: 0,
    inferenceRequest: { model: 'm1', messages: [], max_tokens: 1 },
    assistantMessage: { role: 'assistant', content: [] },
    toolUses: [],
    usage: { input_tokens: 1, output_tokens: 1 },
    startedAt: new Date(),
    closedAt: new Date(),
  };
}

function makeWorkflow(kind: IWorkflow['kind']): IWorkflow {
  return {
    id: 'wf-1',
    sessionId: 'session-1',
    kind,
    closeAuthority: 'stop-hook',
    status: 'running',
    steps: [],
    startedAt: new Date(),
  };
}

function makeSessionMetrics(): SessionMetricsService {
  return {
    updateFromStep: vi.fn().mockResolvedValue(undefined),
    finalizeWorkflowMetrics: vi.fn().mockResolvedValue(undefined),
  } as unknown as SessionMetricsService;
}

describe('persistBillableStepMetricsIfNeeded', () => {
  it('subagent + usage → updateFromStep llamado (G16′)', async () => {
    const sessionMetrics = makeSessionMetrics();
    const step = makeStep();
    await persistBillableStepMetricsIfNeeded(
      sessionMetrics,
      '/tmp/sessions',
      makeWorkflow('subagent'),
      step,
    );
    expect(sessionMetrics.updateFromStep).toHaveBeenCalledWith(
      path.join('/tmp/sessions', 'session-1'),
      step,
    );
  });

  it('main + tool_use + usage → updateFromStep llamado', async () => {
    const sessionMetrics = makeSessionMetrics();
    const step = makeStep();
    await persistBillableStepMetricsIfNeeded(
      sessionMetrics,
      '/tmp/sessions',
      makeWorkflow('main'),
      step,
    );
    expect(sessionMetrics.updateFromStep).toHaveBeenCalledWith(
      path.join('/tmp/sessions', 'session-1'),
      step,
    );
  });

  it('main + usage → updateFromStep llamado', async () => {
    const sessionMetrics = makeSessionMetrics();
    const step = makeStep();
    await persistBillableStepMetricsIfNeeded(
      sessionMetrics,
      '/tmp/sessions',
      makeWorkflow('main'),
      step,
    );
    expect(sessionMetrics.updateFromStep).toHaveBeenCalledWith(
      path.join('/tmp/sessions', 'session-1'),
      step,
    );
  });
});
