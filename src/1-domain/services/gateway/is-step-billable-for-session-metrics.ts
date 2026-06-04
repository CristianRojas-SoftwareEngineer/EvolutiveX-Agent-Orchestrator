/**
 * Indica si un hop de inferencia debe contabilizarse en session-metrics.json (per-step).
 * Debe alinearse con la rama terminal de registerWireStepInCorrelator (closeStep).
 * No usar step.closedAt: buildWireStep siempre asigna closedAt al crear el step.
 */
export function isStepBillableForSessionMetrics(stopReason: string | undefined): boolean {
  if (stopReason === 'tool_use') {
    return false;
  }
  return (
    stopReason === 'end_turn' ||
    stopReason === 'max_tokens' ||
    stopReason == null ||
    stopReason === ''
  );
}
