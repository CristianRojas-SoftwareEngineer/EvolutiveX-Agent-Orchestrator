import type {
  AnthropicMessage,
  AnthropicRequest,
  AnthropicUsage,
} from '../../types/anthropic.types.js';
import type { StepKind } from '../../types/audit.types.js';
import type { IToolUse } from './IToolUse.js';

/** Unidad de observabilidad: agrupa inferencia, respuesta y ejecución de tools de un ciclo. */
export interface IStep {
  /** Identificador del step. */
  id: string;
  /** Workflow al que pertenece. */
  workflowId: string;
  /** Posición base 1 dentro del workflow (alineada con `steps/MM/` en disco). */
  index: number;
  /** Tipo semántico del hop HTTP (`agentic` | `side-request`). */
  stepKind?: StepKind;
  /** Snapshot del request de inferencia al abrir el step. */
  inferenceRequest: AnthropicRequest;
  /** Respuesta consolidada del modelo (`role: 'assistant'`). */
  assistantMessage: AnthropicMessage;
  /** Invocaciones de herramienta de este ciclo. */
  toolUses: IToolUse[];
  /**
   * Métricas de tokens del hop de inferencia (wire).
   * Solo este step; agregación E2E en WorkflowResult. Ver §15.7.
   */
  usage?: AnthropicUsage;
  /** Razón de parada reportada por Anthropic (`end_turn`, `tool_use`, …). */
  stopReason?: string;
  /** Momento de apertura del step. */
  startedAt: Date;
  /** Momento de cierre del step. */
  closedAt?: Date;
}
