import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionMetricsService, computeCacheEfficiency } from '../../src/2-services/session-metrics.service.js';
import type { IStep } from '../../src/1-domain/interfaces/gateway/IStep.js';

function makeStep(model: string, usage: IStep['usage']): IStep {
  return {
    id: 's1',
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

describe('computeCacheEfficiency', () => {
  it('devuelve 0 si el denominador es 0', () => {
    expect(computeCacheEfficiency(0, 0)).toBe(0);
  });

  it('calcula la razón cache_read / (input + cache_read)', () => {
    expect(computeCacheEfficiency(500, 1000)).toBeCloseTo(1000 / 1500);
  });
});

describe('SessionMetricsService', () => {
  let tmpDir: string;
  let service: SessionMetricsService;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-metrics-'));
    service = new SessionMetricsService();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('escribe session-metrics.json con schema §33.2', async () => {
    const steps = [
      makeStep('claude-sonnet', {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 200,
      }),
    ];
    await service.updateFromWorkflow(tmpDir, steps);

    const raw = await fs.readFile(path.join(tmpDir, 'session-metrics.json'), 'utf8');
    const data = JSON.parse(raw);
    expect(data.models['claude-sonnet'].input_tokens).toBe(100);
    expect(data.models['claude-sonnet'].cache_efficiency).toBeDefined();
    expect(data.models['claude-sonnet'].workflow_count).toBe(1);
    expect(data.session_totals.total_steps).toBe(1);
    expect(data.session_totals.total_workflows).toBe(1);
  });

  it('merge incremental en segunda escritura', async () => {
    await service.updateFromWorkflow(tmpDir, [
      makeStep('m1', { input_tokens: 10, output_tokens: 5 }),
    ]);
    await service.updateFromWorkflow(tmpDir, [
      makeStep('m1', { input_tokens: 20, output_tokens: 10 }),
    ]);

    const raw = await fs.readFile(path.join(tmpDir, 'session-metrics.json'), 'utf8');
    const data = JSON.parse(raw);
    expect(data.models.m1.input_tokens).toBe(30);
    expect(data.models.m1.count).toBe(2);
    expect(data.models.m1.workflow_count).toBe(2);
    expect(data.session_totals.total_workflows).toBe(2);
  });
});
