import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../src/2-services/event-bus.service.js';
import type { TelemetryEvent } from '../../src/1-domain/types/telemetry.types.js';

function makeEvent(type: string): TelemetryEvent {
  return { type, sessionId: 's1', timestamp: new Date().toISOString(), payload: {} };
}

/** Espera un tick de microtask para que los callbacks fire-and-forget se ejecuten. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('EventBus', () => {
  it('publish entrega evento a suscriptor coincidente', async () => {
    const bus = new EventBus();
    const cb = vi.fn();
    bus.subscribe('workflow_start', cb);
    bus.publish(makeEvent('workflow_start'));
    await flushMicrotasks();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('publish no entrega a suscriptor no coincidente', async () => {
    const bus = new EventBus();
    const cb = vi.fn();
    bus.subscribe('workflow_start', cb);
    bus.publish(makeEvent('step_request'));
    await flushMicrotasks();
    expect(cb).not.toHaveBeenCalled();
  });

  it('unsubscribe desactiva el suscriptor', async () => {
    const bus = new EventBus();
    const cb = vi.fn();
    const ref = bus.subscribe('workflow_start', cb);
    bus.unsubscribe(ref);
    bus.publish(makeEvent('workflow_start'));
    await flushMicrotasks();
    expect(cb).not.toHaveBeenCalled();
  });

  it('publish con patrón wildcard entrega cualquier evento', async () => {
    const bus = new EventBus();
    const cb = vi.fn();
    bus.subscribe('*', cb);
    bus.publish(makeEvent('tool_result'));
    await flushMicrotasks();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('publish es fire-and-forget: retorna sin esperar al callback async', async () => {
    const bus = new EventBus();
    let resolved = false;
    bus.subscribe('workflow_start', async () => {
      await new Promise((r) => setTimeout(r, 50));
      resolved = true;
    });
    bus.publish(makeEvent('workflow_start'));
    // Inmediatamente tras publish, el callback async aún no terminó.
    expect(resolved).toBe(false);
  });

  it('error en un callback no afecta a otros suscriptores', async () => {
    const errorLog = vi.fn();
    const bus = new EventBus({ error: errorLog } as never);
    const cbOk = vi.fn();
    bus.subscribe('workflow_start', () => {
      throw new Error('fallo deliberado');
    });
    bus.subscribe('workflow_start', cbOk);
    bus.publish(makeEvent('workflow_start'));
    await flushMicrotasks();
    expect(cbOk).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalled();
  });
});
