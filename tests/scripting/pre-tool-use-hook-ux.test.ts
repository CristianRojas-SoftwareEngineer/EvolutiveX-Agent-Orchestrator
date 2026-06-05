import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPreToolUseHookUx } from '../../scripting/pre-tool-use-hook-ux.js';

const ACCENT_SAMPLE = 'Prueba tildes: sesión, configuración, ¿usamos Redis?';

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

describe('pre-tool-use-hook-ux', () => {
  beforeEach(() => {
    postHookEventMock.mockClear();
    notifySpy.mockClear();
    vi.mocked(readStdinBuffer).mockReset();
  });

  it('AskUserQuestion: POST /hooks y toast con tildes en la pregunta', async () => {
    const payload = {
      hook_event_name: 'PreToolUse',
      tool_name: 'AskUserQuestion',
      tool_input: {
        questions: [{ question: ACCENT_SAMPLE }],
      },
    };
    const body = Buffer.from(JSON.stringify(payload), 'utf-8');
    vi.mocked(readStdinBuffer).mockResolvedValue(body);

    expect(await runPreToolUseHookUx()).toBe(0);
    expect(postHookEventMock).toHaveBeenCalledWith(body);
    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'PreToolUse',
        message: expect.stringContaining('sesión'),
      }),
    );
    const event = notifySpy.mock.calls[0]?.[0] as { message: string };
    expect(event.message).toContain('configuración');
    expect(event.message).not.toMatch(/Ã/);
  });

  it('otra tool: solo POST /hooks, sin toast', async () => {
    const payload = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    };
    const body = Buffer.from(JSON.stringify(payload), 'utf-8');
    vi.mocked(readStdinBuffer).mockResolvedValue(body);

    expect(await runPreToolUseHookUx()).toBe(0);
    expect(postHookEventMock).toHaveBeenCalled();
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('stdin vacío: POST y sin toast', async () => {
    vi.mocked(readStdinBuffer).mockResolvedValue(Buffer.alloc(0));
    expect(await runPreToolUseHookUx()).toBe(0);
    expect(notifySpy).not.toHaveBeenCalled();
  });
});
