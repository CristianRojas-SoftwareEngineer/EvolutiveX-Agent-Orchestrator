import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { AuditWriterService } from './audit-writer.service.js';
import { MarkdownRendererService } from '../1-domain/services/markdown-renderer.service.js';
import { SseReconstructOptions, SseReconstructResult } from '../1-domain/types/audit.types.js';
import type Anthropic from '@anthropic-ai/sdk';
import { JsonValue } from '../1-domain/types/json.types.js';
import type { ISseReconstructor } from './ports/sse-reconstructor.port.js';

const REPLAY_BASE_URL = 'https://api.anthropic.com';

/**
 * Placeholder para `params.model` al reutilizar el SDK de Anthropic como
 * parser de bytes SSE con `fetch` mockeado. Verificado empíricamente contra
 * @anthropic-ai/sdk v0.89.0: el SDK no valida este valor en runtime (acepta
 * cualquier string, incluido vacío, símbolos, unicode, null y undefined).
 * Solo existe para satisfacer la firma TypeScript `model: Model | string & {}`.
 * NO cambiar por un nombre de modelo real: puede inducir a error al lector.
 * Detalle en docs/how-sse-reconstruction-works.md.
 */
const REPLAY_MODEL = 'claude-sse-replay';

/**
 * Servicio para reconstruir el mensaje final de respuesta a partir del volcado
 * SSE grabado en disco. Lee `sse.jsonl` (orden determinista, escritura
 * síncrona) desde `stepDir/response/` y escribe el resultado en
 * `interactionDir/response/body.*`.
 */
export class SseReconstructService implements ISseReconstructor {
  constructor(
    private auditWriterService: AuditWriterService,
    private markdownRendererService: MarkdownRendererService,
  ) {}

  /**
   * Reconstruye un mensaje Anthropic desde el sse.jsonl de un step individual.
   * Usa el SDK oficial para parsear eventos SSE y ensamblar el mensaje.
   */
  public async reconstructStepMessage(
    stepDir: string,
  ): Promise<Anthropic.Message | Anthropic.Beta.Messages.BetaMessage> {
    const jsonlPath = path.join(stepDir, 'response', 'sse.jsonl');

    let jsonlBuffer: Buffer;
    try {
      jsonlBuffer = await fs.readFile(jsonlPath);
    } catch {
      throw new Error('response/sse.jsonl missing or unreadable');
    }

    if (!jsonlBuffer.length) {
      throw new Error('sse.jsonl empty');
    }

    let sseBuffer: Buffer;
    try {
      sseBuffer = this.reassembleSseBytesFromJsonl(jsonlBuffer);
    } catch (cause: unknown) {
      const errMsg = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`failed to reassemble SSE bytes from jsonl: ${errMsg}`, { cause });
    }

    if (!sseBuffer.length) {
      throw new Error('no SSE bytes to reconstruct');
    }

    // Detectar beta mode desde headers del step
    const headersPath = path.join(stepDir, 'response', 'headers.json');
    let useBeta = false;
    try {
      const headersRaw = await fs.readFile(headersPath, 'utf8');
      const headers = JSON.parse(headersRaw) as Record<string, unknown>;
      useBeta = headers['anthropic-beta'] !== undefined;
    } catch {
      // default false
    }

    return this.reconstructMessageFromSseBytes(sseBuffer, useBeta);
  }

  /**
   * Ejecuta la reconstrucción del cuerpo de respuesta a partir del volcado SSE
   * en disco.
   *
   * Lee desde `stepDir/response/sse.jsonl` — fuente de verdad ordenada, escrita
   * síncronamente por `AuditWriterService.appendSseLine`. NO se usa `sse.txt`
   * porque su captura es asíncrona y bajo ráfagas puede quedar con eventos
   * desordenados (ver `docs/how-sse-reconstruction-works.md`).
   *
   * Los flags `sseRawBytesWritten`/`sseRawTruncatedByLimit`/`sseRawWriteError`
   * de `opts` describen el estado de `sse.txt` (raw dump) y son puramente
   * informativos: no abortan la reconstrucción.
   */
  public async runReconstruction(opts: SseReconstructOptions): Promise<SseReconstructResult> {
    const { stepDir, interactionDir, originalUrl, headers } = opts;

    const useBeta = this.computeUseBeta(originalUrl, headers);

    // Escribir headers.json en el step para uso futuro de reconstructStepMessage
    const headersPath = path.join(stepDir, 'response', 'headers.json');
    await fs.mkdir(path.dirname(headersPath), { recursive: true });
    await fs.writeFile(
      headersPath,
      JSON.stringify({ 'anthropic-beta': useBeta ? 'true' : undefined }),
      'utf8',
    );

    let message: Anthropic.Message | Anthropic.Beta.Messages.BetaMessage;
    try {
      message = await this.reconstructStepMessage(stepDir);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        sseResponseBodyAttempted: false,
        sseResponseBodyWritten: false,
        sseResponseBodyError: errMsg,
      };
    }

    try {
      await this.writeSseReconstructedResponseBody(interactionDir, message);
      return {
        sseResponseBodyAttempted: true,
        sseResponseBodyWritten: true,
        sseResponseBodySource: 'file',
      };
    } catch (err: unknown) {
      try {
        await this.writeSseReconstructError(interactionDir, err);
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
   * Reensambla el wire-format SSE a partir de las líneas capturadas en
   * `sse.jsonl`. Cada entrada `{i, ts, line}` aporta una línea SSE ya trimada
   * (sin `\r` final, sin trailing newline). El SDK de Anthropic exige que los
   * eventos estén delimitados por línea en blanco (`\n\n`).
   *
   * Regla: cada línea se emite con `\n` final; además, cuando la siguiente
   * línea arranca un evento nuevo (`event:` o `data:` de un evento standalone
   * sin `event:` previo) o cuando hemos visto ya un `data:` en el evento
   * actual, inyectamos un `\n` extra para cerrar el bloque anterior.
   *
   * Esta heurística es equivalente al stream real emitido por upstream, y es
   * la que el SDK de Anthropic parsea sin quejas.
   */
  private reassembleSseBytesFromJsonl(jsonlBuffer: Buffer): Buffer {
    const text = jsonlBuffer.toString('utf8');
    const rawLines = text.split('\n');
    const events: string[] = [];
    let current: string[] = [];

    const flushCurrent = (): void => {
      if (current.length === 0) return;
      events.push(current.join('\n'));
      current = [];
    };

    for (const raw of rawLines) {
      if (raw.trim() === '') continue;
      let parsed: { line?: unknown };
      try {
        parsed = JSON.parse(raw) as { line?: unknown };
      } catch {
        continue;
      }
      const line = typeof parsed.line === 'string' ? parsed.line : '';
      if (!line) continue;

      if (line.startsWith('event:')) {
        flushCurrent();
        current.push(line);
        continue;
      }

      if (line.startsWith('data:')) {
        current.push(line);
        // En Anthropic cada evento trae exactamente un 'data:'. Tras registrarlo
        // cerramos el bloque para que el SDK reciba el delimitador correcto.
        flushCurrent();
        continue;
      }

      // Otros campos SSE (id:, retry:, comentarios ':...') se agregan al bloque
      // actual sin cerrarlo.
      current.push(line);
    }
    flushCurrent();

    if (events.length === 0) return Buffer.alloc(0);

    // Unir eventos con línea en blanco y terminar con '\n\n' final.
    const wire = `${events.join('\n\n')}\n\n`;
    return Buffer.from(wire, 'utf8');
  }

  private computeUseBeta(
    originalUrl?: string,
    headers?: Record<string, string | string[] | undefined>,
  ): boolean {
    const url = String(originalUrl || '');
    if (url.includes('beta=true')) return true;
    if (headers && headers['anthropic-beta']) return true;
    return false;
  }

  private async reconstructMessageFromSseBytes(
    sseBuffer: Buffer,
    useBeta: boolean,
  ): Promise<Anthropic.Message | Anthropic.Beta.Messages.BetaMessage> {
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
      model: REPLAY_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user' as const, content: ' ' }],
    };

    const stream = useBeta ? client.beta.messages.stream(params) : client.messages.stream(params);

    return stream.finalMessage();
  }

  private createSseWebReadableStream(buffer: Buffer): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(buffer));
        controller.close();
      },
    });
  }

  private async writeSseReconstructedResponseBody(
    interactionDir: string,
    message: Anthropic.Message | Anthropic.Beta.Messages.BetaMessage,
  ): Promise<void> {
    const responseDir = path.join(interactionDir, 'response');
    await fs.mkdir(responseDir, { recursive: true });
    const plain = JSON.parse(JSON.stringify(message));
    await this.auditWriterService.writeFileAtomic(
      path.join(responseDir, 'body.json'),
      Buffer.from(JSON.stringify(plain), 'utf8'),
    );
    await this.auditWriterService.writeFormattedAndMarkdown(
      responseDir,
      'body',
      plain as JsonValue,
      'response',
    );
  }

  private async writeSseReconstructError(interactionDir: string, err: unknown): Promise<void> {
    const responseDir = path.join(interactionDir, 'response');
    await fs.mkdir(responseDir, { recursive: true });
    const text =
      err instanceof Error && err.stack
        ? `${String(err.message)}\n${String(err.stack).slice(0, 8000)}`
        : String(err);
    await this.auditWriterService.writeFileAtomic(
      path.join(responseDir, 'body.reconstruct-error.txt'),
      Buffer.from(text, 'utf8'),
    );
  }
}
