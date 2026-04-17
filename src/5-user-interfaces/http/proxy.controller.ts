import { FastifyRequest, FastifyReply } from 'fastify';
import type { ProxyDependencies } from '../../4-api/composition-root.js';
import { AuditRequestContext } from '../../1-domain/types/audit.types.js';

/**
 * Controlador delgado que actúa como traductor entre Fastify (Capa 5) y los handlers (Capa 3).
 * Solo maneja: parsing de FastifyRequest/Reply, setup de streams, piping, y construcción de contexto.
 */
export class ProxyController {
  constructor(private deps: ProxyDependencies) {}

  /**
   * Hook preHandler: extrae datos de la petición y delega al handler de auditoría de request.
   */
  public async preHandler(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const rawBody = (request.body as Buffer) || Buffer.alloc(0);

    const result = await this.deps.auditRequestHandler.execute({
      headers: request.headers,
      rawBody,
      requestId: request.id,
    });

    if (result) {
      request.auditSessionId = result.auditSessionId;
      request.requestSequence = result.requestSequence;
      request.requestStartTime = Date.now();
      request.auditRequestDir = result.auditRequestDir;
      request.requestBodyOmitted = result.requestBodyOmitted;
    }
  }

  /**
   * Manejador para errores de conexión con el upstream.
   */
  public async onUpstreamError(
    request: FastifyRequest,
    reply: FastifyReply,
    error: Error & { code?: string },
  ): Promise<void> {
    const auditDir = request.auditRequestDir;

    if (auditDir) {
      try {
        await this.deps.auditUpstreamErrorHandler.execute({
          auditRequestDir: auditDir,
          requestId: request.id,
          requestSequence: request.requestSequence || 0,
          auditSessionId: request.auditSessionId || '',
          method: request.method,
          url: request.url,
          requestStartTime: request.requestStartTime || Date.now(),
          requestBodyBytes: (request.body as Buffer | undefined)?.length || 0,
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

  /**
   * Interceptor para la respuesta del proxy.
   * Clona el stream, gestiona gzip, y delega al handler correspondiente (SSE o estándar).
   */
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

    // Preparar headers de respuesta (quitar gzip si es necesario)
    const headers = { ...res.headers };
    if (isGzip) {
      reply.removeHeader('content-encoding');
      reply.removeHeader('content-length');
      delete headers['content-encoding'];
      delete headers['content-length'];
    }
    reply.headers(headers);

    // Resolver stream fuente
    let sourceStream: NodeJS.ReadableStream =
      res.stream || (res as unknown as NodeJS.ReadableStream);
    if (
      typeof sourceStream.pipe !== 'function' &&
      res.body &&
      typeof (res.body as { pipe?: unknown }).pipe === 'function'
    ) {
      sourceStream = res.body as NodeJS.ReadableStream;
    }

    // Bifurcar stream usando StreamTeeService (descomprime gzip si corresponde)
    const { clientStream, auditStream } = this.deps.streamTee.teeAndDecompress(
      sourceStream,
      isGzip,
    );

    // Construir contexto de auditoría
    const context: AuditRequestContext = {
      requestId: request.id,
      requestSequence: request.requestSequence || 0,
      auditSessionId: request.auditSessionId || '',
      method: request.method,
      url: request.url,
      upstream: this.deps.config.UPSTREAM_ORIGIN,
      requestStartTime: request.requestStartTime || Date.now(),
      requestBodyBytes: (request.body as Buffer | undefined)?.length || 0,
      requestBodyOmitted: !!request.requestBodyOmitted,
      auditRequestDir: request.auditRequestDir || '',
      responseStatusCode: res.statusCode,
    };

    // Delegar al handler correspondiente
    if (isSse) {
      this.deps.auditSseResponseHandler.execute(auditStream, context, headers);
    } else {
      this.deps.auditStandardResponseHandler.execute(auditStream, context, contentType);
    }

    reply.send(clientStream);
  }
}
