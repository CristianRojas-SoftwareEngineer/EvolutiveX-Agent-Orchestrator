import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import { RedactService } from '../1-domain/services/redact.service.js';
import { MarkdownRendererService } from '../1-domain/services/markdown-renderer.service.js';
import {
  InteractionState,
  SseLine,
  TurnMetadata,
} from '../1-domain/types/audit.types.js';
import { JsonValue } from '../1-domain/types/json.types.js';
import type { IAuditWriter } from './ports/audit-writer.port.js';

/**
 * Servicio encargado de la persistencia física de los logs de auditoría.
 */
export class AuditWriterService implements IAuditWriter {
  constructor(
    private redactService: RedactService,
    private markdownRendererService: MarkdownRendererService,
  ) {}

  public async writeFileAtomic(filePath: string, data: Buffer | string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, filePath);
  }

  public async writeJsonAtomic(filePath: string, obj: JsonValue): Promise<void> {
    return this.writeFileAtomic(filePath, Buffer.from(JSON.stringify(obj, null, 2), 'utf8'));
  }

  public async writeFormattedAndMarkdown(
    dir: string,
    baseName: string,
    parsed: JsonValue,
    type: 'request' | 'response',
  ): Promise<void> {
    await this.writeJsonAtomic(path.join(dir, `${baseName}.json`), parsed);
    try {
      const md =
        type === 'request'
          ? this.markdownRendererService.renderRequestBodyMarkdown(parsed)
          : this.markdownRendererService.renderResponseBodyMarkdown(parsed);
      await this.writeFileAtomic(
        path.join(dir, `${baseName}.parsed.md`),
        Buffer.from(`${md}\n`, 'utf8'),
      );
    } catch {
      /* ignorar error de markdown */
    }
  }

  /**
   * Inicializa el directorio de auditoría de la interacción y guarda los archivos del request top-level.
   * Con skipTopLevelRequest=true solo crea el directorio base (para preflights).
   */
  public async writeInteractionRequest(params: {
    baseDir: string;
    sessionId: string;
    folderName: string;
    headers: Record<string, string | string[] | undefined>;
    bodyBuffer: Buffer | null;
    maxAuditRequestBytes: number;
    skipTopLevelRequest?: boolean;
  }): Promise<{ dir: string; requestBodyOmitted: boolean }> {
    const dir = path.join(params.baseDir, params.sessionId, 'interactions', params.folderName);

    if (params.skipTopLevelRequest) {
      await fs.mkdir(dir, { recursive: true });
      return { dir, requestBodyOmitted: false };
    }

    const requestDir = path.join(dir, 'request');
    await fs.mkdir(requestDir, { recursive: true });
    await this.writeJsonAtomic(
      path.join(requestDir, 'headers.json'),
      params.headers as unknown as JsonValue,
    );

    const size = Buffer.isBuffer(params.bodyBuffer) ? params.bodyBuffer.length : 0;
    if (size === 0 || !params.bodyBuffer) {
      return { dir, requestBodyOmitted: false };
    }

    if (size <= params.maxAuditRequestBytes) {
      await this.writeFileAtomic(path.join(requestDir, 'body.bin'), params.bodyBuffer);
      const parsed = this.redactService.tryParseJson(params.bodyBuffer);
      if (parsed !== null) {
        await this.writeFormattedAndMarkdown(requestDir, 'body', parsed, 'request');
      }
      return { dir, requestBodyOmitted: false };
    }

    await this.writeFileAtomic(
      path.join(requestDir, 'body.omitted.txt'),
      Buffer.from(
        `Omitted: request body is ${size} bytes (limit MAX_AUDIT_REQUEST_BODY_BYTES=${params.maxAuditRequestBytes}).`,
        'utf8',
      ),
    );
    return { dir, requestBodyOmitted: true };
  }

  /**
   * Escribe el body del request en el directorio de un step específico.
   */
  public async writeStepRequest(params: {
    stepDir: string;
    headers: Record<string, string | string[] | undefined>;
    bodyBuffer: Buffer | null;
    maxAuditRequestBytes: number;
  }): Promise<void> {
    const requestDir = path.join(params.stepDir, 'request');
    await fs.mkdir(requestDir, { recursive: true });
    await this.writeJsonAtomic(
      path.join(requestDir, 'headers.json'),
      params.headers as unknown as JsonValue,
    );

    const size = Buffer.isBuffer(params.bodyBuffer) ? params.bodyBuffer.length : 0;
    if (size === 0 || !params.bodyBuffer) return;

    if (size <= params.maxAuditRequestBytes) {
      await this.writeFileAtomic(path.join(requestDir, 'body.bin'), params.bodyBuffer);
      const parsed = this.redactService.tryParseJson(params.bodyBuffer);
      if (parsed !== null) {
        await this.writeFormattedAndMarkdown(requestDir, 'body', parsed, 'request');
      }
      return;
    }

    await this.writeFileAtomic(
      path.join(requestDir, 'body.omitted.txt'),
      Buffer.from(
        `Omitted: request body is ${size} bytes (limit MAX_AUDIT_REQUEST_BODY_BYTES=${params.maxAuditRequestBytes}).`,
        'utf8',
      ),
    );
  }

  public async finalizeNonSseResponseAudit(params: {
    interactionDir: string;
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
    const responseDir = path.join(params.interactionDir, 'response');
    await fs.mkdir(responseDir, { recursive: true });

    const slice = params.bodyBuffer.subarray(0, params.maxAuditResponseBytes);
    const lostInProxyBuffer = params.totalBytes > params.bodyBuffer.length;
    const truncatedAudit =
      params.totalBytes > params.maxAuditResponseBytes || slice.length < params.totalBytes;
    const ext = String(params.contentType || '').includes('json') ? 'json' : 'bin';

    if (slice.length > 0) {
      await this.writeFileAtomic(path.join(responseDir, `body.${ext}`), slice);
      if (ext === 'json') {
        const parsed = this.redactService.tryParseJson(slice);
        if (parsed !== null) {
          await this.writeFormattedAndMarkdown(responseDir, 'body', parsed, 'response');
        }
      }
    }

    if (truncatedAudit || lostInProxyBuffer) {
      await this.writeFileAtomic(
        path.join(responseDir, 'body.omitted.txt'),
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

  public async finalizeNonSseResponseAuditOnStreamError(params: {
    interactionDir: string;
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
    const responseDir = path.join(params.interactionDir, 'response');
    await fs.mkdir(responseDir, { recursive: true });

    const slice = params.bodyBuffer.subarray(0, params.maxAuditResponseBytes);
    const lostInProxyBuffer = params.totalBytes > params.bodyBuffer.length;
    const truncatedAudit =
      params.totalBytes > params.maxAuditResponseBytes || slice.length < params.totalBytes;
    const ext = String(params.contentType || '').includes('json') ? 'json' : 'bin';

    if (slice.length > 0) {
      await this.writeFileAtomic(path.join(responseDir, `body.${ext}`), slice);
      if (ext === 'json') {
        const parsed = this.redactService.tryParseJson(slice);
        if (parsed !== null) {
          await this.writeFormattedAndMarkdown(responseDir, 'body', parsed, 'response');
        }
      }
    }

    await this.writeFileAtomic(
      path.join(responseDir, 'body.omitted.txt'),
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

  public async writeResponseHeadersAudit(
    interactionDir: string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    const responseDir = path.join(interactionDir, 'response');
    await fs.mkdir(responseDir, { recursive: true });
    await this.writeJsonAtomic(
      path.join(responseDir, 'headers.json'),
      headers as unknown as JsonValue,
    );
  }

  public async writeTurnMeta(interactionDir: string, meta: TurnMetadata): Promise<void> {
    await this.writeJsonAtomic(path.join(interactionDir, 'meta.json'), meta as unknown as JsonValue);
  }

  public appendSseLine(interactionDir: string, lineObj: SseLine): void {
    const responseDir = path.join(interactionDir, 'response');
    fsSync.mkdirSync(responseDir, { recursive: true });
    const p = path.join(responseDir, 'sse.jsonl');
    const line = `${JSON.stringify(lineObj)}\n`;
    fsSync.appendFileSync(p, line, 'utf8');
  }

  /**
   * Apéndice síncrono del raw dump `sse.txt` por step.
   *
   * Síncrono **intencionalmente** para preservar el orden de los chunks del
   * stream upstream. La versión async (`fs.appendFile` + `.catch`) introducía
   * una race condition entre chunks consecutivos que corrompía el orden en
   * disco. Nota: desde que la reconstrucción se basa en `sse.jsonl`, `sse.txt`
   * es solo un raw dump de depuración; aun así se mantiene ordenado para
   * paridad de protocolo (ver `docs/how-sse-reconstruction-works.md`).
   */
  public appendSseRawChunk(interactionDir: string, chunk: Buffer): void {
    const responseDir = path.join(interactionDir, 'response');
    fsSync.mkdirSync(responseDir, { recursive: true });
    const p = path.join(responseDir, 'sse.txt');
    fsSync.appendFileSync(p, chunk);
  }

  public async writeInteractionState(
    interactionDir: string,
    state: InteractionState,
  ): Promise<void> {
    await fs.mkdir(interactionDir, { recursive: true });
    await this.writeJsonAtomic(
      path.join(interactionDir, 'state.json'),
      state as unknown as JsonValue,
    );
  }

  public async removeInteractionState(interactionDir: string): Promise<void> {
    const p = path.join(interactionDir, 'state.json');
    try {
      await fs.unlink(p);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') {
        throw err;
      }
    }
  }

  /**
   * Escribe los archivos de respuesta reconstruida de un step SSE:
   * - body.json (mensaje completo, pretty print)
   * - body.parsed.md (vista markdown semántica)
   */
  public async writeStepResponseMarkdown(
    stepDir: string,
    message: JsonValue,
  ): Promise<void> {
    const responseDir = path.join(stepDir, 'response');
    await fs.mkdir(responseDir, { recursive: true });

    // body.json — mensaje reconstruido completo
    await this.writeJsonAtomic(
      path.join(responseDir, 'body.json'),
      message,
    );

    // body.parsed.md — vista markdown semántica
    const md = this.markdownRendererService.renderResponseBodyMarkdown(message);
    await this.writeFileAtomic(
      path.join(responseDir, 'body.parsed.md'),
      Buffer.from(`${md}\n`, 'utf8'),
    );
  }
}
