import fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { proxyRoutes } from './5-user-interfaces/http/proxy.routes.js';
import type { ProxyDependencies } from './4-api/composition-root.js';

/**
 * Función factory para construir y configurar la instancia de la aplicación Fastify.
 * Configura el parsing del cuerpo, el logueo y registra las rutas del sistema.
 */
export function buildApp(deps: ProxyDependencies) {
  const app = fastify({
    logger: true,
    genReqId: () => randomUUID(),
  });

  /**
   * Configura el límite global de cuerpo para el parsing de buffer crudo.
   * Esto es esencial para que el proxy gestione payloads binarios grandes.
   */
  const bodyLimitRaw = deps.config.MAX_REQUEST_BODY;
  const bodyLimit = bodyLimitRaw.toLowerCase().endsWith('mb')
    ? parseInt(bodyLimitRaw) * 1024 * 1024
    : 50 * 1024 * 1024;

  /**
   * Elimina los parsers por defecto y añade un parser de buffer catch-all.
   * Esto permite que el proxy intercepte cualquier tipo de contenido como un Buffer.
   */
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit }, function (_req, body, done) {
    done(null, body);
  });

  // Endpoint de salud para monitoreo
  app.get('/health', async (_request, _reply) => {
    return { status: 'OK' };
  });

  // Registrar las rutas principales de orquestación del proxy con deps inyectadas
  app.register(proxyRoutes, { deps });

  return app;
}
