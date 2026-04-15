import fastify from 'fastify';
import { proxyRoutes } from './routes/proxy';

/**
 * Función factory para construir y configurar la instancia de la aplicación Fastify.
 * Configura el parsing del cuerpo, el logueo y registra las rutas del sistema.
 */
export function buildApp() {
  const app = fastify({
    logger: true,
  });

  /**
   * Configura el límite global de cuerpo para el parsing de buffer crudo.
   * Esto es esencial para que el proxy gestione payloads binarios grandes.
   */
  const bodyLimitRaw = process.env.MAX_REQUEST_BODY || '50mb';
  const bodyLimit = bodyLimitRaw.toLowerCase().endsWith('mb') 
    ? parseInt(bodyLimitRaw) * 1024 * 1024 
    : 50 * 1024 * 1024;

  /**
   * Elimina los parsers por defecto y añade un parser de buffer catch-all.
   * Esto permite que el proxy intercepte cualquier tipo de contenido como un Buffer.
   */
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit }, function (req, body, done) {
    done(null, body);
  });

  // Endpoint de salud para monitoreo
  app.get('/health', async (request, reply) => {
    return { status: 'OK' };
  });

  // Registrar las rutas principales de orquestación del proxy
  app.register(proxyRoutes);

  return app;
}
