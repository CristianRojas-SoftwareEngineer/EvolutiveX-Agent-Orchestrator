import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { AuditWriterService } from './audit-writer.service.js';
import { MarkdownRendererService } from './markdown-renderer.service.js';
import { SseReconstructOptions, SseReconstructResult } from '../interfaces/audit.interface.js';
import { JsonValue } from '../interfaces/json.interface.js';

/** URL base utilizada internamente para el SDK durante el replay. */
const REPLAY_BASE_URL = 'https://api.anthropic.com';

/**
 * Servicio para reconstruir el mensaje final de respuesta a partir de bytes SSE grabados.
 * Utiliza `@anthropic-ai/sdk` con un `fetch` simulado para replayar los bytes SSE
 * a través del parser nativo del SDK, portado desde `sse-reconstruct-body.js`.
 */
export class SseReconstructService {
  constructor(
    private auditWriterService: AuditWriterService,
    private markdownRendererService: MarkdownRendererService,
    private replayModel: string,
  ) {}

  /**
   * Ejecuta la reconstrucción del cuerpo de respuesta desde el volcado SSE en disco.
   * Escribe `response.body.json`, `response.body.formatted.json` y `response.body.parsed.md`.
   */
  public async runReconstruction(opts: SseReconstructOptions): Promise<SseReconstructResult> {
    const {
      requestDir,
      originalUrl,
      headers,
      forceBeta,
      sseRawBytesWritten,
      auditSseRaw,
      sseRawTruncatedByLimit,
      sseRawWriteError,
      requireRaw,
    } = opts;

    const ssePath = path.join(requestDir, 'response.sse.txt');

    const useBeta = this.computeUseBeta(originalUrl, headers, forceBeta);

    // Verificar precondiciones
    if (requireRaw && !auditSseRaw) {
      return { sseResponseBodyAttempted: false, sseResponseBodyWritten: false };
    }

    if (!auditSseRaw || !sseRawBytesWritten) {
      return { sseResponseBodyAttempted: false, sseResponseBodyWritten: false };
    }

    if (sseRawTruncatedByLimit || sseRawWriteError) {
      return { sseResponseBodyAttempted: false, sseResponseBodyWritten: false };
    }

    // Leer el volcado SSE crudo del disco
    let sseBuffer: Buffer;
    try {
      sseBuffer = await fs.readFile(ssePath);
    } catch {
      return {
        sseResponseBodyAttempted: false,
        sseResponseBodyWritten: false,
        sseResponseBodyError: 'response.sse.txt missing or unreadable',
      };
    }

    if (!sseBuffer.length) {
      return { sseResponseBodyAttempted: false, sseResponseBodyWritten: false };
    }

    try {
      const message = await this.reconstructMessageFromSseBytes(sseBuffer, useBeta);
      await this.writeSseReconstructedResponseBody(requestDir, message);
      return {
        sseResponseBodyAttempted: true,
        sseResponseBodyWritten: true,
        sseResponseBodySource: 'file',
      };
    } catch (err: unknown) {
      try {
        await this.writeSseReconstructError(requestDir, err);
      } catch {
        /* error al escribir el error — no bloquear */
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        sseResponseBodyAttempted: true,
        sseResponseBodyWritten: false,
        sseResponseBodyError: errMsg,
        sseResponseBodySource: 'file',
      };
    }
  }

  /**
   * Detecta si debe usarse la API beta basándose en la URL original o cabeceras.
   */
  private computeUseBeta(
    originalUrl?: string,
    headers?: Record<string, string | string[] | undefined>,
    forceBeta?: boolean,
  ): boolean {
    if (forceBeta) return true;
    const url = String(originalUrl || '');
    if (url.includes('beta=true')) return true;
    if (headers && headers['anthropic-beta']) return true;
    return false;
  }

  /**
   * Ensambla el Message final desde bytes SSE usando el parser del SDK en streaming.
   */
  private async reconstructMessageFromSseBytes(
    sseBuffer: Buffer,
    useBeta: boolean,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    // Importación dinámica para evitar fallo si @anthropic-ai/sdk no está instalado

    // Importación dinámica para compatibilidad con Native ESM
    const { default: Anthropic } = await import('@anthropic-ai/sdk');

    const mockFetch = async () =>
      new Response(this.createSseWebReadableStream(sseBuffer), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });

    const client = new Anthropic({
      apiKey: 'sse-audit-replay',
      fetch: mockFetch,
      baseURL: REPLAY_BASE_URL,
    });

    const params = {
      model: this.replayModel,
      max_tokens: 1024,
      messages: [{ role: 'user', content: ' ' }],
    };

    const stream = useBeta
      ? client.beta.messages.stream(params as any)
      : client.messages.stream(params as any);

    return stream.finalMessage();
  }

  /**
   * Envuelve un Buffer en un Web ReadableStream compatible con la API de Fetch/Response.
   */
  private createSseWebReadableStream(buffer: Buffer): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(buffer));
        controller.close();
      },
    });
  }

  /**
   * Escribe el cuerpo reconstruido del mensaje en los archivos estándar de auditoría.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async writeSseReconstructedResponseBody(requestDir: string, message: any): Promise<void> {
    const plain = JSON.parse(JSON.stringify(message));
    await this.auditWriterService.writeFileAtomic(
      path.join(requestDir, 'response.body.json'),
      Buffer.from(JSON.stringify(plain), 'utf8'),
    );
    await this.auditWriterService.writeFormattedAndMarkdown(
      requestDir,
      'response.body',
      plain as JsonValue,
      'response',
    );
  }

  /**
   * Escribe un archivo con los detalles del error de reconstrucción para diagnóstico.
   */
  private async writeSseReconstructError(requestDir: string, err: unknown): Promise<void> {
    const text =
      err instanceof Error && err.stack
        ? `${String(err.message)}\n${String(err.stack).slice(0, 8000)}`
        : String(err);
    await this.auditWriterService.writeFileAtomic(
      path.join(requestDir, 'response.body.reconstruct-error.txt'),
      Buffer.from(text, 'utf8'),
    );
  }
}
