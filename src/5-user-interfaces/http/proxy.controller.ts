import { FastifyRequest, FastifyReply } from 'fastify';
import { Readable } from 'node:stream';
import type { ProxyDependencies } from '../../4-api/composition-root.js';
import { AuditWorkflowContext } from '../../1-domain/types/audit.types.js';

/**
 * Controlador delgado que actúa como traductor entre Fastify (Capa 5) y los handlers (Capa 3).
 */
export class ProxyController {
  constructor(private deps: ProxyDependencies) {}

  public async preHandler(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    let rawBody: Buffer;

    if (
      request.body != null &&
      typeof (request.body as unknown as { pipe?: unknown }).pipe === 'function'
    ) {
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
      (request.headers as Record<string, string | string[] | undefined>)['content-length'] = String(
        filteredBody.length,
      );
    }

    request.rawBodyBytes = filteredBody.length;

    // Capturar el OAuth Bearer token del primer request autenticado para TTS
    const authHeader = (request.headers as Record<string, string | string[] | undefined>)['authorization'];
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      if (token) this.deps.hookEventHandler.setAuthToken(token);
    }

    const result = await this.deps.auditWorkflowHandler.execute({
      headers: request.headers,
      rawBody: filteredBody,
      requestId: request.id,
    });

    if (result) {
      request.auditSessionId = result.auditSessionId;
      request.auditWorkflowId = result.workflowId;
      request.requestSequence = result.requestSequence;
      request.requestStartTime = Date.now();
      request.auditWorkflowDir = result.auditWorkflowDir;
      request.requestBodyOmitted = result.requestBodyOmitted;
      request.workflowKind = result.workflowKind;
      request.requestClassification = result.requestClassification;
      request.auditStepIndex = result.assignedStepIndex;
      request.isInternalToolStep = result.isInternalToolStep;
      request.coalescedAgentContinuation = result.coalescedAgentContinuation;
    }
  }

  public async onUpstreamError(
    request: FastifyRequest,
    reply: FastifyReply,
    error: Error & { code?: string },
  ): Promise<void> {
    const sessionId = request.auditSessionId;

    if (sessionId) {
      try {
        this.deps.auditUpstreamErrorHandler.execute({
          auditSessionId: sessionId,
          error,
        });
      } catch (metaErr: unknown) {
        request.log.error(metaErr as Error, 'Error al cerrar workflow en fallo de upstream');
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

    const context: AuditWorkflowContext = {
      requestId: request.id,
      requestSequence: request.requestSequence || 0,
      auditSessionId: request.auditSessionId || '',
      workflowId: request.auditWorkflowId || '',
      method: request.method,
      url: request.url,
      upstream: this.deps.config.UPSTREAM_ORIGIN,
      requestStartTime: request.requestStartTime || Date.now(),
      requestBodyBytes: request.rawBodyBytes ?? 0,
      requestBodyOmitted: !!request.requestBodyOmitted,
      auditWorkflowDir: request.auditWorkflowDir || '',
      responseStatusCode: res.statusCode,
      workflowKind: request.workflowKind,
      requestClassification: request.requestClassification,
      assignedStepIndex: request.auditStepIndex ?? 1,
      isInternalToolStep: request.isInternalToolStep,
      coalescedAgentContinuation: request.coalescedAgentContinuation,
    };

    if (isSse) {
      this.deps.auditSseResponseHandler.execute(auditStream, context, headers);
    } else {
      this.deps.auditStandardResponseHandler.execute(auditStream, context, contentType, headers);
    }

    reply.send(clientStream);
  }
}
