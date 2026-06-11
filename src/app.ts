import fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { proxyRoutes } from './5-user-interfaces/http/proxy.routes.js';
import { HooksController } from './5-user-interfaces/http/hooks.controller.js';
import { createHttpOnRequestHook, createHttpPreValidationHook, createHttpOnResponseHook } from './5-user-interfaces/http/middlewares/http-logger.js';
import type { ProxyDependencies } from './4-api/composition-root.js';
import type { Logger } from './1-domain/types/logger.types.js';

/**
 * Función factory para construir y configurar la instancia de la aplicación Fastify.
 * Configura el parsing del cuerpo, el logueo y registra las rutas del sistema.
 */
export function buildApp(deps: ProxyDependencies, logger: Logger) {
  const app = fastify({
    loggerInstance: logger as unknown as import('fastify').FastifyBaseLogger,
    genReqId: () => randomUUID(),
  });

  // Logging HTTP estructurado: hooks onRequest/onResponse aplicados al root context
  // para que cubran TODAS las rutas (/health, /hooks, /proxy/*).
  const httpLoggerConfig = {
    logBodies: deps.config.LOG_HTTP_BODIES === true,
    logHeaders: deps.config.LOG_HTTP_HEADERS !== false,
    level: deps.config.LOG_HTTP_LEVEL ?? 'info',
  };
  app.addHook('onRequest', createHttpOnRequestHook(httpLoggerConfig));
  app.addHook('preValidation', createHttpPreValidationHook(httpLoggerConfig));
  app.addHook('onResponse', createHttpOnResponseHook(httpLoggerConfig));

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

  // Borde hooks (C3): recibe eventos del lifecycle de Claude Code y los despacha al handler
  const hooksController = new HooksController(deps.hookEventHandler);
  app.post('/hooks', (request, reply) => hooksController.handle(request, reply));

  // Registrar las rutas principales de orquestación del proxy con deps inyectadas
  app.register(proxyRoutes, { deps });

  // Graceful shutdown: cerrar todas las interacciones abiertas como orphans para que
  // la auditoría en disco quede completa (meta.json + eliminación de state.json).
  app.addHook('onClose', async () => {
    const openWorkflows = deps.auditWorkflowHandler.getOpenWorkflowsForShutdown();
    for (const workflow of openWorkflows) {
      try {
        await deps.auditWorkflowHandler.closeOrphanWorkflow(workflow);
      } catch (err) {
        app.log.error(
          { err, workflowId: workflow.id },
          'Error cerrando workflow orphan en shutdown',
        );
      }
    }
    if (openWorkflows.length > 0) {
      app.log.info(
        { count: openWorkflows.length },
        'Workflows orphan cerrados en graceful shutdown',
      );
    }
  });

  return app;
}
