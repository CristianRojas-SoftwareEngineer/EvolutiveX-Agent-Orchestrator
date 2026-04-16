/**
 * Punto de entrada para la aplicación Smart Code Proxy.
 * Arranca el servidor Fastify y comienza a escuchar peticiones.
 */
import process from 'process';
import { buildApp } from './app';
import { config } from './config/env.config';

/**
 * Inicializa y arranca el servidor proxy.
 */
async function start() {
  const app = buildApp();
  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    app.log.info(
      {
        event: 'listening',
        port: config.PORT,
        sessionsDir: config.AUDIT_SESSIONS_DIR,
        upstream: config.UPSTREAM_ORIGIN,
        upstreamAcceptEncoding: config.UPSTREAM_ACCEPT_ENCODING,
      },
      'Proxy levantado correctamente',
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
