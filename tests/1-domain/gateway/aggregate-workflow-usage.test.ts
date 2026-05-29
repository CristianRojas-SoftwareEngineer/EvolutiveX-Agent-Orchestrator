import { describe, it, expect } from 'vitest';
import { aggregateWorkflowUsage } from '../../../src/1-domain/services/gateway/aggregate-workflow-usage.js';
import type { IStep } from '../../../src/1-domain/interfaces/gateway/IStep.js';
import type { IWorkflowResult } from '../../../src/1-domain/interfaces/gateway/IWorkflowResult.js';

function makeStep(usage?: IStep['usage']): IStep {
  return {
    id: 's1',
    workflowId: 'w1',
    index: 0,
    inferenceRequest: { model: 'm', messages: [], max_tokens: 1 },
    assistantMessage: { role: 'assistant', content: [] },
    toolUses: [],
    usage,
    startedAt: new Date(),
    closedAt: new Date(),
  };
}

function makeResult(usage?: IWorkflowResult['usage']): IWorkflowResult {
  return {
    outcome: 'success',
    usage,
    stepCount: 1,
    closedByEvent: 'Stop',
    sessionId: 'sess',
  };
}

describe('aggregateWorkflowUsage', () => {
  it('devuelve undefined cuando arrays vacíos', () => {
    expect(aggregateWorkflowUsage([], [])).toBeUndefined();
  });

  it('devuelve undefined cuando ningún step tiene usage', () => {
    const steps = [makeStep(undefined), makeStep(undefined)];
    expect(aggregateWorkflowUsage(steps, [])).toBeUndefined();
  });

  it('suma tokens de un solo step', () => {
    const step = makeStep({ input_tokens: 100, output_tokens: 50 });
    const result = aggregateWorkflowUsage([step], []);
    expect(result).toEqual({ input_tokens: 100, output_tokens: 50 });
  });

  it('suma tokens de múltiples steps', () => {
    const steps = [
      makeStep({ input_tokens: 100, output_tokens: 50 }),
      makeStep({ input_tokens: 200, output_tokens: 100 }),
    ];
    const result = aggregateWorkflowUsage(steps, []);
    expect(result?.input_tokens).toBe(300);
    expect(result?.output_tokens).toBe(150);
  });

  it('incluye tokens de child results en el total', () => {
    const step = makeStep({ input_tokens: 100, output_tokens: 50 });
    const child = makeResult({ input_tokens: 500, output_tokens: 200 });
    const result = aggregateWorkflowUsage([step], [child]);
    expect(result?.input_tokens).toBe(600);
    expect(result?.output_tokens).toBe(250);
  });

  it('suma cache_creation_input_tokens y cache_read_input_tokens', () => {
    const step = makeStep({
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 30,
      cache_read_input_tokens: 20,
    });
    const result = aggregateWorkflowUsage([step], []);
    expect(result?.cache_creation_input_tokens).toBe(30);
    expect(result?.cache_read_input_tokens).toBe(20);
  });

  it('agrega subcampos de cache_creation cuando están presentes', () => {
    const step = makeStep({
      input_tokens: 100,
      output_tokens: 50,
      cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 5 },
    });
    const result = aggregateWorkflowUsage([step], []);
    expect(result?.cache_creation?.ephemeral_5m_input_tokens).toBe(10);
    expect(result?.cache_creation?.ephemeral_1h_input_tokens).toBe(5);
  });

  it('omite service_tier e inference_geo del resultado', () => {
    const step = makeStep({ input_tokens: 1, output_tokens: 1, service_tier: 'standard', inference_geo: 'us' });
    const result = aggregateWorkflowUsage([step], []);
    expect(result).not.toHaveProperty('service_tier');
    expect(result).not.toHaveProperty('inference_geo');
  });
});
