import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import { RedactService } from './redact.service.js';
import { MarkdownRendererService } from './markdown-renderer.service.js';
import { AuditMetadata, SseLine } from '../interfaces/audit.interface.js';
import { JsonValue } from '../interfaces/json.interface.js';

/**
 * Servicio encargado de la persistencia física de los logs de auditoría.
 * Proporciona operaciones de escritura atómica y formateo para varios tipos de archivos de auditoría.
 */
export class AuditWriterService {
  constructor(
    private redactService: RedactService,
    private markdownRendererService: MarkdownRendererService,
  ) {}

  /**
   * Escribe datos en un archivo de forma atómica escribiendo primero en un archivo temporal
   * y luego renombrándolo. Asegura que fallos del sistema no dejen archivos parcialmente escritos.
   */
  public async writeFileAtomic(filePath: string, data: Buffer | string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, filePath);
  }

  /**
   * Ayudante para escribir un objeto como un archivo JSON con formato (pretty-print) de forma atómica.
   */
  public async writeJsonAtomic(filePath: string, obj: JsonValue): Promise<void> {
    return this.writeFileAtomic(filePath, Buffer.from(JSON.stringify(obj, null, 2), 'utf8'));
  }

  /**
   * Genera tanto un JSON formateado como una vista en Markdown semántico para un cuerpo parseado.
   * Útil para desarrolladores que revisan el tráfico capturado.
   *
   * @param type Tipo de cuerpo para seleccionar el renderizador semántico correcto.
   */
  public async writeFormattedAndMarkdown(
    requestDir: string,
    baseName: string,
    parsed: JsonValue,
    type: 'request' | 'response',
  ): Promise<void> {
    await this.writeJsonAtomic(path.join(requestDir, `${baseName}.formatted.json`), parsed);
    try {
      const md =
        type === 'request'
          ? this.markdownRendererService.renderRequestBodyMarkdown(parsed)
          : this.markdownRendererService.renderResponseBodyMarkdown(parsed);
      await this.writeFileAtomic(
        path.join(requestDir, `${baseName}.parsed.md`),
        Buffer.from(`${md}\n`, 'utf8'),
      );
    } catch {
      /* ignorar error de markdown */
    }
  }

  /**
   * Inicializa el directorio de auditoría de la petición y guarda los metadatos iniciales.
   * Gestiona la omisión del cuerpo si excede los límites configurados.
   *
   * @returns La ruta del directorio y si el cuerpo fue omitido.
   */
  public async writeRequestAudit(params: {
    baseDir: string;
    sessionId: string;
    folderName: string;
    headers: Record<string, string | string[] | undefined>;
    bodyBuffer: Buffer | null;
    maxAuditRequestBytes: number;
  }): Promise<{ dir: string; requestBodyOmitted: boolean }> {
    const dir = path.join(params.baseDir, params.sessionId, 'requests', params.folderName);
    await fs.mkdir(dir, { recursive: true });
    await this.writeJsonAtomic(
      path.join(dir, 'request.headers.json'),
      params.headers as unknown as JsonValue,
    );

    const size = params.bodyBuffer ? params.bodyBuffer.length : 0;
    if (size === 0 || !params.bodyBuffer) {
      return { dir, requestBodyOmitted: false };
    }

    if (size <= params.maxAuditRequestBytes) {
      await this.writeFileAtomic(path.join(dir, 'request.body.bin'), params.bodyBuffer);
      const parsed = this.redactService.tryParseJson(params.bodyBuffer);
      if (parsed !== null) {
        await this.writeFormattedAndMarkdown(dir, 'request.body', parsed, 'request');
      }
      return { dir, requestBodyOmitted: false };
    }

    await this.writeFileAtomic(
      path.join(dir, 'request.body.omitted.txt'),
      Buffer.from(
        `Omitted: request body is ${size} bytes (limit MAX_AUDIT_REQUEST_BODY_BYTES=${params.maxAuditRequestBytes}).`,
        'utf8',
      ),
    );
    return { dir, requestBodyOmitted: true };
  }

  /**
   * Finaliza la auditoría para una respuesta estándar (no-SSE).
   * Gestiona el truncamiento y el formateo automático de JSON.
   */
  public async finalizeNonSseResponseAudit(params: {
    requestDir: string;
    bodyBuffer: Buffer;
    totalBytes: number;
    maxAuditResponseBytes: number;
    maxBufferBytes: number;
    contentType: string;
  }): Promise<{
    responseBodyBytesAudited: number;
    responseTruncatedByProxyBuffer: boolean;
    responseTruncatedByAuditLimit: boolean;
  }> {
    const slice = params.bodyBuffer.subarray(0, params.maxAuditResponseBytes);
    const lostInProxyBuffer = params.totalBytes > params.bodyBuffer.length;
    const truncatedAudit =
      params.totalBytes > params.maxAuditResponseBytes || slice.length < params.totalBytes;
    const ext = String(params.contentType || '').includes('json') ? 'json' : 'bin';

    if (slice.length > 0) {
      await this.writeFileAtomic(path.join(params.requestDir, `response.body.${ext}`), slice);
      if (ext === 'json') {
        const parsed = this.redactService.tryParseJson(slice);
        if (parsed !== null) {
          await this.writeFormattedAndMarkdown(
            params.requestDir,
            'response.body',
            parsed,
            'response',
          );
        }
      }
    }

    if (truncatedAudit || lostInProxyBuffer) {
      await this.writeFileAtomic(
        path.join(params.requestDir, 'response.body.omitted.txt'),
        Buffer.from(
          [
            `Total bytes received from upstream: ${params.totalBytes}.`,
            `Bytes available in proxy buffer: ${params.bodyBuffer.length}.`,
            lostInProxyBuffer
              ? `Proxy buffer cap MAX_RESPONSE_BUFFER_BYTES=${params.maxBufferBytes}.`
              : '',
            truncatedAudit
              ? `Audit stored up to MAX_AUDIT_RESPONSE_BODY_BYTES=${params.maxAuditResponseBytes}.`
              : '',
          ]
            .filter(Boolean)
            .join(' '),
          'utf8',
        ),
      );
    }

    return {
      responseBodyBytesAudited: slice.length,
      responseTruncatedByProxyBuffer: lostInProxyBuffer,
      responseTruncatedByAuditLimit: !lostInProxyBuffer && slice.length < params.totalBytes,
    };
  }

  /**
   * Persiste el prefijo de respuesta no-SSE cuando el stream upstream falla a mitad de cuerpo.
   * Escribe response.body.* y response.body.omitted.txt (mensaje de error del stream en cabecera).
   */
  public async finalizeNonSseResponseAuditOnStreamError(params: {
    requestDir: string;
    bodyBuffer: Buffer;
    totalBytes: number;
    maxAuditResponseBytes: number;
    maxBufferBytes: number;
    contentType: string;
    streamErrorMessage: string;
  }): Promise<{
    responseBodyBytesAudited: number;
    responseTruncatedByProxyBuffer: boolean;
    responseTruncatedByAuditLimit: boolean;
  }> {
    const slice = params.bodyBuffer.subarray(0, params.maxAuditResponseBytes);
    const lostInProxyBuffer = params.totalBytes > params.bodyBuffer.length;
    const truncatedAudit =
      params.totalBytes > params.maxAuditResponseBytes || slice.length < params.totalBytes;
    const ext = String(params.contentType || '').includes('json') ? 'json' : 'bin';

    if (slice.length > 0) {
      await this.writeFileAtomic(path.join(params.requestDir, `response.body.${ext}`), slice);
      if (ext === 'json') {
        const parsed = this.redactService.tryParseJson(slice);
        if (parsed !== null) {
          await this.writeFormattedAndMarkdown(
            params.requestDir,
            'response.body',
            parsed,
            'response',
          );
        }
      }
    }

    await this.writeFileAtomic(
      path.join(params.requestDir, 'response.body.omitted.txt'),
      Buffer.from(
        [
          `Stream error: ${params.streamErrorMessage}`,
          `Total bytes received from upstream before error: ${params.totalBytes}.`,
          `Bytes available in proxy buffer: ${params.bodyBuffer.length}.`,
          lostInProxyBuffer
            ? `Proxy buffer cap MAX_RESPONSE_BUFFER_BYTES=${params.maxBufferBytes}.`
            : '',
          truncatedAudit
            ? `Audit stored up to MAX_AUDIT_RESPONSE_BODY_BYTES=${params.maxAuditResponseBytes}.`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
        'utf8',
      ),
    );

    return {
      responseBodyBytesAudited: slice.length,
      responseTruncatedByProxyBuffer: lostInProxyBuffer,
      responseTruncatedByAuditLimit: !lostInProxyBuffer && slice.length < params.totalBytes,
    };
  }

  /**
   * Escribe un meta.json cuando falla la conexión al upstream antes de recibir respuesta.
   * Documenta el error de red para que las herramientas de análisis puedan detectar fallos de infraestructura.
   */
  public async writeUpstreamFailureMeta(
    requestDir: string,
    payload: {
      requestId: string;
      requestSequence: number;
      auditSessionId: string;
      err: Error | { message?: string; code?: string };
      requestStartTime: number;
      upstream: string;
      method: string;
      url: string;
      requestBodyBytes: number;
      requestBodyOmitted: boolean;
    },
  ): Promise<void> {
    const endedAt = Date.now();
    const meta = {
      requestId: payload.requestId,
      requestSequence: payload.requestSequence,
      auditSessionId: payload.auditSessionId,
      method: payload.method,
      url: payload.url,
      upstream: payload.upstream,
      startedAt: new Date(payload.requestStartTime).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      durationMs: endedAt - payload.requestStartTime,
      responseReceived: false,
      responseBodyComplete: false,
      upstreamError: true,
      errorMessage: payload.err?.message ? payload.err.message : String(payload.err),
      errorCode: (payload.err as { code?: string })?.code || undefined,
      requestBodyBytes: payload.requestBodyBytes || 0,
      sse: false,
      statusCode: null,
      truncation: {
        requestBodyOmitted: !!payload.requestBodyOmitted,
        responseBodyBytesTotal: null,
        responseBodyBytesAudited: null,
        responseTruncatedByProxyBuffer: null,
        responseTruncatedByAuditLimit: null,
      },
    };
    await this.writeMetaAtomic(requestDir, meta as unknown as AuditMetadata);
  }

  /**
   * Persiste las cabeceras de respuesta (generado solo para respuestas SSE en paridad con el sistema legacy).
   */
  public async writeResponseHeadersAudit(
    requestDir: string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    await this.writeJsonAtomic(
      path.join(requestDir, 'response.headers.json'),
      headers as unknown as JsonValue,
    );
  }

  /**
   * Guarda el archivo final meta.json con todas las métricas de petición/respuesta.
   */
  public async writeMetaAtomic(requestDir: string, meta: AuditMetadata): Promise<void> {
    await this.writeJsonAtomic(path.join(requestDir, 'meta.json'), meta as unknown as JsonValue);
  }

  /**
   * Añade una línea de evento SSE capturada al log .jsonl.
   * Usa escritura síncrona para máxima durabilidad ante caídas del proceso.
   */
  public appendSseLine(requestDir: string, lineObj: SseLine): void {
    const p = path.join(requestDir, 'response.sse.jsonl');
    const line = `${JSON.stringify(lineObj)}\n`;
    fsSync.appendFileSync(p, line, 'utf8');
  }

  /**
   * Añade datos binarios crudos al volcado sse.txt.
   */
  public async appendSseRawChunk(requestDir: string, chunk: Buffer): Promise<void> {
    const p = path.join(requestDir, 'response.sse.txt');
    await fs.appendFile(p, chunk);
  }
}
