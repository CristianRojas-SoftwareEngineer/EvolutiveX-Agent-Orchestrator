import type { IStep } from '../../interfaces/gateway/IStep.js';

/**
 * Modelo al que se atribuye una ejecución agéntica finalizada (D3):
 * primer hop `stepKind === 'agentic'` con `usage`, orden ascendente por `index`.
 */
export function resolveAttributedModelId(closedSteps: IStep[]): string | undefined {
  const agenticWithUsage = closedSteps
    .filter((s) => s.stepKind === 'agentic' && s.usage != null)
    .sort((a, b) => a.index - b.index);
  return agenticWithUsage[0]?.inferenceRequest.model;
}
