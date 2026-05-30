/**
 * Evento de telemetría emitido por el correlador (y handlers L3) al `EventBus`.
 * `SessionPersistence` lo consume para proyectar el layout `causal-workflows-v1`.
 */
export interface TelemetryEvent {
  /** Tipo del evento (`workflow_start`, `step_request`, `tool_result`, …). */
  type: string;
  /** Sesión a la que pertenece el evento. */
  sessionId: string;
  /** Workflow asociado, si aplica. */
  workflowId?: string;
  /** Marca temporal ISO-8601 de emisión. */
  timestamp: string;
  /** Carga útil específica del tipo de evento. */
  payload: unknown;
}

/** Callback de suscriptor; puede ser síncrono o async (fire-and-forget). */
export type EventCallback = (event: TelemetryEvent) => void | Promise<void>;

/** Handle opaco devuelto por `subscribe()` para permitir la desuscripción. */
export interface SubscriptionRef {
  /** Identificador único de la suscripción. */
  readonly id: string;
  /** Patrón con el que se registró el suscriptor. */
  readonly pattern: string;
}
