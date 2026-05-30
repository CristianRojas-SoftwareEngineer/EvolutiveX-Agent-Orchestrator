import type { AnthropicUsage } from '../../types/anthropic.types.js';
import type { IStep } from '../../interfaces/gateway/IStep.js';

export interface ModelUsageAggregate {
  usage: AnthropicUsage;
  stepCount: number;
}

/**
 * Agrega el uso de tokens de steps cerrados agrupados por `inferenceRequest.model`.
 * Devuelve `{}` si ningún step aporta `usage`.
 */
export function aggregateWorkflowUsageByModel(
  closedSteps: IStep[],
): Record<string, ModelUsageAggregate> {
  const byModel = new Map<string, { usage: AnthropicUsage; stepCount: number }>();

  for (const step of closedSteps) {
    const u = step.usage;
    if (u == null) continue;

    const modelId = step.inferenceRequest.model;
    const existing = byModel.get(modelId);

    if (!existing) {
      byModel.set(modelId, {
        usage: { ...u },
        stepCount: 1,
      });
      continue;
    }

    existing.stepCount += 1;
    existing.usage.input_tokens += u.input_tokens;
    existing.usage.output_tokens += u.output_tokens;
    existing.usage.cache_creation_input_tokens =
      (existing.usage.cache_creation_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    existing.usage.cache_read_input_tokens =
      (existing.usage.cache_read_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);

    if (u.cache_creation) {
      if (!existing.usage.cache_creation) {
        existing.usage.cache_creation = {
          ephemeral_5m_input_tokens: 0,
          ephemeral_1h_input_tokens: 0,
        };
      }
      existing.usage.cache_creation.ephemeral_5m_input_tokens =
        (existing.usage.cache_creation.ephemeral_5m_input_tokens ?? 0) +
        (u.cache_creation.ephemeral_5m_input_tokens ?? 0);
      existing.usage.cache_creation.ephemeral_1h_input_tokens =
        (existing.usage.cache_creation.ephemeral_1h_input_tokens ?? 0) +
        (u.cache_creation.ephemeral_1h_input_tokens ?? 0);
    }
  }

  const result: Record<string, ModelUsageAggregate> = {};
  for (const [modelId, entry] of byModel) {
    const usage: AnthropicUsage = {
      input_tokens: entry.usage.input_tokens,
      output_tokens: entry.usage.output_tokens,
    };
    const cacheCreation = entry.usage.cache_creation_input_tokens ?? 0;
    const cacheRead = entry.usage.cache_read_input_tokens ?? 0;
    if (cacheCreation > 0) usage.cache_creation_input_tokens = cacheCreation;
    if (cacheRead > 0) usage.cache_read_input_tokens = cacheRead;
    if (entry.usage.cache_creation) {
      usage.cache_creation = { ...entry.usage.cache_creation };
    }
    result[modelId] = { usage, stepCount: entry.stepCount };
  }

  return result;
}
