import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { FastifyInstance } from 'fastify';
import type { Logger } from '../../src/1-domain/types/logger.types.js';

const mockLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  trace: () => {},
  fatal: () => {},
  child: () => mockLogger,
  level: 'info',
  silent: false,
  bindings: () => ({}),
  flush: async () => {},
} as unknown as Logger;

describe('Test E2E - POST /hooks (borde hooks C3)', () => {
  let mockUpstream: http.Server;
  let upstreamPort: number;
  let proxyApp: FastifyInstance;
  let tempSessionsDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let deps: Awaited<ReturnType<typeof import('../../src/4-api/composition-root.js').createProxyDependencies>>;
  let upstreamHit: boolean;

  beforeAll(async () => {
    upstreamHit = false;
    mockUpstream = http.createServer((_req, res) => {
      upstreamHit = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'msg_test', type: 'message', content: [], stop_reason: 'end_turn' }));
    });

    await new Promise<void>((resolve) => {
      mockUpstream.listen(0, '127.0.0.1', () => {
        upstreamPort = (mockUpstream.address() as import('node:net').AddressInfo).port;
        resolve();
      });
    });

    originalEnv = { ...process.env };
    tempSessionsDir = path.join(os.tmpdir(), `scp-hooks-e2e-${Date.now()}`);
    process.env.UPSTREAM_ORIGIN = `http://127.0.0.1:${upstreamPort}`;

    vi.resetModules();

    const { config } = await import('../../src/4-api/config/env.config.js');
    const { createProxyDependencies: createDeps } = await import('../../src/4-api/composition-root.js');
    deps = await createDeps(config, mockLogger, tempSessionsDir);
    proxyApp = (await import('../../src/app.js')).buildApp(deps, mockLogger);
    await proxyApp.ready();
  });

  afterAll(async () => {
    await proxyApp.close();
    mockUpstream.close();
    process.env = { ...originalEnv };
    await fs.rm(tempSessionsDir, { recursive: true, force: true });
  });

  it('SubagentStart → respuesta 2xx y handler despachado', async () => {
    const executeSpy = vi.spyOn(deps.hookEventHandler, 'execute');

    const payload = JSON.stringify({
      hook_event_name: 'SubagentStart',
      session_id: 'session-hook-test',
      agent_id: 'agent-child-hook',
      tool_use_id: 'tu-hook-001',
    });

    const res = await proxyApp.inject({
      method: 'POST',
      url: '/hooks',
      headers: { 'content-type': 'application/json' },
      payload,
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(200);
    expect(res.statusCode).toBeLessThan(300);

    // Dar margen para que el procesamiento async termine
    await new Promise((r) => setTimeout(r, 50));

    expect(executeSpy).toHaveBeenCalledOnce();
    expect(executeSpy.mock.calls[0][0].eventName).toBe('SubagentStart');
    expect(executeSpy.mock.calls[0][0].agentId).toBe('agent-child-hook');

    executeSpy.mockRestore();
  });

  it('POST /hooks no llega al upstream', async () => {
    upstreamHit = false;

    const payload = JSON.stringify({
      hook_event_name: 'Stop',
      session_id: 'session-stop-test',
      stop_hook_active: true,
    });

    await proxyApp.inject({
      method: 'POST',
      url: '/hooks',
      headers: { 'content-type': 'application/json' },
      payload,
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(upstreamHit).toBe(false);
  });
});
