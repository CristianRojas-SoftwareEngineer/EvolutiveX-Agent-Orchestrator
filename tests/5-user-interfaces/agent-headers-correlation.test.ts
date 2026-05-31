import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

describe('Test E2E - Correlación por cabeceras de agente (plano A)', () => {
  let mockUpstream: http.Server;
  let upstreamPort: number;
  let proxyApp: FastifyInstance;
  let tempSessionsDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    mockUpstream = http.createServer((_req, res) => {
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
    tempSessionsDir = path.join(os.tmpdir(), `scp-agent-headers-${Date.now()}`);
    process.env.UPSTREAM_ORIGIN = `http://127.0.0.1:${upstreamPort}`;

    const { vi } = await import('vitest');
    vi.resetModules();

    const { config } = await import('../../src/4-api/config/env.config.js');
    const { createProxyDependencies: createDeps } = await import('../../src/4-api/composition-root.js');
    const deps = await createDeps(config, mockLogger, tempSessionsDir);
    proxyApp = (await import('../../src/app.js')).buildApp(deps, mockLogger);
    await proxyApp.ready();
  });

  afterAll(async () => {
    await proxyApp.close();
    mockUpstream.close();
    process.env = { ...originalEnv };
    await fs.rm(tempSessionsDir, { recursive: true, force: true });
  });

  it('request con cabeceras de agente no rompe el flujo y crea la sesión en disco', async () => {
    const requestBody = JSON.stringify({
      model: 'claude-3-5-sonnet',
      messages: [{ role: 'user', content: 'hola desde subagente' }],
      tools: [
        { name: 'Read', description: 'lee', input_schema: { type: 'object', properties: {} } },
      ],
      max_tokens: 256,
    });

    const res = await proxyApp.inject({
      method: 'POST',
      url: '/v1/messages',
      headers: {
        'x-cc-audit-session': 'test-agent-headers',
        'content-type': 'application/json',
        'X-Claude-Code-Agent-Id': 'agent-sub-01',
        'X-Claude-Code-Parent-Agent-Id': 'agent-root-01',
      },
      payload: requestBody,
    });

    // El flujo no se rompe — respuesta 2xx
    expect(res.statusCode).toBeGreaterThanOrEqual(200);
    expect(res.statusCode).toBeLessThan(300);

    // Dar margen para escritura en disco
    await new Promise((r) => setTimeout(r, 500));

    // La sesión debe haberse creado en disco
    const sessionDir = path.join(path.dirname(tempSessionsDir), 'sessions', 'test-agent-headers');
    let sessionExists: boolean;
    try {
      await fs.access(sessionDir);
      sessionExists = true;
    } catch {
      sessionExists = false;
    }
    expect(sessionExists).toBe(true);
  });
});
