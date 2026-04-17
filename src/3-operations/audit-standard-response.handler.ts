import type { IAuditWriter } from '../2-services/ports/audit-writer.port.js';
import { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';
import { AuditRequestContext } from '../1-domain/types/audit.types.js';

/**
 * Handler para orquestar la auditoría de respuestas estándar (no-SSE).
 * Patrón fire-and-subscribe: suscribe listeners al stream y retorna inmediatamente.
 */
export class AuditStandardResponseHandler {
  constructor(
    private auditWriter: IAuditWriter,
    private config: ProxyEnvironmentConfig,
  ) {}

  /**
   * Ejecuta la auditoría de respuesta estándar.
   * @param stream Stream a auditar (ya descomprimido si venía gzip)
   * @param context Contexto de la petición
   * @param contentType Content-Type de la respuesta
   */
  public execute(
    stream: NodeJS.ReadableStream,
    context: AuditRequestContext,
    contentType: string,
  ): void {
    if (!this.config.AUDIT_ENABLED || !context.auditRequestDir) {
      return;
    }

    const chunks: Buffer[] = [];
    const maxBuffer = this.config.MAX_RESPONSE_BUFFER_BYTES;
    let totalBytes = 0;
    const auditDir = context.auditRequestDir;

    stream.on('error', async (err) => {
      console.error('Error en stream no-SSE:', err);
      try {
        const buf = Buffer.concat(chunks);
        await this.auditWriter.finalizeNonSseResponseAuditOnStreamError({
          requestDir: auditDir,
          bodyBuffer: buf,
          totalBytes,
          maxAuditResponseBytes: this.config.MAX_AUDIT_RESPONSE_BODY_BYTES,
          maxBufferBytes: maxBuffer,
          contentType,
          streamErrorMessage: err?.message || String(err),
        });
        await this.writeFinalMeta(context, totalBytes, false, {
          streamError: true,
          errorMessage: err?.message || String(err),
        });
      } catch (writeErr) {
        console.error('Error al escribir meta de stream error:', writeErr);
      }
    });

    stream.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes <= maxBuffer) {
        chunks.push(chunk);
      }
    });

    stream.on('end', async () => {
      try {
        const buf = Buffer.concat(chunks);
        await this.auditWriter.finalizeNonSseResponseAudit({
          requestDir: auditDir,
          bodyBuffer: buf,
          totalBytes,
          maxAuditResponseBytes: this.config.MAX_AUDIT_RESPONSE_BODY_BYTES,
          maxBufferBytes: maxBuffer,
          contentType,
        });
        await this.writeFinalMeta(context, totalBytes, false);
      } catch (err) {
        console.error('Error al escribir meta final de respuesta estándar:', err);
      }
    });
  }

  /**
   * Escribe el archivo meta.json final para respuestas estándar.
   */
  private async writeFinalMeta(
    context: AuditRequestContext,
    totalBytes: number,
    isSse: boolean,
    errorInfo?: { streamError: boolean; errorMessage: string },
  ): Promise<void> {
    const endedAt = Date.now();
    const duration = endedAt - context.requestStartTime;

    await this.auditWriter.writeMetaAtomic(context.auditRequestDir, {
      requestId: context.requestId,
      requestSequence: context.requestSequence,
      auditSessionId: context.auditSessionId,
      method: context.method,
      url: context.url,
      upstream: context.upstream,
      startedAt: new Date(context.requestStartTime).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      durationMs: duration,
      statusCode: context.responseStatusCode,
      sse: isSse,
      requestBodyBytes: context.requestBodyBytes,
      responseReceived: true,
      responseBodyComplete: errorInfo ? false : true,
      ...(errorInfo ? { errorMessage: errorInfo.errorMessage } : {}),
      truncation: {
        requestBodyOmitted: context.requestBodyOmitted,
        responseBodyBytesTotal: totalBytes,
        responseBodyBytesAudited: Math.min(totalBytes, this.config.MAX_AUDIT_RESPONSE_BODY_BYTES),
        responseTruncatedByProxyBuffer: totalBytes > this.config.MAX_RESPONSE_BUFFER_BYTES,
        responseTruncatedByAuditLimit: totalBytes > this.config.MAX_AUDIT_RESPONSE_BODY_BYTES,
      },
    });
  }
}
