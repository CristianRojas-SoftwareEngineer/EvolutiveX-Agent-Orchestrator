import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import * as zlib from 'node:zlib';
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

// El objetivo central es probar que la Fase 1 funciona:
// proxy.controller.ts intercepta el GZIP y lo descomprime correctamente
// de forma transparente para el cliente y para la auditoría local.

/** Busca recursivamente archivos con el nombre dado bajo un directorio. */
async function findFilesNamed(dir: string, filename: string): Promise<string[]> {
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
      if (entry.isDirectory()) await walk(full);
      else if (entry.name === filename) results.push(full);
    }
  }
  await walk(dir);
  return results;
}

describe('Test de Integración - Decompresión Gzip', () => {
  let mockUpstream: http.Server;
  let upstreamPort: number;
  let proxyApp: FastifyInstance;
  let tempSessionsDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let sessionPersistence: { flush: () => Promise<void> };

  beforeAll(async () => {
    // 1. Levantar servidor Upstream falso que siempre devuelve Gzip
    mockUpstream = http.createServer((req, res) => {
      const plaintext = JSON.stringify({
        message: 'Hola desde upstream comprimido',
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Hola desde upstream comprimido' }],
      });
      const compressed = zlib.gzipSync(Buffer.from(plaintext, 'utf8'));

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        'Content-Length': compressed.length.toString(),
      });
      res.end(compressed);
    });

    await new Promise<void>((resolve) => {
      mockUpstream.listen(0, '127.0.0.1', () => {
        upstreamPort = (mockUpstream.address() as import('node:net').AddressInfo).port;
        resolve();
      });
    });

    // 2. Configurar entorno para el proxy
    originalEnv = { ...process.env };
    tempSessionsDir = path.join(os.tmpdir(), `scp-gzip-${Date.now()}`);

    process.env.UPSTREAM_ORIGIN = `http://127.0.0.1:${upstreamPort}`;

    // Reload conf
    const { vi } = await import('vitest');
    vi.resetModules();

    // 3. Levantar la aplicación proxy en memoria, inyectando tempSessionsDir
    //    como base directory de auditoría (DI del composition-root).
    const { config } = await import('../../src/4-api/config/env.config.js');
    const { createProxyDependencies: createDeps } =
      await import('../../src/4-api/composition-root.js');
    const deps = await createDeps(config, mockLogger, tempSessionsDir);
    sessionPersistence = deps.sessionPersistence;
    proxyApp = (await import('../../src/app.js')).buildApp(deps, mockLogger);
    await proxyApp.ready();
  });

  afterAll(async () => {
    await proxyApp.close();
    mockUpstream.close();
    process.env = { ...originalEnv };
    await fs.rm(tempSessionsDir, { recursive: true, force: true });
  });

  it('debería descomprimir el payload del upstream y quitar headers de compresión hacia el cliente', async () => {
    // Inject ejecuta el handler en memoria saltándose sockets,
    // ideal para tests rápidos con Fastify.
    // Usamos un body con tools para que se clasifique como agentic (no preflight)
    const requestBody = JSON.stringify({
      model: 'claude-3-5-sonnet',
      messages: [{ role: 'user', content: 'test' }],
      tools: [
        { name: 'Read', description: 'lee', input_schema: { type: 'object', properties: {} } },
      ],
      max_tokens: 4096,
    });
    const res = await proxyApp.inject({
      method: 'POST',
      url: '/v1/messages',
      headers: {
        'x-cc-audit-session': 'test-gzip',
        'content-type': 'application/json',
      },
      payload: requestBody,
    });

    // Assert 1: Fastify remueve el `content-encoding` transparente al cliente.
    expect(res.headers['content-encoding']).toBeUndefined();
    // Y remueve `content-length` porque fue descomprimido
    expect(res.headers['content-length']).toBeUndefined();

    // Assert 2: El cliente recibe JSON descomprimido (mismo payload que el upstream).
    const clientBody = JSON.parse(res.body) as { message?: string };
    expect(clientBody.message).toBe('Hola desde upstream comprimido');

    // Assert 3: Las grabaciones de auditoría (disco) están también descomprimidas.
    await new Promise((r) => setTimeout(r, 300));
    await sessionPersistence.flush();

    const sessionRoot = path.join(tempSessionsDir, 'test-gzip');
    const bodyPaths = (await findFilesNamed(sessionRoot, 'body.json')).filter((p) =>
      p.includes(`${path.sep}response${path.sep}`),
    );
    expect(bodyPaths.length).toBeGreaterThanOrEqual(1);
    const content = await fs.readFile(bodyPaths[0], 'utf8');

    // Assert 4: SessionPersistence proyectó el body de respuesta en layout causal-workflows-v1
    const parsed = JSON.parse(content) as { message?: string };
    expect(parsed.message).toBe('Hola desde upstream comprimido');
  });
});
