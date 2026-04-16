/**
 * Punto de entrada para la aplicación Smart Code Proxy.
 * Arranca el servidor Fastify y comienza a escuchar peticiones.
 */
import process from 'process';
import { buildApp } from './app.js';
import { config } from './config/env.config.js';

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
        auditEnabled: config.AUDIT_ENABLED,
        auditSseRaw: config.AUDIT_SSE_RAW,
        auditSseResponseBody: config.AUDIT_SSE_RESPONSE_BODY,
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
    app.log.error(err);
    process.exit(1);
  }
}

start();
