import { StringDecoder } from 'node:string_decoder';
import type { IAuditWriter } from '../2-services/ports/audit-writer.port.js';
import type { ISseReconstructor } from '../2-services/ports/sse-reconstructor.port.js';
import { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';
import { AuditRequestContext, SseReconstructResult } from '../1-domain/types/audit.types.js';

/**
 * Handler para orquestar la auditoría de respuestas SSE.
 * Patrón fire-and-subscribe: suscribe listeners al stream y retorna inmediatamente.
 */
export class AuditSseResponseHandler {
  constructor(
    private auditWriter: IAuditWriter,
    private sseReconstruct: ISseReconstructor,
    private config: ProxyEnvironmentConfig,
  ) {}

  /**
   * Ejecuta la auditoría de respuesta SSE.
   * @param stream Stream SSE a auditar (ya descomprimido si venía gzip)
   * @param context Contexto de la petición
   * @param responseHeaders Cabeceras de respuesta para escribir
   */
  public execute(
    stream: NodeJS.ReadableStream,
    context: AuditRequestContext,
    responseHeaders: Record<string, string | string[] | undefined>,
  ): void {
    if (!this.config.AUDIT_ENABLED || !context.auditRequestDir) {
      return;
    }

    const auditDir = context.auditRequestDir;
    const maxSseRaw = this.config.MAX_AUDIT_SSE_RAW_BYTES;

    // Escribir cabeceras de respuesta
    this.auditWriter.writeResponseHeadersAudit(auditDir, responseHeaders).catch((e) => {
      console.error('Error al escribir cabeceras SSE:', e);
    });

    const decoder = new StringDecoder('utf8');
    let lineBuffer = '';
    let sseLineIndex = 0;
    let streamError = false;
    let totalBytes = 0;
    let sseRawBytesWritten = 0;
    let sseRawTruncated = false;

    stream.on('error', (err) => {
      streamError = true;
      console.error('Error en stream SSE:', err);
    });

    stream.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;

      // Captura de SSE crudo (Raw)
      if (this.config.AUDIT_SSE_RAW && !sseRawTruncated) {
        if (sseRawBytesWritten + chunk.length <= maxSseRaw) {
          this.auditWriter.appendSseRawChunk(auditDir, chunk).catch((e) => {
            console.error('Error al escribir SSE crudo:', e);
          });
          sseRawBytesWritten += chunk.length;
        } else {
          const remaining = maxSseRaw - sseRawBytesWritten;
          if (remaining > 0 && Number.isFinite(remaining)) {
            this.auditWriter
              .appendSseRawChunk(auditDir, chunk.subarray(0, remaining))
              .catch((e) => {
                console.error('Error al escribir fragmento final de SSE crudo:', e);
              });
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
          this.auditWriter.appendSseLine(auditDir, {
            i: sseLineIndex,
            ts: new Date().toISOString(),
            line: trimmed,
          });
        }
      }
    });

    stream.on('end', async () => {
      try {
        // Procesar línea final
        lineBuffer += decoder.end();
        const finalTrimmed = lineBuffer.replace(/\r$/, '').trim();
        if (finalTrimmed !== '') {
          sseLineIndex++;
          this.auditWriter.appendSseLine(auditDir, {
            i: sseLineIndex,
            ts: new Date().toISOString(),
            line: finalTrimmed,
          });
        }

        // Reconstrucción SSE del cuerpo de respuesta
        let sseReconstructResult: SseReconstructResult | undefined;
        if (this.config.AUDIT_SSE_RESPONSE_BODY) {
          try {
            sseReconstructResult = await this.sseReconstruct.runReconstruction({
              requestDir: auditDir,
              originalUrl: context.url,
              headers: {}, // Los headers beta se detectan de otra forma
              forceBeta: this.config.AUDIT_SSE_RESPONSE_BODY_FORCE_BETA,
              sseRawBytesWritten,
              auditSseRaw: this.config.AUDIT_SSE_RAW,
              sseRawTruncatedByLimit: sseRawTruncated,
              sseRawWriteError: streamError,
              requireRaw: this.config.AUDIT_SSE_RESPONSE_BODY_REQUIRE_RAW,
            });
          } catch (err) {
            console.error('Error en reconstrucción SSE:', err);
            sseReconstructResult = {
              sseResponseBodyAttempted: true,
              sseResponseBodyWritten: false,
              sseResponseBodyError: err instanceof Error ? err.message : String(err),
            };
          }
        }

        await this.writeFinalMeta(
          context,
          totalBytes,
          sseLineIndex,
          {
            sseRawBytesWritten,
            sseRawTruncatedByLimit: sseRawTruncated,
            streamError,
          },
          sseReconstructResult,
        );
      } catch (err) {
        console.error('Error al procesar fin de stream SSE:', err);
      }
    });
  }

  /**
   * Escribe el archivo meta.json final para respuestas SSE.
   */
  private async writeFinalMeta(
    context: AuditRequestContext,
    totalBytes: number,
    sseLineCount: number,
    sseExtra: {
      sseRawBytesWritten: number;
      sseRawTruncatedByLimit: boolean;
      streamError: boolean;
    },
    sseReconstructResult?: SseReconstructResult,
  ): Promise<void> {
    const endedAt = Date.now();
    const duration = endedAt - context.requestStartTime;
    const sseRawBytesLimit = Number.isFinite(this.config.MAX_AUDIT_SSE_RAW_BYTES)
      ? this.config.MAX_AUDIT_SSE_RAW_BYTES
      : null;

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
      sse: true,
      requestBodyBytes: context.requestBodyBytes,
      responseReceived: true,
      responseBodyComplete: !sseExtra.streamError,
      sseLineCount,
      ...(sseReconstructResult || {}),
      truncation: {
        requestBodyOmitted: context.requestBodyOmitted,
        responseBodyBytesTotal: null,
        responseBodyBytesAudited: null,
        responseTruncatedByProxyBuffer: false,
        responseTruncatedByAuditLimit: false,
        sseRawBytesAudited: sseExtra.sseRawBytesWritten || null,
        sseRawBytesLimit,
        sseRawTruncatedByLimit: sseExtra.sseRawTruncatedByLimit || false,
        sseRawWriteError: sseExtra.streamError || false,
      },
    });
  }
}
