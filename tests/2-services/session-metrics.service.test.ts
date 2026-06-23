import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  SessionMetricsService,
  computeCacheEfficiency,
} from '../../src/2-services/session-metrics.service.js';
import type { IStep } from '../../src/1-domain/interfaces/gateway/IStep.js';

function makeStep(
  id: string,
  model: string,
  usage: IStep['usage'],
  workflowId = 'w1',
  stepKind: IStep['stepKind'] = 'agentic',
  index = 1,
): IStep {
  return {
    id,
    workflowId,
    index,
    stepKind,
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

  it('escribe session-metrics.json con schema canónico vía updateFromStep', async () => {
    const step = makeStep('s1', 'claude-sonnet', {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 200,
    });
    await service.updateFromStep(tmpDir, step);

    const raw = await fs.readFile(path.join(tmpDir, 'session-metrics.json'), 'utf8');
    const data = JSON.parse(raw);
    expect(data.models['claude-sonnet'].input_tokens).toBe(100);
    expect(data.models['claude-sonnet'].cache_efficiency).toBeDefined();
    expect(data.models['claude-sonnet'].finalized_runs).toBe(0);
    expect(data.session_totals.billable_hops).toBe(1);
    expect(data.session_totals.finalized_runs).toBe(0);
  });

  it('updateFromStep es idempotente por step.id', async () => {
    const step = makeStep('s1', 'm1', { input_tokens: 10, output_tokens: 5 });
    await service.updateFromStep(tmpDir, step);
    await service.updateFromStep(tmpDir, step);

    const raw = await fs.readFile(path.join(tmpDir, 'session-metrics.json'), 'utf8');
    const data = JSON.parse(raw);
    expect(data.models.m1.billable_hops).toBe(1);
    expect(data.models.m1.input_tokens).toBe(10);
  });

  it('finalizeWorkflowMetrics incrementa finalized_runs sin duplicar hops ya aplicados', async () => {
    const step = makeStep('s1', 'm1', { input_tokens: 10, output_tokens: 5 });
    await service.updateFromStep(tmpDir, step);
    await service.finalizeWorkflowMetrics(tmpDir, 'w1', [step]);

    const raw = await fs.readFile(path.join(tmpDir, 'session-metrics.json'), 'utf8');
    const data = JSON.parse(raw);
    expect(data.models.m1.billable_hops).toBe(1);
    expect(data.models.m1.input_tokens).toBe(10);
    expect(data.models.m1.finalized_runs).toBe(1);
    expect(data.session_totals.finalized_runs).toBe(1);
  });

  it('finalizeWorkflowMetrics es idempotente por workflowId', async () => {
    const step = makeStep('s1', 'm1', { input_tokens: 10, output_tokens: 5 });
    await service.updateFromStep(tmpDir, step);
    await service.finalizeWorkflowMetrics(tmpDir, 'w1', [step]);
    await service.finalizeWorkflowMetrics(tmpDir, 'w1', [step]);

    const raw = await fs.readFile(path.join(tmpDir, 'session-metrics.json'), 'utf8');
    const data = JSON.parse(raw);
    expect(data.models.m1.finalized_runs).toBe(1);
  });

  it('merge incremental: updateFromStep×2 + finalizeWorkflowMetrics×2 workflows distintos', async () => {
    await service.updateFromStep(
      tmpDir,
      makeStep('s1', 'm1', { input_tokens: 10, output_tokens: 5 }, 'w1'),
    );
    await service.finalizeWorkflowMetrics(tmpDir, 'w1', [
      makeStep('s1', 'm1', { input_tokens: 10, output_tokens: 5 }, 'w1'),
    ]);

    await service.updateFromStep(
      tmpDir,
      makeStep('s2', 'm1', { input_tokens: 20, output_tokens: 10 }, 'w2'),
    );
    await service.finalizeWorkflowMetrics(tmpDir, 'w2', [
      makeStep('s2', 'm1', { input_tokens: 20, output_tokens: 10 }, 'w2'),
    ]);

    const raw = await fs.readFile(path.join(tmpDir, 'session-metrics.json'), 'utf8');
    const data = JSON.parse(raw);
    expect(data.models.m1.input_tokens).toBe(30);
    expect(data.models.m1.billable_hops).toBe(2);
    expect(data.models.m1.finalized_runs).toBe(2);
    expect(data.session_totals.finalized_runs).toBe(2);
  });

  it('finalize aplica tokens de steps no aplicados per-step (fallback brownfield)', async () => {
    const step = makeStep('s1', 'm1', { input_tokens: 15, output_tokens: 3 });
    await service.finalizeWorkflowMetrics(tmpDir, 'w1', [step]);

    const raw = await fs.readFile(path.join(tmpDir, 'session-metrics.json'), 'utf8');
    const data = JSON.parse(raw);
    expect(data.models.m1.billable_hops).toBe(1);
    expect(data.models.m1.input_tokens).toBe(15);
    expect(data.models.m1.finalized_runs).toBe(1);
  });

  it('hallazgo 2: side-request + agentic atribuye run solo al modelo agéntico', async () => {
    const sideStep = makeStep(
      's-side',
      'm-lite',
      { input_tokens: 5, output_tokens: 1 },
      'w1',
      'side-request',
      1,
    );
    const agenticStep = makeStep(
      's-agentic',
      'm-standard',
      { input_tokens: 100, output_tokens: 50 },
      'w1',
      'agentic',
      2,
    );
    await service.updateFromStep(tmpDir, sideStep);
    await service.updateFromStep(tmpDir, agenticStep);
    await service.finalizeWorkflowMetrics(tmpDir, 'w1', [sideStep, agenticStep]);

    const raw = await fs.readFile(path.join(tmpDir, 'session-metrics.json'), 'utf8');
    const data = JSON.parse(raw);
    expect(data.models['m-lite'].billable_hops).toBe(1);
    expect(data.models['m-lite'].finalized_runs).toBe(0);
    expect(data.models['m-standard'].billable_hops).toBe(1);
    expect(data.models['m-standard'].finalized_runs).toBe(1);
    expect(data.session_totals.finalized_runs).toBe(1);
    expect(data.session_totals.billable_hops).toBe(2);
  });

  it('solo side-request sin hop agéntico no incrementa finalized_runs', async () => {
    const sideStep = makeStep(
      's-side',
      'm-lite',
      { input_tokens: 5, output_tokens: 1 },
      'w1',
      'side-request',
      1,
    );
    await service.updateFromStep(tmpDir, sideStep);
    await service.finalizeWorkflowMetrics(tmpDir, 'w1', [sideStep]);

    const raw = await fs.readFile(path.join(tmpDir, 'session-metrics.json'), 'utf8');
    const data = JSON.parse(raw);
    expect(data.models['m-lite'].billable_hops).toBe(1);
    expect(data.models['m-lite'].finalized_runs).toBe(0);
    // El cierre del workflow se cuenta en totales aunque no haya modelo atribuido.
    expect(data.session_totals.finalized_runs).toBe(1);
  });

  it('finalizeWorkflowMetrics es idempotente con steps sin usage', async () => {
    const step = makeStep('s1', 'm1', undefined);
    await service.finalizeWorkflowMetrics(tmpDir, 'w1', [step]);
    await service.finalizeWorkflowMetrics(tmpDir, 'w1', [step]);

    const rawApplied = await fs.readFile(path.join(tmpDir, 'session-metrics-applied.json'), 'utf8');
    const applied = JSON.parse(rawApplied);
    expect(applied.finalized_workflow_ids).toEqual(['w1']);

    const raw = await fs.readFile(path.join(tmpDir, 'session-metrics.json'), 'utf8');
    const data = JSON.parse(raw);
    expect(data.session_totals.finalized_runs).toBe(1);
  });

  it('finalizeWorkflowMetrics es idempotente con usage pero sin modelo atribuible', async () => {
    const sideStep = makeStep(
      's-side',
      'm-lite',
      { input_tokens: 5, output_tokens: 1 },
      'w1',
      'side-request',
      1,
    );
    await service.finalizeWorkflowMetrics(tmpDir, 'w1', [sideStep]);
    await service.finalizeWorkflowMetrics(tmpDir, 'w1', [sideStep]);

    const rawApplied = await fs.readFile(path.join(tmpDir, 'session-metrics-applied.json'), 'utf8');
    const applied = JSON.parse(rawApplied);
    expect(applied.finalized_workflow_ids).toEqual(['w1']);

    const raw = await fs.readFile(path.join(tmpDir, 'session-metrics.json'), 'utf8');
    const data = JSON.parse(raw);
    expect(data.models['m-lite'].billable_hops).toBe(1);
    expect(data.session_totals.finalized_runs).toBe(1);
  });

  it('dos workflows distintos suman finalized_runs en totales y por modelo', async () => {
    await service.finalizeWorkflowMetrics(tmpDir, 'w1', [
      makeStep('s1', 'm1', { input_tokens: 10, output_tokens: 5 }, 'w1'),
    ]);
    await service.finalizeWorkflowMetrics(tmpDir, 'w2', [
      makeStep('s2', 'm1', { input_tokens: 20, output_tokens: 10 }, 'w2'),
    ]);

    const raw = await fs.readFile(path.join(tmpDir, 'session-metrics.json'), 'utf8');
    const data = JSON.parse(raw);
    expect(data.session_totals.finalized_runs).toBe(2);
    expect(data.models.m1.finalized_runs).toBe(2);
  });
});
