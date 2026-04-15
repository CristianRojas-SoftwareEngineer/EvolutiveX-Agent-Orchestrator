import fastify from 'fastify';
import { itemRoutes } from './routes/items';

export function buildApp() {
  const app = fastify({
    logger: true,
  });

  // Registramos las rutas. 'prefix' permite agruparlas bajo un prefijo común
  app.register(itemRoutes, { prefix: '/api/v1/items' });

  app.get('/health', async (request, reply) => {
    return { status: 'OK' };
  });

  return app;
}
