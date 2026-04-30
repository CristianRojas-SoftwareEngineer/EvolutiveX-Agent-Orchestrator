import { FastifyRequest, FastifyReply } from 'fastify';
import { Readable } from 'node:stream';
import type { ProxyDependencies } from '../../4-api/composition-root.js';
import { AuditInteractionContext } from '../../1-domain/types/audit.types.js';

/**
 * Controlador delgado que actúa como traductor entre Fastify (Capa 5) y los handlers (Capa 3).
 */
export class ProxyController {
  constructor(private deps: ProxyDependencies) {}

  public async preHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    let rawBody: Buffer;

    if (request.body != null && typeof (request.body as unknown as { pipe?: unknown }).pipe === 'function') {
      const chunks: Buffer[] = [];
      for await (const chunk of request.body as AsyncIterable<Buffer>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      rawBody = Buffer.concat(chunks);
      (request as unknown as { body: unknown }).body = Readable.from(rawBody);
    } else if (Buffer.isBuffer(request.body)) {
      rawBody = request.body;
    } else {
      rawBody = Buffer.alloc(0);
    }

    // Filtrar tools antes de auditoría y envío al upstream
    const filteredBody = this.deps.filterToolsHandler.execute(rawBody);

    // Actualizar request.body y content-length si el filtrado produjo cambios
    if (filteredBody !== rawBody) {
      (request as unknown as { body: unknown }).body = Readable.from(filteredBody);
      (request.headers as Record<string, string | string[] | undefined>)['content-length'] = String(filteredBody.length);
    }

    request.rawBodyBytes = filteredBody.length;
    const preHandlerStart = Date.now();

    const result = await this.deps.auditInteractionHandler.execute({
      headers: request.headers,
      rawBody: filteredBody,
      requestId: request.id,
    });

    if (result?.contextSyncCacheHit && result.contextSyncSseStream) {
      const orgHeader = request.headers['anthropic-organization-id'];
      reply
        .header('content-type', 'text/event-stream')
        .header('cache-control', 'no-cache')
        .header('connection', 'keep-alive');
      if (typeof orgHeader === 'string' && orgHeader.length > 0) {
        reply.header('anthropic-organization-id', orgHeader);
      }
      request.log.info(
        {
          event: 'context-sync.hit',
          sessionId: result.auditSessionId,
          htmlHash: result.webFetchHtmlHash,
          promptHash: result.webFetchPromptHash,
          latencyMs: Date.now() - preHandlerStart,
        },
        'Context Sync side-request servido desde caché local',
      );
      reply.send(result.contextSyncSseStream);
      return;
    }

    if (result) {
      request.auditSessionId = result.auditSessionId;
      request.requestSequence = result.requestSequence;
      request.requestStartTime = Date.now();
      request.auditInteractionDir = result.auditInteractionDir;
      request.requestBodyOmitted = result.requestBodyOmitted;
      request.interactionType = result.interactionType;
      request.turnClassification = result.turnClassification;
    }
  }

  public async onUpstreamError(
    request: FastifyRequest,
    reply: FastifyReply,
    error: Error & { code?: string },
  ): Promise<void> {
    const auditDir = request.auditInteractionDir;

    if (auditDir) {
      try {
        await this.deps.auditUpstreamErrorHandler.execute({
          auditInteractionDir: auditDir,
          requestId: request.id,
          requestSequence: request.requestSequence || 0,
          auditSessionId: request.auditSessionId || '',
          method: request.method,
          url: request.url,
          requestStartTime: request.requestStartTime || Date.now(),
          requestBodyBytes: request.rawBodyBytes ?? 0,
          requestBodyOmitted: !!request.requestBodyOmitted,
          error,
        });
      } catch (metaErr: unknown) {
        request.log.error(metaErr as Error, 'Error al escribir meta de fallo de upstream');
      }
    }

    reply.status(502).send({
      error: 'Bad Gateway',
      message: error?.message || 'Error de conexión con el upstream',
      code: error?.code || undefined,
    });
  }

  public onResponseInterceptor(
    request: FastifyRequest,
    reply: FastifyReply,
    res: {
      statusCode: number;
      headers: Record<string, string | string[] | undefined>;
      stream: NodeJS.ReadableStream;
      body?: unknown;
    },
  ): void {
    reply.status(res.statusCode || 500);

    const contentType = String(res.headers['content-type'] || '').toLowerCase();
    const isSse = contentType.includes('text/event-stream');
    const isGzip = String(res.headers['content-encoding'] || '')
      .toLowerCase()
      .includes('gzip');

    const headers = { ...res.headers };
    if (isGzip) {
      reply.removeHeader('content-encoding');
      reply.removeHeader('content-length');
      delete headers['content-encoding'];
      delete headers['content-length'];
    }
    reply.headers(headers);

    let sourceStream: NodeJS.ReadableStream =
      res.stream || (res as unknown as NodeJS.ReadableStream);
    if (
      typeof sourceStream.pipe !== 'function' &&
      res.body &&
      typeof (res.body as { pipe?: unknown }).pipe === 'function'
    ) {
      sourceStream = res.body as NodeJS.ReadableStream;
    }

    const { clientStream, auditStream } = this.deps.streamTee.teeAndDecompress(
      sourceStream,
      isGzip,
    );

    const context: AuditInteractionContext = {
      requestId: request.id,
      requestSequence: request.requestSequence || 0,
      auditSessionId: request.auditSessionId || '',
      method: request.method,
      url: request.url,
      upstream: this.deps.config.UPSTREAM_ORIGIN,
      requestStartTime: request.requestStartTime || Date.now(),
      requestBodyBytes: request.rawBodyBytes ?? 0,
      requestBodyOmitted: !!request.requestBodyOmitted,
      auditInteractionDir: request.auditInteractionDir || '',
      responseStatusCode: res.statusCode,
      interactionType: request.interactionType,
      turnClassification: request.turnClassification,
    };

    if (isSse) {
      this.deps.auditSseResponseHandler.execute(auditStream, context, headers);
    } else {
      this.deps.auditStandardResponseHandler.execute(auditStream, context, contentType, headers);
    }

    reply.send(clientStream);
  }
}
