/** Métricas agregadas por modelo dentro de una sesión (schema canónico). */
export interface IModelSessionMetrics {
  billable_hops: number;
  finalized_runs: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  cache_efficiency: number;
}

/** Totales de sesión agregados sobre todos los modelos. */
export interface ISessionTotals {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  billable_hops: number;
  finalized_runs: number;
}

/** Contenido de `session-metrics.json` en la raíz de la sesión. */
export interface ISessionMetrics {
  models: Record<string, IModelSessionMetrics>;
  session_totals: ISessionTotals;
}
