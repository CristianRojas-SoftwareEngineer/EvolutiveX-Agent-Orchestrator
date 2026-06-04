import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('runStopHookUx', () => {
  const originalEnv = process.env.CLAUDE_PROJECT_DIR;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CLAUDE_PROJECT_DIR = '/proyecto-test';
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CLAUDE_PROJECT_DIR;
    } else {
      process.env.CLAUDE_PROJECT_DIR = originalEnv;
    }
  });

  it('reenvía al proxy y delega en runContinuityNotification', async () => {
    const payload = JSON.stringify({
      hook_event_name: 'Stop',
      last_assistant_message: 'Tests en verde.',
    });
    vi.mocked(readStdinBuffer).mockResolvedValue(Buffer.from(payload));

    const code = await runStopHookUx();

    expect(code).toBe(0);
    expect(postHookEvent).toHaveBeenCalledWith(Buffer.from(payload));
    expect(runContinuityNotification).toHaveBeenCalledWith(payload, '/proyecto-test');
  });

  it('pasa stdin vacío y CLAUDE_PROJECT_DIR a runContinuityNotification', async () => {
    vi.mocked(readStdinBuffer).mockResolvedValue(Buffer.from(''));

    await runStopHookUx();

    expect(runContinuityNotification).toHaveBeenCalledWith('', '/proyecto-test');
  });

  it('usa cadena vacía como projectDir si CLAUDE_PROJECT_DIR no está definido', async () => {
    delete process.env.CLAUDE_PROJECT_DIR;
    vi.mocked(readStdinBuffer).mockResolvedValue(Buffer.from('{}'));

    await runStopHookUx();

    expect(runContinuityNotification).toHaveBeenCalledWith('{}', '');
  });
});
