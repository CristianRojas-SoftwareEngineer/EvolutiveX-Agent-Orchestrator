/**
 * Punto de entrada para la aplicación Smart Code Proxy.
 * Arranca el servidor Fastify y comienza a escuchar peticiones.
 */
import { buildApp } from './app';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

/**
 * Inicializa y arranca el servidor proxy.
 */
async function start() {
  const app = buildApp();
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    app.log.info(`Servidor escuchando en el puerto ${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
