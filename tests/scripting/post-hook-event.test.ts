import { describe, it, expect, vi } from 'vitest';
import { postHookEvent, resolveHooksUrl } from '../../scripting/post-hook-event.js';
import {
  PROJECT_GATEWAY_HOOK_COMMAND,
  buildGatewayHookRelayCommand,
  isGatewayHookRelayCommand,
} from '../../scripting/shared/gateway-hook-command.js';

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

  it('sale 0 ante error de red (no bloquea Claude Code)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const code = await postHookEvent(Buffer.from('{}'), {
      baseUrl: 'http://127.0.0.1:8787',
      fetchImpl,
    });
    expect(code).toBe(0);
  });
});

describe('gateway-hook-command', () => {
  it('detecta relay tsx y curl legacy', () => {
    expect(isGatewayHookRelayCommand(PROJECT_GATEWAY_HOOK_COMMAND)).toBe(true);
    expect(
      isGatewayHookRelayCommand(
        "curl -sS -X POST $ANTHROPIC_BASE_URL/hooks -H 'Content-Type: application/json' --data-binary @-",
      ),
    ).toBe(true);
    expect(isGatewayHookRelayCommand('echo hi')).toBe(false);
  });

  it('genera comando con ruta absoluta POSIX', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const cmd = buildGatewayHookRelayCommand('C:\\Proxy');
    expect(cmd).toContain('post-hook-event.ts');
    expect(cmd).not.toContain('--data-binary');
  });
});
