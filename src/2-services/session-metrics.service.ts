import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { IStep } from '../1-domain/interfaces/gateway/IStep.js';
import type { AnthropicUsage } from '../1-domain/types/anthropic.types.js';
import type {
  IModelSessionMetrics,
  ISessionMetrics,
  ISessionTotals,
} from '../1-domain/types/gateway/session-metrics.types.js';
import { aggregateWorkflowUsageByModel } from '../1-domain/services/gateway/aggregate-workflow-usage-by-model.js';
import { resolveAttributedModelId } from '../1-domain/services/gateway/resolve-attributed-model-id.js';
import { writeJsonAtomic } from './utils/file-write.utils.js';

const SESSION_METRICS_FILE = 'session-metrics.json';
const SESSION_METRICS_APPLIED_FILE = 'session-metrics-applied.json';

export interface SessionMetricsAppliedState {
  applied_step_ids: string[];
  finalized_workflow_ids: string[];
}

/** Calcula cache_efficiency según §33.2. */
export function computeCacheEfficiency(inputTokens: number, cacheReadInputTokens: number): number {
  const denominator = inputTokens + cacheReadInputTokens;
  if (denominator <= 0) return 0;
  return cacheReadInputTokens / denominator;
}

function emptySessionMetrics(): ISessionMetrics {
  return {
    models: {},
    session_totals: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      billable_hops: 0,
      finalized_runs: 0,
    },
  };
}

function emptyAppliedState(): SessionMetricsAppliedState {
  return { applied_step_ids: [], finalized_workflow_ids: [] };
}

function recalcSessionTotals(models: Record<string, IModelSessionMetrics>): ISessionTotals {
  let input_tokens = 0;
  let output_tokens = 0;
  let cache_creation_input_tokens = 0;
  let cache_read_input_tokens = 0;
  let billable_hops = 0;

  for (const m of Object.values(models)) {
    input_tokens += m.input_tokens;
    output_tokens += m.output_tokens;
    cache_creation_input_tokens += m.cache_creation_input_tokens;
    cache_read_input_tokens += m.cache_read_input_tokens;
    billable_hops += m.billable_hops;
  }

  return {
    input_tokens,
    output_tokens,
    cache_creation_input_tokens,
    cache_read_input_tokens,
    billable_hops,
    finalized_runs: 0,
  };
}

function defaultModelMetrics(): IModelSessionMetrics {
  return {
    billable_hops: 0,
    finalized_runs: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_efficiency: 0,
  };
}

function mergeModelUsage(
  existing: IModelSessionMetrics,
  usage: AnthropicUsage,
  hopCount: number,
  finalizedRunsDelta: number,
): IModelSessionMetrics {
  const input_tokens = usage.input_tokens;
  const output_tokens = usage.output_tokens;
  const cache_creation_input_tokens = usage.cache_creation_input_tokens ?? 0;
  const cache_read_input_tokens = usage.cache_read_input_tokens ?? 0;

  const mergedInput = existing.input_tokens + input_tokens;
  const mergedCacheRead = existing.cache_read_input_tokens + cache_read_input_tokens;

  return {
    billable_hops: existing.billable_hops + hopCount,
    finalized_runs: existing.finalized_runs + finalizedRunsDelta,
    input_tokens: mergedInput,
    output_tokens: existing.output_tokens + output_tokens,
    cache_creation_input_tokens: existing.cache_creation_input_tokens + cache_creation_input_tokens,
    cache_read_input_tokens: mergedCacheRead,
    cache_efficiency: computeCacheEfficiency(mergedInput, mergedCacheRead),
  };
}

async function loadMetrics(sessionDir: string): Promise<ISessionMetrics> {
  const filePath = path.join(sessionDir, SESSION_METRICS_FILE);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw) as ISessionMetrics;
    if (!data.session_totals) {
      return { ...emptySessionMetrics(), models: data.models ?? {} };
    }
    return data;
  } catch {
    return emptySessionMetrics();
  }
}

async function loadAppliedState(sessionDir: string): Promise<SessionMetricsAppliedState> {
  const filePath = path.join(sessionDir, SESSION_METRICS_APPLIED_FILE);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SessionMetricsAppliedState>;
    return {
      applied_step_ids: Array.isArray(parsed.applied_step_ids) ? parsed.applied_step_ids : [],
      finalized_workflow_ids: Array.isArray(parsed.finalized_workflow_ids)
        ? parsed.finalized_workflow_ids
        : [],
    };
  } catch {
    return emptyAppliedState();
  }
}

async function writeMetricsAndApplied(
  sessionDir: string,
  data: ISessionMetrics,
  applied: SessionMetricsAppliedState,
): Promise<void> {
  await writeJsonAtomic(
    path.join(sessionDir, SESSION_METRICS_FILE),
    data as unknown as import('../1-domain/types/json.types.js').JsonValue,
  );
  await writeJsonAtomic(
    path.join(sessionDir, SESSION_METRICS_APPLIED_FILE),
    applied as unknown as import('../1-domain/types/json.types.js').JsonValue,
  );
}

/**
 * Métricas de sesión en `session-metrics.json` (G16′: main y subagent).
 */
export class SessionMetricsService {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {}

  /** Persiste consumo de un hop contable; no modifica finalized_runs. */
  public updateFromStep(sessionDir: string, step: IStep): Promise<void> {
    const run = async () => {
      if (step.usage == null) return;

      const applied = await loadAppliedState(sessionDir);
      if (applied.applied_step_ids.includes(step.id)) return;

      const modelId = step.inferenceRequest.model;
      const data = await loadMetrics(sessionDir);
      const existing = data.models[modelId] ?? defaultModelMetrics();

      data.models[modelId] = mergeModelUsage(existing, step.usage, 1, 0);
      data.session_totals = {
        ...recalcSessionTotals(data.models),
        finalized_runs: applied.finalized_workflow_ids.length,
      };

      applied.applied_step_ids.push(step.id);
      await writeMetricsAndApplied(sessionDir, data, applied);
    };

    this.writeQueue = this.writeQueue.then(run, run);
    return this.writeQueue;
  }

  /**
   * Cierre E2E de workflow agéntico: +1 finalized_runs al modelo del primer hop agéntico con usage (D3).
   * Tokens/billable_hops solo para steps no aplicados per-step.
   */
  public finalizeWorkflowMetrics(
    sessionDir: string,
    workflowId: string,
    closedSteps: IStep[],
  ): Promise<void> {
    const run = async () => {
      const applied = await loadAppliedState(sessionDir);
      if (applied.finalized_workflow_ids.includes(workflowId)) return;

      const data = await loadMetrics(sessionDir);

      const stepsWithUsage = closedSteps.filter((s) => s.usage != null);
      if (stepsWithUsage.length > 0) {
        const attributedModelId = resolveAttributedModelId(closedSteps);
        if (attributedModelId) {
          const existing = data.models[attributedModelId] ?? defaultModelMetrics();
          data.models[attributedModelId] = {
            ...existing,
            finalized_runs: existing.finalized_runs + 1,
          };
        }

        const unapplied = stepsWithUsage.filter((s) => !applied.applied_step_ids.includes(s.id));
        const byModel = aggregateWorkflowUsageByModel(unapplied);
        for (const [modelId, entry] of Object.entries(byModel)) {
          const existing = data.models[modelId] ?? defaultModelMetrics();
          data.models[modelId] = mergeModelUsage(existing, entry.usage, entry.stepCount, 0);
          for (const step of unapplied) {
            if (
              step.inferenceRequest.model === modelId &&
              !applied.applied_step_ids.includes(step.id)
            ) {
              applied.applied_step_ids.push(step.id);
            }
          }
        }
      }

      // Registro incondicional: la guarda de idempotencia debe cubrir a los tres
      // callers aunque el workflow no tenga usage ni modelo atribuido.
      applied.finalized_workflow_ids.push(workflowId);
      data.session_totals = {
        ...recalcSessionTotals(data.models),
        finalized_runs: applied.finalized_workflow_ids.length,
      };
      await writeMetricsAndApplied(sessionDir, data, applied);
    };

    this.writeQueue = this.writeQueue.then(run, run);
    return this.writeQueue;
  }
}
