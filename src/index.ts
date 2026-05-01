/**
 * Punto de entrada para la aplicación Smart Code Proxy.
 * Arranca el servidor Fastify y comienza a escuchar peticiones.
 */
import process from 'process';
import * as fs from 'node:fs';
import pino from 'pino';
import pinoPretty from 'pino-pretty';
import { buildApp } from './app.js';
import { config } from './4-api/config/env.config.js';
import { createProxyDependencies } from './4-api/composition-root.js';

/**
 * Inicializa y arranca el servidor proxy.
 */
async function start() {
  // Crear directorio de logs si no existe
  const logsDir = './logs';
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Crear stream de archivo para logs JSON crudos
  const logFile = fs.createWriteStream('./logs/proxy.log', { flags: 'a' });

  // Crear logger Pino con dual-transport: terminal (formateada) + archivo (JSON crudo)
  const logger = pino(
    {
      level: process.env.LOG_LEVEL || 'info',
    },
    pino.multistream([
      { stream: pinoPretty({ colorize: true, translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' }) },
      { stream: logFile },
    ])
  );

  const deps = await createProxyDependencies(config, logger);
  const app = buildApp(deps, logger);
  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    logger.info(
      {
        event: 'listening',
        port: config.PORT,
        upstream: config.UPSTREAM_ORIGIN,
        upstreamAcceptEncoding: config.UPSTREAM_ACCEPT_ENCODING,
        maxResponseBufferBytes: config.MAX_RESPONSE_BUFFER_BYTES,
        maxAuditRequestBodyBytes: config.MAX_AUDIT_REQUEST_BODY_BYTES,
        maxAuditResponseBodyBytes: config.MAX_AUDIT_RESPONSE_BODY_BYTES,
        maxAuditSseRawBytes: Number.isFinite(config.MAX_AUDIT_SSE_RAW_BYTES)
          ? config.MAX_AUDIT_SSE_RAW_BYTES
          : 'unlimited',
        stripAuditSessionHeader: config.STRIP_AUDIT_SESSION_HEADER,
        auditSessionHashSuffix: config.AUDIT_SESSION_HASH_SUFFIX,
      },
      'Proxy levantado correctamente',
    );
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

start();
