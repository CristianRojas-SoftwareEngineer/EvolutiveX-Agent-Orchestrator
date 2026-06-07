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

/** Busca recursivamente archivos JSON con el nombre dado bajo un directorio. */
async function findJsonFiles(dir: string, filename: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name === filename) {
        results.push(full);
      }
    }
  }
  await walk(dir);
  return results;
}

/** Genera el payload SSE con 2 Agent tool_use blocks. */
function makeSseWith2Agents(): string {
  const events = [
    {
      type: 'message_start',
      message: {
        id: 'msg_p',
        type: 'message',
        usage: {
          input_tokens: 10,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'toolu_first_agent', name: 'Agent', input: {} },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'input_json_delta',
        partial_json: JSON.stringify({
          subagent_type: 'general-purpose',
          prompt: 'Task Alpha: analyze the code',
        }),
      },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'tool_use', id: 'toolu_second_agent', name: 'Agent', input: {} },
    },
    {
      type: 'content_block_delta',
      index: 1,
      delta: {
        type: 'input_json_delta',
        partial_json: JSON.stringify({
          subagent_type: 'Plan',
          prompt: 'Task Beta: plan the refactor',
        }),
      },
    },
    { type: 'content_block_stop', index: 1 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'tool_use', stop_sequence: null },
      usage: { output_tokens: 80 },
    },
    { type: 'message_stop' },
  ];
  return events.map((e) => `data: ${JSON.stringify(e)}`).join('\n\n') + '\n\n';
}

describe('Test E2E - Fallback FIFO para N pendings sin cabeceras de agente (plano B)', () => {
  let mockUpstream: http.Server;
  let upstreamPort: number;
  let proxyApp: FastifyInstance;
  let tempSessionsDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    let requestCount = 0;

    mockUpstream = http.createServer((_req, res) => {
      requestCount++;
      if (requestCount === 1) {
        // Primer request (padre): devuelve SSE con 2 Agent tool_use blocks
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.end(makeSseWith2Agents());
      } else {
        // Requests de subagente: respuesta JSON normal
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ id: 'msg_sub', type: 'message', content: [], stop_reason: 'end_turn' }),
        );
      }
    });

    await new Promise<void>((resolve) => {
      mockUpstream.listen(0, '127.0.0.1', () => {
        upstreamPort = (mockUpstream.address() as import('node:net').AddressInfo).port;
        resolve();
      });
    });

    originalEnv = { ...process.env };
    tempSessionsDir = path.join(os.tmpdir(), `scp-fifo-${Date.now()}`);
    process.env.UPSTREAM_ORIGIN = `http://127.0.0.1:${upstreamPort}`;

    const { vi } = await import('vitest');
    vi.resetModules();

    const { config } = await import('../../src/4-api/config/env.config.js');
    const { createProxyDependencies: createDeps } =
      await import('../../src/4-api/composition-root.js');
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

  it('sin cabeceras de agente + 2 pendings → subagente resuelve por FIFO (correlationMethod fifo-pending)', async () => {
    const sessionId = 'test-fifo-fallback';

    // Paso 1: request padre → SSE con 2 Agent tool_use → registra toolu_first_agent y toolu_second_agent
    const parentRes = await proxyApp.inject({
      method: 'POST',
      url: '/v1/messages',
      headers: {
        'x-cc-audit-session': sessionId,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        model: 'claude-3-5-sonnet',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Ejecuta dos tareas en paralelo' }] },
        ],
        tools: [
          {
            name: 'Agent',
            description: 'Crea subagente',
            input_schema: { type: 'object', properties: {} },
          },
        ],
        max_tokens: 4096,
      }),
    });

    expect(parentRes.statusCode).toBeGreaterThanOrEqual(200);
    expect(parentRes.statusCode).toBeLessThan(300);

    // Dar margen para que el handler SSE procese los eventos y registre los pendings
    await new Promise((r) => setTimeout(r, 200));

    // Paso 2: request de subagente sin cabeceras de agente y sin prompt que matchee
    // → joinToolUseToSubagent debe usar FIFO (toolu_first_agent)
    const subRes = await proxyApp.inject({
      method: 'POST',
      url: '/v1/messages',
      headers: {
        'x-cc-audit-session': sessionId,
        'content-type': 'application/json',
        // Sin X-Claude-Code-Agent-Id ni X-Claude-Code-Parent-Agent-Id → ruta legacy
      },
      payload: JSON.stringify({
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'prompt sin match' }] }],
        tools: [
          { name: 'Read', description: 'lee', input_schema: { type: 'object', properties: {} } },
        ],
        max_tokens: 256,
      }),
    });

    expect(subRes.statusCode).toBeGreaterThanOrEqual(200);
    expect(subRes.statusCode).toBeLessThan(300);

    // Esperar escritura en disco (state.json se escribe en handleSubagent de forma awaited)
    await new Promise((r) => setTimeout(r, 500));

    // Verificar que existe una sub-interacción con correlationMethod: 'fifo-pending'.
    // Se busca en meta.json porque state.json se elimina al cerrar la interacción.
    const sessionDir = path.join(path.dirname(tempSessionsDir), 'sessions', sessionId);
    const metaFiles = await findJsonFiles(sessionDir, 'meta.json');

    const metas = await Promise.all(
      metaFiles.map(async (f) => {
        const raw = await fs.readFile(f, 'utf8');
        return JSON.parse(raw) as Record<string, unknown>;
      }),
    );

    const fifoMeta = metas.find(
      (m) =>
        m.parentContext !== null &&
        typeof m.parentContext === 'object' &&
        (m.parentContext as Record<string, unknown>).correlationMethod === 'fifo-pending',
    );

    expect(fifoMeta).toBeDefined();
    const ctx = fifoMeta!.parentContext as Record<string, unknown>;
    expect(ctx.correlationStatus).toBe('resolved');
    expect(ctx.triggeringToolUseId).toBe('toolu_first_agent');
  });
});
