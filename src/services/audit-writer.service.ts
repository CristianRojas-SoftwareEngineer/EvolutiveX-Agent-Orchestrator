import * as path from 'path';
import * as fs from 'fs/promises';
import { RedactService } from './redact.service';
import { AuditMetadata } from '../interfaces/audit.interface';

/**
 * Servicio encargado de la persistencia física de los logs de auditoría.
 * Proporciona operaciones de escritura atómica y formateo para varios tipos de archivos de auditoría.
 */
export class AuditWriterService {
  constructor(private redactService: RedactService) {}

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
  public async writeJsonAtomic(filePath: string, obj: any): Promise<void> {
    return this.writeFileAtomic(filePath, Buffer.from(JSON.stringify(obj, null, 2), 'utf8'));
  }

  /**
   * Genera tanto un JSON formateado como una vista en Markdown para un cuerpo parseado.
   * Útil para desarrolladores que revisan el tráfico capturado.
   */
  public async writeFormattedAndMarkdown(requestDir: string, baseName: string, parsed: any): Promise<void> {
    await this.writeJsonAtomic(path.join(requestDir, `${baseName}.formatted.json`), parsed);
    try {
      const md = `\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\`\n`;
      await this.writeFileAtomic(path.join(requestDir, `${baseName}.parsed.md`), Buffer.from(md, 'utf8'));
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
    headers: any;
    bodyBuffer: Buffer | null;
    maxAuditRequestBytes: number;
  }): Promise<{ dir: string; requestBodyOmitted: boolean }> {
    const dir = path.join(params.baseDir, params.sessionId, 'requests', params.folderName);
    await fs.mkdir(dir, { recursive: true });
    await this.writeJsonAtomic(path.join(dir, 'request.headers.json'), params.headers);

    const size = params.bodyBuffer ? params.bodyBuffer.length : 0;
    if (size === 0 || !params.bodyBuffer) {
      return { dir, requestBodyOmitted: false };
    }

    if (size <= params.maxAuditRequestBytes) {
      await this.writeFileAtomic(path.join(dir, 'request.body.bin'), params.bodyBuffer);
      const parsed = this.redactService.tryParseJson(params.bodyBuffer);
      if (parsed !== null) {
        await this.writeFormattedAndMarkdown(dir, 'request.body', parsed);
      }
      return { dir, requestBodyOmitted: false };
    }

    await this.writeFileAtomic(
      path.join(dir, 'request.body.omitted.txt'),
      Buffer.from(`Omitted: request body is ${size} bytes (limit MAX_AUDIT_REQUEST_BODY_BYTES=${params.maxAuditRequestBytes}).`, 'utf8')
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
  }): Promise<{ responseBodyBytesAudited: number; responseTruncatedByProxyBuffer: boolean; responseTruncatedByAuditLimit: boolean }> {
    
    const slice = params.bodyBuffer.subarray(0, params.maxAuditResponseBytes);
    const lostInProxyBuffer = params.totalBytes > params.bodyBuffer.length;
    const truncatedAudit = params.totalBytes > params.maxAuditResponseBytes || slice.length < params.totalBytes;
    const ext = String(params.contentType || '').includes('json') ? 'json' : 'bin';

    if (slice.length > 0) {
      await this.writeFileAtomic(path.join(params.requestDir, `response.body.${ext}`), slice);
      if (ext === 'json') {
        const parsed = this.redactService.tryParseJson(slice);
        if (parsed !== null) {
          await this.writeFormattedAndMarkdown(params.requestDir, 'response.body', parsed);
        }
      }
    }

    if (truncatedAudit || lostInProxyBuffer) {
       await this.writeFileAtomic(
          path.join(params.requestDir, 'response.body.omitted.txt'),
          Buffer.from([
            `Total bytes received from upstream: ${params.totalBytes}.`,
            `Bytes available in proxy buffer: ${params.bodyBuffer.length}.`,
            lostInProxyBuffer ? `Proxy buffer cap MAX_RESPONSE_BUFFER_BYTES=${params.maxBufferBytes}.` : '',
            truncatedAudit ? `Audit stored up to MAX_AUDIT_RESPONSE_BODY_BYTES=${params.maxAuditResponseBytes}.` : '',
          ].filter(Boolean).join(' '), 'utf8')
       );
    }

    return {
      responseBodyBytesAudited: slice.length,
      responseTruncatedByProxyBuffer: lostInProxyBuffer,
      responseTruncatedByAuditLimit: !lostInProxyBuffer && slice.length < params.totalBytes,
    };
  }

  /**
   * Persiste las cabeceras de respuesta (generado solo para respuestas SSE en paridad con el sistema legacy).
   */
  public async writeResponseHeadersAudit(requestDir: string, headers: any): Promise<void> {
    await this.writeJsonAtomic(path.join(requestDir, 'response.headers.json'), headers);
  }

  /**
   * Guarda el archivo final meta.json con todas las métricas de petición/respuesta.
   */
  public async writeMetaAtomic(requestDir: string, meta: AuditMetadata): Promise<void> {
    await this.writeJsonAtomic(path.join(requestDir, 'meta.json'), meta);
  }

  /**
   * Añade una línea de evento SSE capturada al log .jsonl.
   */
  public async appendSseLine(requestDir: string, lineObj: any): Promise<void> {
    const p = path.join(requestDir, 'response.sse.jsonl');
    const line = `${JSON.stringify(lineObj)}\n`;
    await fs.appendFile(p, line, 'utf8');
  }

  /**
   * Añade datos binarios crudos al volcado sse.txt.
   */
  public async appendSseRawChunk(requestDir: string, chunk: Buffer): Promise<void> {
    const p = path.join(requestDir, 'response.sse.txt');
    await fs.appendFile(p, chunk);
  }
}
