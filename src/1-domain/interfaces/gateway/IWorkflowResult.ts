import type { AnthropicUsage } from '../../types/anthropic.types.js';
import type { WorkflowClosedByEvent, WorkflowOutcome } from '../../types/gateway/workflow.types.js';

/** Value object inmutable que captura el resultado del workflow al cierre. */
export interface IWorkflowResult {
  /** Resultado global: derivado del hook de cierre según §15.4. */
  outcome: WorkflowOutcome;
  /**
   * Texto plano E2E; passthrough de `last_assistant_message` del hook de cierre.
   * Ausente si el hook no incluyó el campo o era vacío. Ver §15.8.
   */
  finalText?: string;
  /**
   * Consumo facturado por hop agregado (suma por categoría de steps cerrados
   * más rollup de hijos completados). `undefined` si ningún step aportó usage. Ver §15.7.
   */
  usage?: AnthropicUsage;
  /** Coste estimado en USD con tarifas propias del gateway. Diferido a fase posterior. */
  totalCostUsd?: number;
  /** Cantidad de steps cerrados al momento del cierre. */
  stepCount: number;
  /** Evento del hook que disparó el cierre. */
  closedByEvent: WorkflowClosedByEvent;
  /** `session_id` del hook de cierre. */
  sessionId: string;
}
