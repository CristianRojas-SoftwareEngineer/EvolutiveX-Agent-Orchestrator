import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ISessionStore } from '../../2-services/ports/session-store.port.js';

interface CacheWebFetchPayload {
  sessionId: string;
  url: string;
  prompt: string;
  htmlHash: string;
  promptHash: string;
  response: string;
}

function isCacheWebFetchPayload(body: unknown): body is CacheWebFetchPayload {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.sessionId === 'string' &&
    typeof b.url === 'string' &&
    typeof b.prompt === 'string' &&
    typeof b.htmlHash === 'string' &&
    typeof b.promptHash === 'string' &&
    typeof b.response === 'string'
  );
}

/**
 * Registra rutas internas de administración y cacheo.
 * Estas rutas son localhost-only y no hacen auditoría de request.
 */
export async function registerInternalRoutes(fastify: FastifyInstance, sessionStore: ISessionStore) {
  fastify.post<{ Body: unknown }>(
    '/__internal/cacheWebFetchResponse',
    async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      if (!isCacheWebFetchPayload(request.body)) {
        reply.status(400).send({ error: 'Invalid payload' });
        return;
      }

      const { sessionId, url, prompt: _prompt, htmlHash, promptHash, response } = request.body as CacheWebFetchPayload;

      sessionStore.registerContextSyncCache(htmlHash, promptHash, response);

      request.log.debug({
        event: 'internal.cache_webfetch.registered',
        sessionId,
        url,
        htmlHash,
        promptHash,
        responseLength: response.length,
      }, 'Cache WebFetch response registered');

      reply.status(200).send({ ok: true });
    },
  );
}