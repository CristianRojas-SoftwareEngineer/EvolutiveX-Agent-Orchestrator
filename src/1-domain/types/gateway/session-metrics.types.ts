/** Métricas agregadas por modelo dentro de una sesión (§33.2). */
export interface IModelSessionMetrics {
  count: number;
  workflow_count: number;
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
  total_steps: number;
  total_workflows: number;
}

/** Contenido de `session-metrics.json` en la raíz de la sesión (§33.2). */
export interface ISessionMetrics {
  models: Record<string, IModelSessionMetrics>;
  session_totals: ISessionTotals;
}
