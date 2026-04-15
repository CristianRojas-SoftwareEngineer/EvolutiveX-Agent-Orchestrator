import { FastifyInstance } from 'fastify';
import proxyPlugin from '@fastify/http-proxy';
import { ProxyController } from '../controllers/proxy.controller';
import { SessionService } from '../services/session.service';
import { AuditWriterService } from '../services/audit-writer.service';
import { RedactService } from '../services/redact.service';
import { ProxyEnvironmentConfig } from '../interfaces/config.interface';

/**
 * Objeto de configuración por defecto para el Proxy.
 * Resuelve los ajustes desde variables de entorno con valores seguros por defecto.
 */
const defaultConfig: ProxyEnvironmentConfig = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 8787,
  UPSTREAM_ORIGIN: process.env.UPSTREAM_ORIGIN || 'https://api.anthropic.com',
  AUDIT_SESSIONS_DIR: process.env.AUDIT_SESSIONS_DIR || 'sessions',
  MAX_BODY_LOG_BYTES: 2 * 1024 * 1024,
  MAX_RESPONSE_BUFFER_BYTES: 100 * 1024 * 1024,
  MAX_AUDIT_REQUEST_BODY_BYTES: 50 * 1024 * 1024,
  MAX_AUDIT_RESPONSE_BODY_BYTES: 50 * 1024 * 1024,
  MAX_AUDIT_SSE_RAW_BYTES: 50 * 1024 * 1024,
  
  LOG_SSE: process.env.LOG_SSE !== '0',
  AUDIT_ENABLED: process.env.AUDIT_ENABLED !== '0',
  AUDIT_SSE_RAW: process.env.AUDIT_SSE_RAW === '1',
  AUDIT_SSE_RESPONSE_BODY: process.env.AUDIT_SSE_RESPONSE_BODY === '1',
  AUDIT_SSE_RESPONSE_BODY_REQUIRE_RAW: process.env.AUDIT_SSE_RESPONSE_BODY_REQUIRE_RAW === '1',
  AUDIT_SSE_RESPONSE_BODY_FORCE_BETA: process.env.AUDIT_SSE_RESPONSE_BODY_FORCE_BETA === '1',
  
  AUDIT_SESSION_OVERRIDE_HEADER: process.env.AUDIT_SESSION_OVERRIDE_HEADER || 'x-cc-audit-session',
  AUDIT_SESSION_FALLBACK_HEADER: process.env.AUDIT_SESSION_FALLBACK_HEADER || 'x-claude-code-session-id',
  DEFAULT_AUDIT_SESSION: process.env.DEFAULT_AUDIT_SESSION || '',
  STRIP_AUDIT_SESSION_HEADER: process.env.STRIP_AUDIT_SESSION_HEADER !== '0',
  AUDIT_SESSION_HASH_SUFFIX: process.env.AUDIT_SESSION_HASH_SUFFIX === '1',
  
  UPSTREAM_ACCEPT_ENCODING: process.env.UPSTREAM_ACCEPT_ENCODING || 'identity',
};

/**
 * Plugin de Fastify para registrar las rutas del proxy.
 * Gestiona la inyección de dependencias para servicios y controladores.
 */
export async function proxyRoutes(fastify: FastifyInstance) {
  // Inyección de dependencias mediante cableado manual
  const redactService = new RedactService();
  const sessionService = new SessionService(defaultConfig, defaultConfig.AUDIT_SESSIONS_DIR);
  const auditWriterService = new AuditWriterService(redactService);
  const proxyController = new ProxyController(sessionService, auditWriterService, defaultConfig);

  /**
   * Inicializa el directorio raíz de auditoría al arrancar si está habilitada.
   */
  if (defaultConfig.AUDIT_ENABLED) {
    await sessionService.ensureAuditSessionsRoot().catch(err => {
      fastify.log.error(err, 'Error al inicializar la raíz de auditoría');
    });
  }

  /**
   * Hook: preHandler
   * - Negocia la compresión con el Upstream para asegurar transparencia en la auditoría.
   * - Dispara la lógica pre-proxy del controlador (resolución de sesión, captura de request).
   */
  fastify.addHook('preHandler', async (request: any, reply) => {
    // 1. Lógica para asegurar auditorías legibles eliminando Gzip del upstream si es posible
    const mode = defaultConfig.UPSTREAM_ACCEPT_ENCODING;
    if (mode !== 'pass') {
      delete request.headers['accept-encoding'];
      if (mode !== 'remove') {
        request.headers['accept-encoding'] = mode;
      }
    }

    // 2. Orquestar la sesión de auditoría y captura de petición
    await proxyController.preHandler(request, reply);
  });

  /**
   * Registra el plugin central de proxy.
   * Intercepta las respuestas mediante onResponseInterceptor para análisis profundo.
   */
  fastify.register(proxyPlugin, {
    upstream: defaultConfig.UPSTREAM_ORIGIN,
    replyOptions: {
      onResponse: proxyController.onResponseInterceptor.bind(proxyController)
    }
  });
}
