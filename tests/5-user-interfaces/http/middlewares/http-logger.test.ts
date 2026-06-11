import { describe, it, expect } from 'vitest';
import fastify from 'fastify';
import pino from 'pino';
import { Writable } from 'node:stream';
import {
  createHttpOnRequestHook,
  createHttpPreValidationHook,
  createHttpOnResponseHook,
  type HttpLoggerConfig,
} from '../../../../src/5-user-interfaces/http/middlewares/http-logger.js';

interface LogLine {
  reqId: string;
  method: string;
  url: string;
  level?: number;
  msg?: string;
  headers?: Record<string, unknown>;
  body?: string;
  bodyLength?: number;
  bodyPreview?: string;
  statusCode?: number;
  responseTime?: number;
}

/** Crea una app Fastify de test con los hooks de http-logger registrados y dos rutas dummy. */
function createTestApp(cfg: HttpLoggerConfig) {
  const lines: string[] = [];

  const writable = new Writable({
    write(chunk: Buffer, _encoding: string, callback: () => void) {
      lines.push(chunk.toString());
      callback();
    },
  });

  const loggerInstance = pino({ level: 'trace' }, writable);

  const app = fastify({
    loggerInstance,
    genReqId: () => 'test-req-id',
  });

  // Mismo patrón que app.ts: hooks registrados directamente con addHook
  app.addHook('onRequest', createHttpOnRequestHook(cfg));
  app.addHook('preValidation', createHttpPreValidationHook(cfg));
  app.addHook('onResponse', createHttpOnResponseHook(cfg));

  // Buffer catch-all parser (same as app.ts) para que request.body sea Buffer
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: 50 * 1024 * 1024 }, (_req, body, done) => {
    done(null, body);
  });

  // Ruta POST que devuelve el body tal cual
  app.post('/echo', async (req) => req.body);

  // Ruta GET que devuelve 'ok'
  app.get('/echo', async () => 'ok');

  const parsed = (): LogLine[] =>
    lines
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l) as LogLine);

  return { app, parsed, lines };
}

describe('httpLoggerPlugin hooks', () => {
  describe('onRequest hook', () => {
    it('logHeaders=true, logBodies=false → request log tiene headers y NO body', async () => {
      const { app, parsed } = createTestApp({
        logBodies: false,
        logHeaders: true,
        level: 'info',
      });

      await app.inject({
        method: 'POST',
        url: '/echo',
        headers: { 'x-custom': 'abc' },
        payload: JSON.stringify({ foo: 'bar' }),
      });

      await new Promise((r) => setTimeout(r, 20));
      await app.close();

      const incoming = parsed().find((p) => p.msg === '→ incoming request');
      expect(incoming).toBeDefined();
      expect(incoming!.reqId).toBe('test-req-id');
      expect(incoming!.method).toBe('POST');
      expect(incoming!.url).toBe('/echo');
      expect(incoming!.headers).toBeDefined();
      expect((incoming!.headers as Record<string, unknown>)['x-custom']).toBe('abc');
      expect(incoming!.body).toBeUndefined();
    });

    it('logBodies=true con content-type JSON → body como string UTF-8', async () => {
      const { app, parsed } = createTestApp({
        logBodies: true,
        logHeaders: false,
        level: 'info',
      });

      const payload = JSON.stringify({ foo: 'bar' });
      await app.inject({
        method: 'POST',
        url: '/echo',
        headers: { 'content-type': 'application/json' },
        payload,
      });

      await new Promise((r) => setTimeout(r, 20));
      await app.close();

      const incoming = parsed().find((p) => p.msg === '→ incoming request body');
      expect(incoming).toBeDefined();
      expect(incoming!.body).toBe(payload);
      expect(incoming!.bodyLength).toBe(payload.length); // bodyLength incluido según spec de serializeBody
    });

    it('content-type binario → bodyLength + bodyPreview, sin body', async () => {
      const { app, parsed } = createTestApp({
        logBodies: true,
        logHeaders: false,
        level: 'info',
      });

      const binaryPayload = Buffer.from([0x00, 0x01, 0xff, 0xfe]);
      await app.inject({
        method: 'POST',
        url: '/echo',
        headers: { 'content-type': 'application/octet-stream' },
        payload: binaryPayload,
      });

      await new Promise((r) => setTimeout(r, 20));
      await app.close();

      const incoming = parsed().find((p) => p.msg === '→ incoming request body');
      expect(incoming).toBeDefined();
      expect(incoming!.body).toBeUndefined();
      expect(incoming!.bodyLength).toBe(4);
      expect(typeof incoming!.bodyPreview).toBe('string');
      expect(incoming!.bodyPreview?.length).toBeGreaterThan(0);
    });
  });

  describe('onResponse hook', () => {
    it('response log tiene statusCode y responseTime', async () => {
      const { app, parsed } = createTestApp({
        logBodies: false,
        logHeaders: false,
        level: 'info',
      });

      await app.inject({ method: 'GET', url: '/echo' });

      await new Promise((r) => setTimeout(r, 20));
      await app.close();

      const sent = parsed().find((p) => p.msg === '← response sent');
      expect(sent).toBeDefined();
      expect(sent!.statusCode).toBe(200);
      expect(typeof sent!.responseTime).toBe('number');
      expect(sent!.responseTime).toBeGreaterThanOrEqual(0);
      expect(sent!.reqId).toBe('test-req-id');
    });

    it('level=debug emite a nivel 20 (Pino debug)', async () => {
      const { app, parsed } = createTestApp({
        logBodies: false,
        logHeaders: false,
        level: 'debug',
      });

      await app.inject({ method: 'GET', url: '/echo' });

      await new Promise((r) => setTimeout(r, 20));
      await app.close();

      const incoming = parsed().find((p) => p.msg === '→ incoming request');
      expect(incoming).toBeDefined();
      expect(incoming!.level).toBe(20); // Pino debug level
    });

    it('logHeaders=true → response log incluye headers de respuesta', async () => {
      const { app, parsed } = createTestApp({
        logBodies: false,
        logHeaders: true,
        level: 'info',
      });

      await app.inject({ method: 'GET', url: '/echo' });

      await new Promise((r) => setTimeout(r, 20));
      await app.close();

      const sent = parsed().find((p) => p.msg === '← response sent');
      expect(sent).toBeDefined();
      expect(sent!.headers).toBeDefined();
      expect((sent!.headers as Record<string, unknown>)['content-type']).toBeDefined();
    });
  });
});