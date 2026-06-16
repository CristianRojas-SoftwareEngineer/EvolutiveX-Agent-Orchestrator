import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Configuración para el plugin de logging HTTP estructurado.
 */
export interface HttpLoggerConfig {
  /** Activar logging del body de request. */
  logBodies: boolean;
  /** Activar logging de headers request+response. */
  logHeaders: boolean;
}

/**
 * Serializa el body para logueo.
 * - Content-types de texto (JSON, text/*, form-urlencoded) → string UTF-8 completo.
 * - Binarios → solo length + preview (primeros 256 bytes).
 */
function serializeBody(buf: Buffer, contentType: string | undefined): {
  body?: string;
  bodyLength: number;
  bodyPreview?: string;
} {
  if (!contentType || !/^(application\/json|text\/|application\/x-www-form-urlencoded)/i.test(contentType)) {
    return {
      bodyLength: buf.length,
      bodyPreview: buf.subarray(0, 256).toString('utf-8'),
    };
  }
  return {
    body: buf.toString('utf-8'),
    bodyLength: buf.length,
  };
}

/**
 * Extrae los headers tal cual para incluir en el log.
 * Sin filtrado en esta iteración (D4 del design).
 */
function pickHeaders(headers: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  return headers;
}

/**
 * Hook onRequest: loguea request entrante (headers disponibles, body aún no parseado).
 */
export function createHttpOnRequestHook(config: HttpLoggerConfig) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const payload: Record<string, unknown> = {
      reqId: request.id,
      method: request.method,
      url: request.url,
    };

    if (config.logHeaders) {
      payload.headers = pickHeaders(request.headers as Record<string, unknown> | undefined);
    }

    // Body logging requiere preParsing (body disponible como Buffer tras content-type parser).
    // Se delega a createHttpPreParsingHook; aquí solo se loguean headers.
    request.log.info(payload, '→ incoming request');
  };
}

/**
 * Hook preValidation: loguea body de request (ya como Buffer tras content-type parser).
 */
export function createHttpPreValidationHook(config: HttpLoggerConfig) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!config.logBodies || !Buffer.isBuffer(request.body)) return;

    const serialized = serializeBody(
      request.body as Buffer,
      request.headers['content-type'] as string | undefined,
    );

    const payload: Record<string, unknown> = { reqId: request.id, ...serialized };

    request.log.info(payload, '→ incoming request body');
  };
}

/**
 * Hook onResponse: loguea respuesta con status code y tiempo de respuesta.
 * Registrado en el root context para aplicar a todas las rutas.
 */
export function createHttpOnResponseHook(config: HttpLoggerConfig) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const payload: Record<string, unknown> = {
      reqId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: (reply as unknown as { elapsed?: number }).elapsed ?? 0,
    };

    if (config.logHeaders) {
      payload.headers = pickHeaders(reply.getHeaders() as Record<string, unknown> | undefined);
    }

    request.log.info(payload, '← response sent');
  };
}

/**
 * Plugin Fastify que emite logs estructurados en los hooks onRequest y onResponse.
 *
 * Registrado en el root context para aplicar a todas las rutas (/health, /hooks, /proxy/*).
 * Usa request.log (child del logger raíz) para preservar correlación por reqId.
 *
 * NOTA: en Fastify 5 los hooks de plugins encapsulados no percolan a rutas del contexto
 * padre. Por eso app.ts registra los hooks con app.addHook directamente, y este plugin
 * existe como agrupador documentado para cuando se agregue fastify-plugin.
 *
 * @see specs/http-access-logging/spec.md
 */
const httpLoggerPlugin: FastifyPluginAsync<{ config: HttpLoggerConfig }> = async (
  fastify: FastifyInstance,
  opts: { config: HttpLoggerConfig },
) => {
  const { config } = opts;
  fastify.addHook('onRequest', createHttpOnRequestHook(config));
  fastify.addHook('preValidation', createHttpPreValidationHook(config));
  fastify.addHook('onResponse', createHttpOnResponseHook(config));
};

export { httpLoggerPlugin };