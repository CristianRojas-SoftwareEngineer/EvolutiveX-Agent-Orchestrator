import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import proxyPlugin from '@fastify/http-proxy';
import type { ProxyDependencies } from '../../4-api/composition-root.js';
import { ProxyController } from './proxy.controller.js';

/**
 * Plugin de Fastify para registrar las rutas del proxy.
 * Recibe dependencias inyectadas desde app.ts via FastifyPluginOptions.
 * NO importa directamente de Capa 3, 2 ni 1.
 */
export async function proxyRoutes(fastify: FastifyInstance, opts: { deps: ProxyDependencies }) {
  const { deps } = opts;
  const proxyController = new ProxyController(deps);

  /**
   * Hook: preHandler
   * - Negocia la compresión con el Upstream para asegurar transparencia en la auditoría.
   * - Opcionalmente remueve el flag de redacción de thinking para capturar contenido legible.
   * - Dispara la lógica pre-proxy del controlador (resolución de sesión, captura de request).
   */
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const headers = request.headers as Record<string, string | string[] | undefined>;

    // 1. Lógica para asegurar auditorías legibles eliminando Gzip del upstream si es posible
    const mode = deps.config.UPSTREAM_ACCEPT_ENCODING;
    if (mode !== 'pass') {
      delete headers['accept-encoding'];
      if (mode !== 'remove') {
        headers['accept-encoding'] = mode;
      }
    }

    // 2. Opcional: remover flag de redacción de thinking para capturar contenido legible
    if (deps.config.PROXY_UNREDACT_THINKING) {
      const betaHeader = headers['anthropic-beta'];
      if (typeof betaHeader === 'string' && betaHeader.includes('redact-thinking-2026-02-12')) {
        const newBeta = betaHeader
          .split(',')
          .map(s => s.trim())
          .filter(s => s !== 'redact-thinking-2026-02-12')
          .join(', ');
        headers['anthropic-beta'] = newBeta;
        request.log.info({ original: betaHeader, modified: newBeta }, 'Unredacted thinking header');
      }
    }

    // 3. Orquestar la sesión de auditoría y captura de petición
    await proxyController.preHandler(request, reply);
    if (reply.sent) return;
  });

  /**
   * Registra el plugin central de proxy.
   * Intercepta las respuestas mediante onResponseInterceptor para análisis profundo.
   * Captura errores de conexión upstream (DNS, connection refused) mediante onError.
   */
  fastify.register(proxyPlugin, {
    upstream: deps.config.UPSTREAM_ORIGIN,
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
