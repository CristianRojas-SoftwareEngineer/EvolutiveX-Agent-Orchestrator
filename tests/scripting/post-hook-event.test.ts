import { describe, it, expect, vi } from 'vitest';
import { postHookEvent, resolveHooksUrl } from '../../scripting/post-hook-event.js';

describe('resolveHooksUrl', () => {
  it('normaliza base y añade /hooks', () => {
    expect(resolveHooksUrl('http://127.0.0.1:8787/')).toBe('http://127.0.0.1:8787/hooks');
    expect(resolveHooksUrl('http://proxy')).toBe('http://proxy/hooks');
  });
});

describe('postHookEvent', () => {
  it('envía POST con el cuerpo de stdin', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    const body = Buffer.from('{"hook_event_name":"Stop"}');
    const code = await postHookEvent(body, {
      baseUrl: 'http://127.0.0.1:8787',
      fetchImpl,
    });
    expect(code).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:8787/hooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body.toString('utf-8'),
    });
  });

  it('sale 1 ante error de red (visible en transcript de Claude Code)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const code = await postHookEvent(Buffer.from('{}'), {
      baseUrl: 'http://127.0.0.1:8787',
      fetchImpl,
    });
    expect(code).toBe(1);
  });
});

