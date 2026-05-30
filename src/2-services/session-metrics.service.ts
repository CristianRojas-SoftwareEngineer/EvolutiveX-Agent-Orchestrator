import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { IStep } from '../1-domain/interfaces/gateway/IStep.js';
import type {
  IModelSessionMetrics,
  ISessionMetrics,
  ISessionTotals,
} from '../1-domain/types/gateway/session-metrics.types.js';
import { aggregateWorkflowUsageByModel } from '../1-domain/services/gateway/aggregate-workflow-usage-by-model.js';
import type { IAuditWriter } from './ports/audit-writer.port.js';

/** Calcula cache_efficiency según §33.2. */
export function computeCacheEfficiency(
  inputTokens: number,
  cacheReadInputTokens: number,
): number {
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
      total_steps: 0,
    },
  };
}

function recalcSessionTotals(models: Record<string, IModelSessionMetrics>): ISessionTotals {
  let input_tokens = 0;
  let output_tokens = 0;
  let cache_creation_input_tokens = 0;
  let cache_read_input_tokens = 0;
  let total_steps = 0;

  for (const m of Object.values(models)) {
    input_tokens += m.input_tokens;
    output_tokens += m.output_tokens;
    cache_creation_input_tokens += m.cache_creation_input_tokens;
    cache_read_input_tokens += m.cache_read_input_tokens;
    total_steps += m.count;
  }

  return {
    input_tokens,
    output_tokens,
    cache_creation_input_tokens,
    cache_read_input_tokens,
    total_steps,
  };
}

/**
 * Actualiza `session-metrics.json` al cierre de un workflow main (invariante G16).
 */
export class SessionMetricsService {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly auditWriter: IAuditWriter) {}

  /** Serializa escrituras para evitar races en concurrencia. */
  public updateFromWorkflow(sessionDir: string, closedSteps: IStep[]): Promise<void> {
    const run = async () => {
      const byModel = aggregateWorkflowUsageByModel(closedSteps);
      if (Object.keys(byModel).length === 0) return;

      const filePath = path.join(sessionDir, 'session-metrics.json');
      let data = emptySessionMetrics();
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        data = JSON.parse(raw) as ISessionMetrics;
        if (!data.session_totals) {
          data = { ...emptySessionMetrics(), models: data.models ?? {} };
        }
      } catch {
        /* ENOENT o parse — empezar desde cero */
      }

      for (const [modelId, entry] of Object.entries(byModel)) {
        const u = entry.usage;
        const input_tokens = u.input_tokens;
        const output_tokens = u.output_tokens;
        const cache_creation_input_tokens = u.cache_creation_input_tokens ?? 0;
        const cache_read_input_tokens = u.cache_read_input_tokens ?? 0;

        const existing = data.models[modelId] ?? {
          count: 0,
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          cache_efficiency: 0,
        };

        const mergedInput = existing.input_tokens + input_tokens;
        const mergedCacheRead = existing.cache_read_input_tokens + cache_read_input_tokens;

        data.models[modelId] = {
          count: existing.count + entry.stepCount,
          input_tokens: mergedInput,
          output_tokens: existing.output_tokens + output_tokens,
          cache_creation_input_tokens:
            existing.cache_creation_input_tokens + cache_creation_input_tokens,
          cache_read_input_tokens: mergedCacheRead,
          cache_efficiency: computeCacheEfficiency(mergedInput, mergedCacheRead),
        };
      }

      data.session_totals = recalcSessionTotals(data.models);
      await this.auditWriter.writeJsonAtomic(filePath, data as unknown as import('../1-domain/types/json.types.js').JsonValue);
    };

    this.writeQueue = this.writeQueue.then(run, run);
    return this.writeQueue;
  }
}
