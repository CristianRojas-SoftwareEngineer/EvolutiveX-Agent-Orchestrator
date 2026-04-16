import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import proxyPlugin from '@fastify/http-proxy';
import { ProxyController } from '../controllers/proxy.controller';
import { SessionService } from '../services/session.service';
import { AuditWriterService } from '../services/audit-writer.service';
import { RedactService } from '../services/redact.service';
import { config } from '../config/env.config';

/**
 * Plugin de Fastify para registrar las rutas del proxy.
 * Gestiona la inyección de dependencias para servicios y controladores.
 */
export async function proxyRoutes(fastify: FastifyInstance) {
  // Inyección de dependencias mediante cableado manual
  const redactService = new RedactService();
  const sessionService = new SessionService(config, config.AUDIT_SESSIONS_DIR);
  const auditWriterService = new AuditWriterService(redactService);
  const proxyController = new ProxyController(sessionService, auditWriterService, config);

  /**
   * Inicializa el directorio raíz de auditoría al arrancar si está habilitada.
   */
  if (config.AUDIT_ENABLED) {
    await sessionService.ensureAuditSessionsRoot().catch((err) => {
      fastify.log.error(err, 'Error al inicializar la raíz de auditoría');
    });
  }

  /**
   * Hook: preHandler
   * - Negocia la compresión con el Upstream para asegurar transparencia en la auditoría.
   * - Dispara la lógica pre-proxy del controlador (resolución de sesión, captura de request).
   */
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Lógica para asegurar auditorías legibles eliminando Gzip del upstream si es posible
    const mode = config.UPSTREAM_ACCEPT_ENCODING;
    if (mode !== 'pass') {
      const headers = request.headers as Record<string, string | string[] | undefined>;
      delete headers['accept-encoding'];
      if (mode !== 'remove') {
        headers['accept-encoding'] = mode;
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
    upstream: config.UPSTREAM_ORIGIN,
    replyOptions: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onResponse: proxyController.onResponseInterceptor.bind(proxyController) as any,
    },
  });
}
