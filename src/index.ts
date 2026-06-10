/**
 * Punto de entrada para la aplicación Smart Code Proxy.
 * Arranca el servidor Fastify y comienza a escuchar peticiones.
 */
import process from 'process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import pino from 'pino';
import pinoPretty from 'pino-pretty';
import { buildApp } from './app.js';
import { config } from './4-api/config/env.config.js';
import { createProxyDependencies } from './4-api/composition-root.js';

/**
 * Inicializa y arranca el servidor proxy.
 */
async function start() {
  // Ruta de logs sobreescribible por entorno (LOG_FILE) para aislar instancias de test
  const logFilePath = process.env.LOG_FILE?.trim() || './server/logs.jsonl';

  // Crear directorio de logs si no existe
  const logsDir = path.dirname(logFilePath);
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Crear stream de archivo para logs JSON crudos
  const logFile = fs.createWriteStream(logFilePath, { flags: 'a' });

  // Crear logger Pino con dual-transport: terminal (formateada) + archivo (JSON crudo)
  const logger = pino(
    {
      level: config.LOG_LEVEL,
    },
    pino.multistream([
      {
        stream: pinoPretty({ colorize: true, translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' }),
      },
      { stream: logFile },
    ]),
  );

  // Directorio de auditoría sobreescribible por entorno (AUDIT_BASE_DIR) para aislar tests.
  // Debe terminar en "sessions": SessionPersistence resuelve rutas relativas "sessions/..."
  // contra el directorio padre.
  const auditBaseDir = process.env.AUDIT_BASE_DIR?.trim() || undefined;
  const deps = auditBaseDir
    ? await createProxyDependencies(config, logger, path.resolve(auditBaseDir))
    : await createProxyDependencies(config, logger);
  const app = buildApp(deps, logger);
  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    logger.info(
      {
        event: 'listening',
        port: config.PORT,
        upstream: config.UPSTREAM_ORIGIN,
        upstreamAcceptEncoding: 'identity',
        maxAuditBytes: config.MAX_AUDIT_BYTES,
        maxResponseBufferBytes: config.MAX_RESPONSE_BUFFER_BYTES,
        logLevel: config.LOG_LEVEL,
      },
      'Proxy levantado correctamente',
    );
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

start();
