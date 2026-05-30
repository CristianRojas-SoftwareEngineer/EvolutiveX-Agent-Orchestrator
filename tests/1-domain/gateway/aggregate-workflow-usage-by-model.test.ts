import { describe, it, expect } from 'vitest';
import { aggregateWorkflowUsageByModel } from '../../../src/1-domain/services/gateway/aggregate-workflow-usage-by-model.js';
import type { IStep } from '../../../src/1-domain/interfaces/gateway/IStep.js';

function makeStep(model: string, usage?: IStep['usage']): IStep {
  return {
    id: `s-${model}-${Math.random()}`,
    workflowId: 'w1',
    index: 0,
    inferenceRequest: { model, messages: [], max_tokens: 1 },
    assistantMessage: { role: 'assistant', content: [] },
    toolUses: [],
    usage,
    startedAt: new Date(),
    closedAt: new Date(),
  };
}

describe('aggregateWorkflowUsageByModel', () => {
  it('agrupa dos modelos distintos', () => {
    const steps = [
      makeStep('model-a', { input_tokens: 100, output_tokens: 10 }),
      makeStep('model-b', { input_tokens: 200, output_tokens: 20 }),
    ];
    const result = aggregateWorkflowUsageByModel(steps);
    expect(Object.keys(result)).toEqual(['model-a', 'model-b']);
    expect(result['model-a'].stepCount).toBe(1);
    expect(result['model-a'].usage.input_tokens).toBe(100);
    expect(result['model-b'].usage.input_tokens).toBe(200);
  });

  it('acumula varios steps del mismo modelo', () => {
    const steps = [
      makeStep('model-a', { input_tokens: 100, output_tokens: 10 }),
      makeStep('model-a', { input_tokens: 50, output_tokens: 5 }),
      makeStep('model-a', { input_tokens: 25, output_tokens: 2 }),
    ];
    const result = aggregateWorkflowUsageByModel(steps);
    expect(result['model-a'].stepCount).toBe(3);
    expect(result['model-a'].usage.input_tokens).toBe(175);
    expect(result['model-a'].usage.output_tokens).toBe(17);
  });

  it('devuelve {} cuando ningún step tiene usage', () => {
    expect(aggregateWorkflowUsageByModel([makeStep('m')])).toEqual({});
  });

  it('es pura — sin I/O', () => {
    const steps = [makeStep('m', { input_tokens: 1, output_tokens: 1 })];
    const a = aggregateWorkflowUsageByModel(steps);
    const b = aggregateWorkflowUsageByModel(steps);
    expect(a).toEqual(b);
  });
});
