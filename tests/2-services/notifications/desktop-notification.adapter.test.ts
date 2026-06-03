// Tests unitarios de DesktopNotificationAdapter.
// Mockea node-notifier y verifica el subset de opciones pasado.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist: vi.mock se eleva al inicio del archivo, así que necesitamos
// que `notifyMock` también sea hoisted para evitar el
// "Cannot access before initialization".
const { notifyMock } = vi.hoisted(() => ({
  notifyMock: vi.fn(),
}));

vi.mock('node-notifier', () => ({
  default: {
    notify: notifyMock,
  },
}));

import { DesktopNotificationAdapter } from '../../../src/2-services/notifications/DesktopNotificationAdapter.js';

describe('DesktopNotificationAdapter', () => {
  let adapter: DesktopNotificationAdapter;

  beforeEach(() => {
    notifyMock.mockReset();
    notifyMock.mockImplementation(
      (_opts: unknown, cb: (err: Error | null) => void) => {
        cb(null);
      },
    );
    adapter = new DesktopNotificationAdapter();
  });

  it('notify con title+message invoca node-notifier sin campos de branding', async () => {
    await adapter.notify({ title: 'Hola', message: 'Mundo' });
    expect(notifyMock).toHaveBeenCalledTimes(1);
    const [opts] = notifyMock.mock.calls[0]!;
    expect(opts).not.toHaveProperty('icon');
    expect(opts).not.toHaveProperty('contentImage');
    // `appID` (con mayúsculas) es la clave que `node-notifier` v10
    // reconoce para reenviar a SnoreToast. Ver
    // `node_modules/node-notifier/lib/utils.js` línea 362.
    expect(opts).not.toHaveProperty('appID');
    expect(opts).toHaveProperty('title', 'Hola');
    expect(opts).toHaveProperty('message', 'Mundo');
    expect(opts).toHaveProperty('wait', false);
  });

  it('notify con sound=true invoca node-notifier con sound=true', async () => {
    await adapter.notify({ title: 'Hola', message: 'Mundo', sound: true });
    const [opts] = notifyMock.mock.calls[0]!;
    expect(opts).toHaveProperty('sound', true);
  });

  it('notify con silent=true traduce a sound=false', async () => {
    await adapter.notify({ title: 'Hola', message: 'Mundo', silent: true });
    const [opts] = notifyMock.mock.calls[0]!;
    expect(opts).toHaveProperty('sound', false);
  });

  it('notify sin sound ni silent usa sound=false por defecto', async () => {
    await adapter.notify({ title: 'Hola', message: 'Mundo' });
    const [opts] = notifyMock.mock.calls[0]!;
    expect(opts).toHaveProperty('sound', false);
  });

  it('notify propaga errores de node-notifier como rechazo', async () => {
    notifyMock.mockImplementationOnce(
      (_opts: unknown, cb: (err: Error | null) => void) => {
        cb(new Error('boom'));
      },
    );
    await expect(adapter.notify({ title: 'x', message: 'y' })).rejects.toThrow('boom');
  });

  it('las opciones sin branding tienen exactamente las claves del subset mínimo', async () => {
    await adapter.notify({ title: 'Hola', message: 'Mundo', sound: true });
    const [opts] = notifyMock.mock.calls[0]!;
    const keys = Object.keys(opts as Record<string, unknown>).sort();
    // Subset exacto: { message, sound, title, wait }. Cualquier clave
    // adicional (icon, contentImage, appID, …) falla este test.
    expect(keys).toEqual(['message', 'sound', 'title', 'wait']);
  });

  it('notify con appId e icon reenvía ambos a node-notifier como appID+icon', async () => {
    await adapter.notify({
      title: 'Hola',
      message: 'Mundo',
      appId: 'AIAssistant.Proxy',
      icon: '/ruta/icon.png',
    });
    const [opts] = notifyMock.mock.calls[0]!;
    // El adaptador traduce `appId` (camelCase, dominio) a `appID`
    // (mayúsculas, nomenclatura de node-notifier).
    expect(opts).toHaveProperty('appID', 'AIAssistant.Proxy');
    expect(opts).not.toHaveProperty('appId');
    expect(opts).toHaveProperty('icon', '/ruta/icon.png');
    expect(opts).toHaveProperty('title', 'Hola');
    expect(opts).toHaveProperty('message', 'Mundo');
    expect(opts).toHaveProperty('wait', false);
  });

  it('las opciones con appId e icon incluyen esos campos en el subset', async () => {
    await adapter.notify({
      title: 'Hola',
      message: 'Mundo',
      appId: 'X',
      icon: '/y.png',
    });
    const [opts] = notifyMock.mock.calls[0]!;
    const keys = Object.keys(opts as Record<string, unknown>).sort();
    expect(keys).toEqual(['appID', 'icon', 'message', 'sound', 'title', 'wait']);
  });

  it('notify con solo appId reenvía appID pero no icon', async () => {
    await adapter.notify({ title: 'Hola', message: 'Mundo', appId: 'X' });
    const [opts] = notifyMock.mock.calls[0]!;
    expect(opts).toHaveProperty('appID', 'X');
    expect(opts).not.toHaveProperty('icon');
  });
});
