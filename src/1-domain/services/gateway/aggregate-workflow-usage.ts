import type { AnthropicUsage } from '../../types/anthropic.types.js';
import type { IStep } from '../../interfaces/gateway/IStep.js';
import type { IWorkflowResult } from '../../interfaces/gateway/IWorkflowResult.js';

/**
 * Agrega el uso de tokens de los steps cerrados y los results de child workflows.
 * Devuelve `undefined` si ninguna fuente aporta datos de uso (no se inventan ceros).
 * Los campos `service_tier` e `inference_geo` se omiten por no ser aditivos.
 */
export function aggregateWorkflowUsage(
  closedSteps: IStep[],
  childResults: IWorkflowResult[],
): AnthropicUsage | undefined {
  let hasAny = false;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationInputTokens = 0;
  let cacheReadInputTokens = 0;
  let cacheCreationEphemeral5m = 0;
  let cacheCreationEphemeral1h = 0;
  let hasCacheCreation = false;

  for (const step of closedSteps) {
    const u = step.usage;
    if (u == null) continue;
    hasAny = true;
    inputTokens += u.input_tokens;
    outputTokens += u.output_tokens;
    cacheCreationInputTokens += u.cache_creation_input_tokens ?? 0;
    cacheReadInputTokens += u.cache_read_input_tokens ?? 0;
    if (u.cache_creation) {
      hasCacheCreation = true;
      cacheCreationEphemeral5m += u.cache_creation.ephemeral_5m_input_tokens ?? 0;
      cacheCreationEphemeral1h += u.cache_creation.ephemeral_1h_input_tokens ?? 0;
    }
  }

  for (const child of childResults) {
    const u = child.usage;
    if (u == null) continue;
    hasAny = true;
    inputTokens += u.input_tokens;
    outputTokens += u.output_tokens;
    cacheCreationInputTokens += u.cache_creation_input_tokens ?? 0;
    cacheReadInputTokens += u.cache_read_input_tokens ?? 0;
    if (u.cache_creation) {
      hasCacheCreation = true;
      cacheCreationEphemeral5m += u.cache_creation.ephemeral_5m_input_tokens ?? 0;
      cacheCreationEphemeral1h += u.cache_creation.ephemeral_1h_input_tokens ?? 0;
    }
  }

  if (!hasAny) return undefined;

  const result: AnthropicUsage = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  };

  if (cacheCreationInputTokens > 0) {
    result.cache_creation_input_tokens = cacheCreationInputTokens;
  }
  if (cacheReadInputTokens > 0) {
    result.cache_read_input_tokens = cacheReadInputTokens;
  }
  if (hasCacheCreation) {
    result.cache_creation = {
      ephemeral_5m_input_tokens: cacheCreationEphemeral5m,
      ephemeral_1h_input_tokens: cacheCreationEphemeral1h,
    };
  }

  return result;
}
