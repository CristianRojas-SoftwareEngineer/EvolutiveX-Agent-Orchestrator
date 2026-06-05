import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runTaskInProgressHookUx } from '../../scripting/task-in-progress-hook-ux.js';

const { notifySpy } = vi.hoisted(() => ({
  notifySpy: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../scripting/post-hook-event.js', () => ({
  readStdinBuffer: vi.fn(),
}));

vi.mock('../../src/2-services/notifications/DesktopNotificationAdapter.js', () => ({
  DesktopNotificationAdapter: class {
    notify(event: unknown) {
      return notifySpy(event);
    }
  },
}));

import { readStdinBuffer } from '../../scripting/post-hook-event.js';

describe('task-in-progress-hook-ux', () => {
  beforeEach(() => {
    notifySpy.mockClear();
    vi.mocked(readStdinBuffer).mockReset();
  });

  it('TaskUpdate(in_progress) con subject invoca el adapter con título TaskInProgress y mensaje "Tarea iniciada: <subject>"', async () => {
    const payload = {
      hook_event_name: 'PostToolUse',
      tool_name: 'TaskUpdate',
      tool_input: { status: 'in_progress', subject: 'Refactor del parser' },
    };
    const body = Buffer.from(JSON.stringify(payload), 'utf-8');
    vi.mocked(readStdinBuffer).mockResolvedValue(body);

    const code = await runTaskInProgressHookUx();
    expect(code).toBe(0);
    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'TaskInProgress',
        message: 'Tarea iniciada: Refactor del parser',
      }),
    );
  });

  it('TaskUpdate(completed) NO invoca el adapter y devuelve 0', async () => {
    const payload = {
      hook_event_name: 'PostToolUse',
      tool_name: 'TaskUpdate',
      tool_input: { status: 'completed', subject: 'Refactor del parser' },
    };
    const body = Buffer.from(JSON.stringify(payload), 'utf-8');
    vi.mocked(readStdinBuffer).mockResolvedValue(body);

    const code = await runTaskInProgressHookUx();
    expect(code).toBe(0);
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('TaskUpdate(deleted) NO invoca el adapter y devuelve 0', async () => {
    const payload = {
      hook_event_name: 'PostToolUse',
      tool_name: 'TaskUpdate',
      tool_input: { status: 'deleted', subject: 'Refactor' },
    };
    const body = Buffer.from(JSON.stringify(payload), 'utf-8');
    vi.mocked(readStdinBuffer).mockResolvedValue(body);

    const code = await runTaskInProgressHookUx();
    expect(code).toBe(0);
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('TaskUpdate sin status NO invoca el adapter y devuelve 0 (defensa contra payloads malformados)', async () => {
    const payload = {
      hook_event_name: 'PostToolUse',
      tool_name: 'TaskUpdate',
      tool_input: { subject: 'Tarea sin status' },
    };
    const body = Buffer.from(JSON.stringify(payload), 'utf-8');
    vi.mocked(readStdinBuffer).mockResolvedValue(body);

    const code = await runTaskInProgressHookUx();
    expect(code).toBe(0);
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('stdin con JSON inválido escribe diagnóstico a stderr y termina con 0', async () => {
    const body = Buffer.from('{ "tool_input":', 'utf-8');
    vi.mocked(readStdinBuffer).mockResolvedValue(body);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const code = await runTaskInProgressHookUx();
    expect(code).toBe(0);
    expect(notifySpy).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalled();
    stderrSpy.mockRestore();
  });

  it('stdin vacío devuelve 0 sin invocar el adapter', async () => {
    vi.mocked(readStdinBuffer).mockResolvedValue(Buffer.alloc(0));
    expect(await runTaskInProgressHookUx()).toBe(0);
    expect(notifySpy).not.toHaveBeenCalled();
  });
});
