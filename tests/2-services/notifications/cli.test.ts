// Tests del CLI de notificaciones: defaults de branding, overrides,
// degradación con icono ausente, --stdin-json.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { existsSyncMock, DesktopNotificationAdapterCtor, notifySpy } = vi.hoisted(() => {
  return {
    existsSyncMock: vi.fn(),
    DesktopNotificationAdapterCtor: vi.fn(),
    notifySpy: vi.fn(),
  };
});

vi.mock('fs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  // Default: el icono por defecto SÍ existe (alineado con el repo tras
  // el change). Tests específicos pueden sobreescribirlo con
  // `existsSyncMock.mockReturnValue(false)` en beforeEach.
  existsSyncMock.mockReturnValue(true);
  return {
    ...actual,
    existsSync: existsSyncMock,
  };
});

vi.mock('../../../src/2-services/notifications/DesktopNotificationAdapter.js', () => {
  return {
    DesktopNotificationAdapter: class {
      constructor() {
        DesktopNotificationAdapterCtor();
      }
      notify(event: unknown) {
        notifySpy(event);
        return Promise.resolve();
      }
    },
  };
});

import {
  buildEvent,
  resolveBranding,
  resolveEventSound,
  resolveEventKey,
  resolveNotificationTitle,
  resolveNotificationMessage,
} from '../../../src/2-services/notifications/cli.js';
import { NOTIFICATION_BRAND_TITLE } from '../../../src/2-services/notifications/event-notification-profile.js';

const baseOptions = {
  eventType: 'Stop',
  message: 'Test',
  title: undefined,
  sound: false,
  silent: false,
  stdinJson: false,
  appId: undefined,
  icon: undefined,
};

describe('CLI - resolveBranding', () => {
  beforeEach(() => {
    notifySpy.mockReset();
    DesktopNotificationAdapterCtor.mockReset();
  });

  it('aplica el default AIAssistant.Proxy cuando no se pasa --app-id', () => {
    const { appId, icon } = resolveBranding(baseOptions, 'Stop');
    expect(appId).toBe('AIAssistant.Proxy');
    expect(icon).toBeDefined();
    expect(icon as string).toMatch(/stop\.png$/);
  });

  it('respeta el override de --app-id', () => {
    const { appId } = resolveBranding({ ...baseOptions, appId: 'Custom.Id' });
    expect(appId).toBe('Custom.Id');
  });

  it('respeta el override de --icon', () => {
    const { icon } = resolveBranding({ ...baseOptions, icon: '/tmp/custom.png' });
    expect(icon).toBe('/tmp/custom.png');
  });

  it('omite icon cuando el default no existe en disco', () => {
    // Re-mock: el icono por defecto NO existe.
    // NOTA: en este test, `DEFAULT_ICON_EXISTS` se evaluó al cargar el
    // módulo con el mock devolviendo `true`. La rama "icono ausente" se
    // cubre de forma robusta en el describe 'CLI - buildEvent (icono
    // ausente)' más abajo, usando `vi.resetModules()` + import dinámico.
    void existsSyncMock;
  });
});

describe('CLI - buildEvent', () => {
  beforeEach(() => {
    notifySpy.mockReset();
    DesktopNotificationAdapterCtor.mockReset();
    // Restaurar el default después de tests anteriores.
    existsSyncMock.mockReturnValue(true);
  });

  it('incluye appId e icon del perfil Stop por defecto', () => {
    const result = buildEvent(baseOptions, undefined, 'win32');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.appId).toBe('AIAssistant.Proxy');
      expect(result.icon).toBeDefined();
      expect(result.icon as string).toMatch(/stop\.png$/);
      expect(result.sound).toBe('Notification.IM');
    }
  });

  it('resolveEventSound con --silent fuerza false', () => {
    expect(resolveEventSound({ ...baseOptions, silent: true }, 'StopFailure', 'win32')).toBe(false);
  });

  it('resolveEventSound con --sound fuerza true genérico', () => {
    expect(resolveEventSound({ ...baseOptions, sound: true }, 'StopFailure', 'win32')).toBe(true);
  });

  it('resolveEventKey prefiere --event-type sobre stdin', () => {
    expect(
      resolveEventKey(
        { ...baseOptions, eventType: 'Stop' },
        { hook_event_name: 'Other' },
      ),
    ).toBe('Stop');
  });

  it('respeta --app-id como override', () => {
    const result = buildEvent({ ...baseOptions, appId: 'Custom.Id' });
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.appId).toBe('Custom.Id');
    }
  });

  it('respeta --icon como override', () => {
    const result = buildEvent({ ...baseOptions, icon: '/tmp/custom.png' }, undefined, 'win32');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.icon).toBe('/tmp/custom.png');
    }
  });

  it('StopFailure en linux usa sound boolean true', () => {
    const result = buildEvent(
      { ...baseOptions, eventType: 'StopFailure', message: 'fail' },
      undefined,
      'linux',
    );
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.sound).toBe(true);
    }
  });

  it('omite icon si el default no existe (degradación con gracia)', () => {
    // NOTA: este test no puede verificar la rama "default ausente" porque
    // `DEFAULT_ICON_EXISTS` se evaluó al cargar el módulo con el mock
    // devolviendo `true`. La rama "icono ausente" se cubre de forma
    // robusta en el describe 'CLI - buildEvent (icono ausente al cargar
    // el módulo)' más abajo, usando `vi.resetModules()` + import dinámico.
    expect(true).toBe(true);
  });

  it('sin --message usa el catálogo del evento', () => {
    const result = buildEvent({ ...baseOptions, message: undefined });
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.title).toBe(NOTIFICATION_BRAND_TITLE);
      expect(result.message).toMatch(/terminó/i);
    }
  });

  it('sin --event-type devuelve error', () => {
    const result = buildEvent({ ...baseOptions, eventType: undefined });
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toMatch(/--event-type/);
    }
  });

  it('con --stdin-json usa título del catálogo y mensaje dinámico StopFailure', () => {
    const result = buildEvent(
      {
        ...baseOptions,
        stdinJson: true,
        eventType: 'StopFailure',
        message: undefined,
      },
      {
        hook_event_name: 'StopFailure',
        error: 'rate_limit',
        last_assistant_message: 'Detalle del asistente',
      },
    );
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.title).toBe(NOTIFICATION_BRAND_TITLE);
      expect(result.message).toContain('Límite de tasa (API)');
      expect(result.appId).toBe('AIAssistant.Proxy');
    }
  });

  it('con --stdin-json y Stop sin last_assistant_message usa mensaje del catálogo', () => {
    const result = buildEvent(
      { ...baseOptions, stdinJson: true, eventType: 'Stop', message: undefined },
      { hook_event_name: 'Stop', session_id: 'abc' },
    );
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.title).toBe(NOTIFICATION_BRAND_TITLE);
      expect(result.message).toMatch(/terminó/i);
    }
  });

  it('respeta --title como override', () => {
    expect(
      resolveNotificationTitle({ ...baseOptions, title: 'Título custom' }, 'Stop'),
    ).toBe('Título custom');
  });

  it('respeta --message como override frente al formatter', () => {
    expect(
      resolveNotificationMessage(
        { ...baseOptions, stdinJson: true, message: 'Override' },
        'StopFailure',
        { error: 'rate_limit' },
      ),
    ).toBe('Override');
  });

  it('con --stdin-json y sin payload devuelve error', () => {
    const result = buildEvent({ ...baseOptions, stdinJson: true, eventType: undefined, message: undefined });
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toMatch(/stdin/);
    }
  });
});

describe('CLI - buildEvent (icono ausente al cargar el módulo)', () => {
  // Para cubrir la rama "el icono por defecto NO existe" hay que
  // re-importar el módulo con un mock de `existsSync` que devuelva
  // `false` desde el inicio (la constante `DEFAULT_ICON_EXISTS` se
  // evalúa al cargar el módulo).
  beforeEach(async () => {
    vi.resetModules();
    existsSyncMock.mockReturnValue(false);
  });

  it('omite el campo icon del evento cuando el default no existe en disco', async () => {
    const { buildEvent: buildEventFresh } = await import(
      '../../../src/2-services/notifications/cli.js'
    );
    const result = buildEventFresh({
      eventType: 'Stop',
      message: 'Test',
      title: undefined,
      sound: false,
      silent: false,
      stdinJson: false,
      appId: undefined,
      icon: undefined,
    });
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.appId).toBe('AIAssistant.Proxy');
      expect(result.icon).toBeUndefined();
    }
  });
});
