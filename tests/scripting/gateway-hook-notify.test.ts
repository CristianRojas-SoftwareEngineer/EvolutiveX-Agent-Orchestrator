import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runGatewayHookNotify } from '../../scripting/gateway-hook-notify.js';

const ACCENT_SAMPLE = 'Prueba tildes: sesión, configuración, acción';

const { postHookEventMock, notifySpy } = vi.hoisted(() => ({
  postHookEventMock: vi.fn().mockResolvedValue(0),
  notifySpy: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../scripting/post-hook-event.js', () => ({
  readStdinBuffer: vi.fn(),
  postHookEvent: (...args: unknown[]) => postHookEventMock(...args),
}));

vi.mock('../../src/2-services/notifications/DesktopNotificationAdapter.js', () => ({
  DesktopNotificationAdapter: class {
    notify(event: unknown) {
      return notifySpy(event);
    }
  },
}));

import { readStdinBuffer } from '../../scripting/post-hook-event.js';

describe('gateway-hook-notify', () => {
  beforeEach(() => {
    postHookEventMock.mockClear();
    notifySpy.mockClear();
    vi.mocked(readStdinBuffer).mockReset();
  });

  it('UserPromptSubmit: POST /hooks y toast con prompt UTF-8', async () => {
    const payload = {
      hook_event_name: 'UserPromptSubmit',
      prompt: ACCENT_SAMPLE,
    };
    const body = Buffer.from(`${JSON.stringify(payload)}\n`, 'utf-8');
    vi.mocked(readStdinBuffer).mockResolvedValue(body);

    const code = await runGatewayHookNotify('UserPromptSubmit');
    expect(code).toBe(0);
    expect(postHookEventMock).toHaveBeenCalledWith(body);
    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'UserPromptSubmit',
        message: ACCENT_SAMPLE,
      }),
    );
  });

  it('StopFailure: mensaje con tildes del catálogo de error', async () => {
    const payload = {
      hook_event_name: 'StopFailure',
      error: 'rate_limit',
      last_assistant_message: ACCENT_SAMPLE,
    };
    const body = Buffer.from(JSON.stringify(payload), 'utf-8');
    vi.mocked(readStdinBuffer).mockResolvedValue(body);

    const code = await runGatewayHookNotify('StopFailure');
    expect(code).toBe(0);
    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Límite de tasa (API)'),
      }),
    );
    const event = notifySpy.mock.calls[0]?.[0] as { message: string };
    expect(event.message).toContain('sesión');
    expect(event.message).not.toMatch(/Ã/);
  });

  it('stdin vacío devuelve código 1', async () => {
    vi.mocked(readStdinBuffer).mockResolvedValue(Buffer.alloc(0));
    expect(await runGatewayHookNotify('UserPromptSubmit')).toBe(1);
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('event-type no soportado devuelve código 1', async () => {
    expect(await runGatewayHookNotify('SessionStart')).toBe(1);
  });
});
