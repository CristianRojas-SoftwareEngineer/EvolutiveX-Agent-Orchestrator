import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';

const spawnMock = vi.fn();

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

describe('spawnDetachedPostHookEvent', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('lanza post-hook-event en proceso detached con stdin del body', async () => {
    const stdin = new Writable({
      write(_chunk, _enc, cb) {
        cb();
      },
    });
    const child = Object.assign(new EventEmitter(), {
      stdin,
      unref: vi.fn(),
    });
    spawnMock.mockReturnValue(child);

    const { spawnDetachedPostHookEvent } = await import(
      '../../scripting/detached-session-end-relay.js'
    );
    const repo = '/c/repos/scp';
    const body = Buffer.from('{"hook_event_name":"SessionEnd"}\n');

    spawnDetachedPostHookEvent(body, repo);

    expect(spawnMock).toHaveBeenCalledOnce();
    const [node, args, opts] = spawnMock.mock.calls[0] as [
      string,
      string[],
      { detached: boolean; stdio: string[]; windowsHide: boolean },
    ];
    expect(node).toBe(process.execPath);
    expect(args[0]).toContain('node_modules/tsx/dist/cli.mjs');
    expect(args[1]).toContain('scripting/post-hook-event.ts');
    expect(opts.detached).toBe(true);
    expect(opts.stdio).toEqual(['pipe', 'ignore', 'ignore']);
    expect(opts.windowsHide).toBe(true);
    expect(child.unref).toHaveBeenCalledOnce();
  });

  it('lanza error si stdin del hijo no está disponible', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdin: null,
      unref: vi.fn(),
    });
    spawnMock.mockReturnValue(child);

    const { spawnDetachedPostHookEvent } = await import(
      '../../scripting/detached-session-end-relay.js'
    );

    expect(() => spawnDetachedPostHookEvent(Buffer.from('{}'), '/c/repos/scp')).toThrow(
      /stdin del hijo detached no disponible/,
    );
  });
});
