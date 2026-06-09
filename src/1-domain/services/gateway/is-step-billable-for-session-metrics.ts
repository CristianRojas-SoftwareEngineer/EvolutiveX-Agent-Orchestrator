/**
 * Indica si un hop de inferencia debe contabilizarse en session-metrics.json (per-step).
 * Los hops tool_use se cierran en correlador pero no son billables; solo stops terminales.
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
