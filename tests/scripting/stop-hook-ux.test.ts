import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../scripting/post-hook-event.js', () => ({
  readStdinBuffer: vi.fn(),
  postHookEvent: vi.fn().mockResolvedValue(0),
}));

vi.mock('../../scripting/stop-work-summary-notification.js', () => ({
  notifyStopTurnFinished: vi.fn().mockResolvedValue(undefined),
  runStopWorkSummaryNotification: vi.fn().mockResolvedValue(0),
}));

import { readStdinBuffer, postHookEvent } from '../../scripting/post-hook-event.js';
import {
  notifyStopTurnFinished,
  runStopWorkSummaryNotification,
} from '../../scripting/stop-work-summary-notification.js';
import { runStopHookUx } from '../../scripting/stop-hook-ux.js';

describe('runStopHookUx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reenvía al proxy y dispara fin de turno + resumen', async () => {
    const payload = JSON.stringify({
      hook_event_name: 'Stop',
      last_assistant_message: 'Tests en verde.',
    });
    vi.mocked(readStdinBuffer).mockResolvedValue(Buffer.from(payload));

    const code = await runStopHookUx();

    expect(code).toBe(0);
    expect(postHookEvent).toHaveBeenCalledWith(Buffer.from(payload));
    expect(notifyStopTurnFinished).toHaveBeenCalled();
    expect(runStopWorkSummaryNotification).toHaveBeenCalledWith(payload);
  });

  it('omite resumen si stdin está vacío pero envía fin de turno', async () => {
    vi.mocked(readStdinBuffer).mockResolvedValue(Buffer.from(''));

    await runStopHookUx();

    expect(notifyStopTurnFinished).toHaveBeenCalled();
    expect(runStopWorkSummaryNotification).not.toHaveBeenCalled();
  });
});
