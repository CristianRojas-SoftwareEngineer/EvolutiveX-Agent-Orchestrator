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

describe('Test de Integración - Decompresión Gzip', () => {
  let mockUpstream: http.Server;
  let upstreamPort: number;
  let proxyApp: FastifyInstance;
  let tempSessionsDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    // 1. Levantar servidor Upstream falso que siempre devuelve Gzip
    mockUpstream = http.createServer((req, res) => {
      const plaintext = JSON.stringify({ message: 'Hola desde upstream comprimido' });
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
    process.env.UPSTREAM_ACCEPT_ENCODING = 'gzip'; // Forzamos al proxy a pedir gzip
    process.env.DEFAULT_AUDIT_SESSION = 'test-gzip';

    // Reload conf
    const { vi } = await import('vitest');
    vi.resetModules();

    // 3. Levantar la aplicación proxy en memoria, inyectando tempSessionsDir
    //    como base directory de auditoría (DI del composition-root).
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

  it('debería descomprimir el payload del upstream y quitar headers de compresión hacia el cliente', async () => {
    // Inject ejecuta el handler en memoria saltándose sockets,
    // ideal para tests rápidos con Fastify.
    // Usamos un body con tools para que se clasifique como agentic-turn (no preflight)
    const requestBody = JSON.stringify({
      model: 'claude-3-5-sonnet',
      messages: [{ role: 'user', content: 'test' }],
      tools: [{ name: 'Read', description: 'lee', input_schema: { type: 'object', properties: {} } }],
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

    // Assert 2: El cliente recibe texto plano puro, equivalente a la descompresión.
    expect(res.body).toEqual(JSON.stringify({ message: 'Hola desde upstream comprimido' }));

    // Assert 3: Las grabaciones de auditoría (disco) están también descomprimidas.
    // Damos un pequeño margen para que el stream en background termine de volcar al disco
    await new Promise((r) => setTimeout(r, 500));

    const dirs = await fs.readdir(path.join(tempSessionsDir, 'test-gzip', 'interactions'));
    const requestDirName = dirs[0];
    const sessionPath = path.join(tempSessionsDir, 'test-gzip', 'interactions', requestDirName);

    const responseBodyPath = path.join(sessionPath, 'response', 'body.json');
    // Retry con backoff para robustez en CI/sistemas lentos
    let content: string | null = null;
    for (let i = 0; i < 5; i++) {
      try {
        content = await fs.readFile(responseBodyPath, 'utf8');
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    if (content === null) {
      throw new Error(`No se pudo leer ${responseBodyPath} después de reintentos`);
    }

    // Assert 4: El file volcado es texto json válido formateado en formato multi-step
    const parsed = JSON.parse(content);
    expect(parsed.type).toBe('multi-step-response');
    expect(parsed.stepCount).toBeGreaterThanOrEqual(1);
    expect(parsed.steps).toBeInstanceOf(Array);
    expect(parsed.steps[0]).toHaveProperty('message', 'Hola desde upstream comprimido');
  });
});
