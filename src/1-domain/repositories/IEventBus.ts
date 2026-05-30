import type { TelemetryEvent, EventCallback, SubscriptionRef } from '../types/telemetry.types.js';

/**
 * Port abstracto del bus de eventos async in-process.
 * Conecta el correlador (emisor) con `SessionPersistence` (suscriptor).
 */
export interface IEventBus {
  /** Emite un evento a todos los suscriptores cuyo patrón coincida con `event.type`. */
  publish(event: TelemetryEvent): void;
  /** Registra un suscriptor para eventos que coincidan con `pattern`. */
  subscribe(pattern: string, callback: EventCallback): SubscriptionRef;
  /** Elimina el suscriptor identificado por `ref`. */
  unsubscribe(ref: SubscriptionRef): void;
}
