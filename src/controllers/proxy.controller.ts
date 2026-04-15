import { FastifyRequest, FastifyReply } from 'fastify';
import { SessionService } from '../services/session.service';
import { AuditWriterService } from '../services/audit-writer.service';
import { ProxyEnvironmentConfig } from '../interfaces/config.interface';
import * as http from 'http';
import * as zlib from 'zlib';
import { StringDecoder } from 'string_decoder';
import { PassThrough, Readable } from 'stream';

/**
 * Controlador principal que orquesta la lógica del proxy y la intercepción de auditoría.
 * Integrado con los hooks de Fastify e interceptores de @fastify/http-proxy.
 */
export class ProxyController {
  constructor(
    private sessionService: SessionService,
    private auditWriterService: AuditWriterService,
    private config: ProxyEnvironmentConfig
  ) {}

  /**
   * Hook preHandler de Fastify.
   * - Resuelve el ID de sesión.
   * - Elimina las cabeceras de sesión si está configurado.
   * - Inicializa la auditoría de la petición y guarda su cuerpo.
   */
  public async preHandler(request: any, reply: any) {
    const rawBody = (request.body as Buffer) || Buffer.alloc(0);
    
    const auditSession = this.sessionService.getAuditSessionId(request.headers);
    const auditSessionId = auditSession.sessionId;
    request.auditSessionId = auditSessionId;

    if (this.config.STRIP_AUDIT_SESSION_HEADER && auditSession.stripHeaderName) {
      this.sessionService.stripAuditHeaderInPlace(request.headers, auditSession.stripHeaderName);
    }

    if (this.config.AUDIT_ENABLED) {
      try {
        const seq = await this.sessionService.nextAuditRequestSequence(auditSessionId);
        request.requestSequence = seq;
        request.requestStartTime = Date.now();

        const folderName = this.sessionService.formatAuditRequestDirName(seq, request.id);
        const wr = await this.auditWriterService.writeRequestAudit({
          baseDir: this.sessionService.getBaseDir(),
          sessionId: auditSessionId,
          folderName,
          headers: request.headers,
          bodyBuffer: rawBody,
          maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
        });

        request.auditRequestDir = wr.dir;
        request.requestBodyOmitted = wr.requestBodyOmitted;
      } catch (err: any) {
        request.log.error(err, 'Error en writeRequestAudit');
      }
    }
  }

  /**
   * Interceptor para la respuesta del proxy.
   * - Clona el stream de respuesta para auditoría y entrega al cliente.
   * - Gestiona la descompresión Gzip en la rama de auditoría.
   * - Despacha a la lógica de captura para SSE o cuerpos estándar.
   */
  public onResponseInterceptor(request: any, reply: any, res: any) {
    reply.status(res.statusCode || 500);
    
    const contentType = String(res.headers['content-type'] || '').toLowerCase();
    const isSse = contentType.includes('text/event-stream');
    const isGzip = String(res.headers['content-encoding'] || '').toLowerCase().includes('gzip');
    
    const headers = { ...res.headers };
    if (isGzip) {
      delete headers['content-encoding'];
      delete headers['content-length'];
    }
    reply.headers(headers);

    const auditStream = new PassThrough();
    const clientStream = new PassThrough();

    let sourceStream: any = res.stream || res;
    if (typeof sourceStream.pipe !== 'function' && res.body && typeof res.body.pipe === 'function') {
      sourceStream = res.body;
    }

    sourceStream.pipe(auditStream);
    sourceStream.pipe(clientStream);

    let streamToAudit: NodeJS.ReadableStream = auditStream;
    if (isGzip) {
      const gunzip = zlib.createGunzip();
      auditStream.pipe(gunzip);
      streamToAudit = gunzip;
    }

    const auditDir = request.auditRequestDir;
    const maxBuffer = this.config.MAX_RESPONSE_BUFFER_BYTES;
    const maxSseRaw = this.config.MAX_AUDIT_SSE_RAW_BYTES;
    let totalBytes = 0;
    let sseRawBytesWritten = 0;
    let sseRawTruncated = false;
    
    if (isSse) {
      // Auditar cabeceras SSE si está habilitado
      if (this.config.AUDIT_ENABLED && auditDir) {
        this.auditWriterService.writeResponseHeadersAudit(auditDir, res.headers).catch(e => request.log.error(e, 'Error al escribir cabeceras SSE'));
      }

      const decoder = new StringDecoder('utf8');
      let lineBuffer = '';
      let sseLineIndex = 0;
      let streamError = false;

      streamToAudit.on('error', (err) => {
        streamError = true;
        request.log.error(err, 'Error en stream SSE');
      });

      streamToAudit.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        
        // Lógica de captura de SSE crudo (Raw)
        if (this.config.AUDIT_ENABLED && this.config.AUDIT_SSE_RAW && auditDir && !sseRawTruncated) {
          if (sseRawBytesWritten + chunk.length <= maxSseRaw) {
            this.auditWriterService.appendSseRawChunk(auditDir, chunk).catch(e => request.log.error(e, 'Error al escribir SSE crudo'));
            sseRawBytesWritten += chunk.length;
          } else {
            const remaining = maxSseRaw - sseRawBytesWritten;
            if (remaining > 0) {
              this.auditWriterService.appendSseRawChunk(auditDir, chunk.subarray(0, remaining)).catch(e => request.log.error(e, 'Error al escribir fragmento final de SSE crudo'));
              sseRawBytesWritten += remaining;
            }
            sseRawTruncated = true;
          }
        }

        // Extracción de líneas SSE para auditoría en JSONL
        lineBuffer += decoder.write(chunk);
        
        let idx;
        while ((idx = lineBuffer.indexOf('\n')) >= 0) {
          const line = lineBuffer.slice(0, idx);
          lineBuffer = lineBuffer.slice(idx + 1);
          const trimmed = line.replace(/\r$/, '').trim();
          
          if (trimmed !== '') {
            sseLineIndex++;
            if (this.config.AUDIT_ENABLED && auditDir) {
              this.auditWriterService.appendSseLine(auditDir, {
                i: sseLineIndex,
                ts: new Date().toISOString(),
                line: trimmed
              }).catch(err => request.log.error(err, 'Error en appendSseLine'));
            }
          }
        }
      });

      streamToAudit.on('end', async () => {
        lineBuffer += decoder.end();
        const finalTrimmed = lineBuffer.replace(/\r$/, '').trim();
        if (finalTrimmed !== '') {
          sseLineIndex++;
          if (this.config.AUDIT_ENABLED && auditDir) {
            await this.auditWriterService.appendSseLine(auditDir, {
              i: sseLineIndex,
              ts: new Date().toISOString(),
              line: finalTrimmed
            }).catch(err => request.log.error(err, 'Error en appendSseLine final'));
          }
        }

        if (this.config.AUDIT_ENABLED && auditDir) {
          await this.writeFinalMeta(request, res, totalBytes, true, sseLineIndex, {
            sseRawBytesWritten,
            sseRawTruncatedByLimit: sseRawTruncated,
            streamError
          });
        }
      });

    } else {
      // Lógica para capturar cuerpos de respuesta completos (JSON, etc.)
      const chunks: Buffer[] = [];
      streamToAudit.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes <= maxBuffer) {
          chunks.push(chunk);
        }
      });

      streamToAudit.on('end', async () => {
        const buf = Buffer.concat(chunks);
        if (this.config.AUDIT_ENABLED && auditDir) {
          await this.auditWriterService.finalizeNonSseResponseAudit({
            requestDir: auditDir,
            bodyBuffer: buf,
            totalBytes,
            maxAuditResponseBytes: this.config.MAX_AUDIT_RESPONSE_BODY_BYTES,
            maxBufferBytes: maxBuffer,
            contentType: contentType,
          });

          await this.writeFinalMeta(request, res, totalBytes, false);
        }
      });
    }

    return reply.send(clientStream);
  }

  /**
   * Ayudante interno para compilar métricas y escribir el archivo meta.json final.
   */
  private async writeFinalMeta(request: any, res: any, totalBytes: number, isSse: boolean, sseLineCount?: number, sseExtra?: any) {
    const auditDir = request.auditRequestDir;
    if (!auditDir) return;

    await this.auditWriterService.writeMetaAtomic(auditDir, {
      requestId: request.id,
      requestSequence: request.requestSequence,
      auditSessionId: request.auditSessionId,
      method: request.method,
      url: request.url,
      upstream: this.config.UPSTREAM_ORIGIN,
      startedAt: new Date(request.requestStartTime).toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: Date.now() - request.requestStartTime,
      statusCode: res.statusCode || null,
      sse: isSse,
      requestBodyBytes: (request.body as Buffer)?.length || 0,
      responseReceived: true,
      responseBodyComplete: !sseExtra?.streamError,
      sseLineCount: sseLineCount,
      truncation: {
        requestBodyOmitted: !!request.requestBodyOmitted,
        responseBodyBytesTotal: totalBytes,
        responseBodyBytesAudited: isSse ? null : Math.min(totalBytes, this.config.MAX_AUDIT_RESPONSE_BODY_BYTES),
        responseTruncatedByProxyBuffer: isSse ? false : totalBytes > this.config.MAX_RESPONSE_BUFFER_BYTES,
        responseTruncatedByAuditLimit: isSse ? false : totalBytes > this.config.MAX_AUDIT_RESPONSE_BODY_BYTES,
        sseRawBytesAudited: sseExtra?.sseRawBytesWritten || null,
        sseRawTruncatedByLimit: sseExtra?.sseRawTruncatedByLimit || false,
      }
    });
  }
}

