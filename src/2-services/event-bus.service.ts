import type { IEventBus } from '../1-domain/repositories/IEventBus.js';
import type {
  TelemetryEvent,
  EventCallback,
  SubscriptionRef,
} from '../1-domain/types/telemetry.types.js';
import type { Logger } from '../1-domain/types/logger.types.js';
import { matches } from '../1-domain/services/event-pattern-match.service.js';
import { fireAndForget } from './utils/async.utils.js';

/**
 * Adapter async in-process de `IEventBus`.
 *
 * Almacena suscriptores en `Map<pattern, Set<callback>>`. `publish()` itera los
 * patrones que coinciden con `event.type` y ejecuta cada callback de forma
 * fire-and-forget: no espera su resolución y los errores se registran en log
 * sin propagarse al emisor. Instancia única por arranque del proxy.
 */
export class EventBus implements IEventBus {
  private readonly subscribers = new Map<string, Set<EventCallback>>();
  private readonly refs = new Map<string, { pattern: string; callback: EventCallback }>();
  private counter = 0;

  constructor(private readonly logger?: Logger) {}

  public publish(event: TelemetryEvent): void {
    for (const [pattern, callbacks] of this.subscribers) {
      if (!matches(pattern, event.type)) continue;
      for (const callback of callbacks) {
        fireAndForget(() => callback(event), this.logger);
      }
    }
  }

  public subscribe(pattern: string, callback: EventCallback): SubscriptionRef {
    let set = this.subscribers.get(pattern);
    if (!set) {
      set = new Set<EventCallback>();
      this.subscribers.set(pattern, set);
    }
    set.add(callback);
    const id = `sub-${++this.counter}`;
    this.refs.set(id, { pattern, callback });
    return { id, pattern };
  }

  public unsubscribe(ref: SubscriptionRef): void {
    const entry = this.refs.get(ref.id);
    if (!entry) return;
    const set = this.subscribers.get(entry.pattern);
    set?.delete(entry.callback);
    if (set && set.size === 0) this.subscribers.delete(entry.pattern);
    this.refs.delete(ref.id);
  }
}
