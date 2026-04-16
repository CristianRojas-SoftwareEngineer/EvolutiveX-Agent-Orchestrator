import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import proxyPlugin from '@fastify/http-proxy';
import { ProxyController } from '../controllers/proxy.controller.js';
import { SessionService } from '../services/session.service.js';
import { AuditWriterService } from '../services/audit-writer.service.js';
import { RedactService } from '../services/redact.service.js';
import { MarkdownRendererService } from '../services/markdown-renderer.service.js';
import { SseReconstructService } from '../services/sse-reconstruct.service.js';
import { config } from '../config/env.config.js';

/**
 * Plugin de Fastify para registrar las rutas del proxy.
 * Gestiona la inyección de dependencias para servicios y controladores.
 */
export async function proxyRoutes(fastify: FastifyInstance) {
  // Inyección de dependencias mediante cableado manual
  const redactService = new RedactService();
  const markdownRendererService = new MarkdownRendererService();
  const sessionService = new SessionService(config, config.AUDIT_SESSIONS_DIR);
  const auditWriterService = new AuditWriterService(redactService, markdownRendererService);
  const sseReconstructService = new SseReconstructService(
    auditWriterService,
    markdownRendererService,
    config.AUDIT_SSE_REPLAY_MODEL,
  );
  const proxyController = new ProxyController(
    sessionService,
    auditWriterService,
    sseReconstructService,
    config,
  );

  /**
   * Inicializa el directorio raíz de auditoría al arrancar si está habilitada.
   * Un fallo aquí es fatal y detiene el servidor (Fase 8.4).
   */
  if (config.AUDIT_ENABLED) {
    await sessionService.ensureAuditSessionsRoot();
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
   * Captura errores de conexión upstream (DNS, connection refused) mediante onError.
   */
  fastify.register(proxyPlugin, {
    upstream: config.UPSTREAM_ORIGIN,
    xfwd: true,
    replyOptions: {
      onResponse: proxyController.onResponseInterceptor.bind(proxyController),
      onError: (reply: FastifyReply, error: Error & { code?: string }) => {
        const request = reply.request;
        proxyController
          .onUpstreamError(request, reply, error)
          .catch((e) => request.log.error(e, 'Error en onUpstreamError'));
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}
