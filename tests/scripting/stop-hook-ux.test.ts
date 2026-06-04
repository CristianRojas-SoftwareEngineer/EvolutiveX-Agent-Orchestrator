import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

vi.mock('../../scripting/post-hook-event.js', () => ({
  readStdinBuffer: vi.fn(),
  postHookEvent: vi.fn().mockResolvedValue(0),
}));

vi.mock('../../scripting/stop-work-summary-notification.js', () => ({
  runContinuityNotification: vi.fn().mockResolvedValue(0),
}));

import { readStdinBuffer, postHookEvent } from '../../scripting/post-hook-event.js';
import { runContinuityNotification } from '../../scripting/stop-work-summary-notification.js';
import { runStopHookUx } from '../../scripting/stop-hook-ux.js';

// Raíz esperada: stop-hook-ux.ts está en scripting/, un nivel bajo SCP root.
// Desde este test (tests/scripting/), subimos dos niveles para obtener la misma raíz.
const expectedScpRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('runStopHookUx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reenvía al proxy y pasa la raíz SCP derivada del script a runContinuityNotification', async () => {
    const payload = JSON.stringify({
      hook_event_name: 'Stop',
      last_assistant_message: 'Tests en verde.',
    });
    vi.mocked(readStdinBuffer).mockResolvedValue(Buffer.from(payload));

    const code = await runStopHookUx();

    expect(code).toBe(0);
    expect(postHookEvent).toHaveBeenCalledWith(Buffer.from(payload));
    expect(runContinuityNotification).toHaveBeenCalledWith(payload, expectedScpRoot);
  });

  it('pasa stdin vacío con la raíz SCP derivada del script', async () => {
    vi.mocked(readStdinBuffer).mockResolvedValue(Buffer.from(''));

    await runStopHookUx();

    expect(runContinuityNotification).toHaveBeenCalledWith('', expectedScpRoot);
  });

  it('la raíz SCP no depende de CLAUDE_PROJECT_DIR', async () => {
    const original = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = '/proyecto-ajeno';
    vi.mocked(readStdinBuffer).mockResolvedValue(Buffer.from('{}'));

    await runStopHookUx();

    const [, passedRoot] = vi.mocked(runContinuityNotification).mock.calls[0]!;
    expect(passedRoot).toBe(expectedScpRoot);
    expect(passedRoot).not.toBe('/proyecto-ajeno');

    if (original === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = original;
  });
});
