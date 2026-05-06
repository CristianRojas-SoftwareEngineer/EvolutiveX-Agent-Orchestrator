import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { AuditWriterService } from './audit-writer.service.js';
import { SseReconstructOptions, SseReconstructResult, SsePhase } from '../1-domain/types/audit.types.js';
import type Anthropic from '@anthropic-ai/sdk';
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
  constructor(private auditWriterService: AuditWriterService) {}

  /**
   * Reconstruye un mensaje Anthropic desde el sse.jsonl de un step individual.
   * Usa el SDK oficial para parsear eventos SSE y ensamblar el mensaje.
   */
  public async reconstructStepMessage(
    stepDir: string,
  ): Promise<Anthropic.Message | Anthropic.Beta.Messages.BetaMessage> {
    const jsonlPath = path.join(stepDir, 'response', 'sse.jsonl');
    const headersPath = path.join(stepDir, 'response', 'headers.json');
    return this.reconstructSseJsonlFile(jsonlPath, headersPath);
  }

  public async reconstructSseJsonlFile(
    jsonlPath: string,
    headersPath?: string,
  ): Promise<Anthropic.Message | Anthropic.Beta.Messages.BetaMessage> {
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

    let useBeta = false;
    if (headersPath) {
      try {
        const headersRaw = await fs.readFile(headersPath, 'utf8');
        const headers = JSON.parse(headersRaw) as Record<string, unknown>;
        useBeta = headers['anthropic-beta'] !== undefined;
      } catch {
        // default false
      }
    }

    return this.reconstructMessageFromSseBytes(sseBuffer, useBeta);
  }

  public async reconstructSseJsonlPhaseMessage(
    jsonlPath: string,
    phase: SsePhase,
  ): Promise<Anthropic.Message> {
    let jsonlBuffer: Buffer;
    try {
      jsonlBuffer = await fs.readFile(jsonlPath);
    } catch {
      throw new Error('response/sse.jsonl missing or unreadable');
    }

    if (!jsonlBuffer.length) {
      throw new Error('sse.jsonl empty');
    }

    return this.reconstructMessageFromSseJsonlPhase(jsonlBuffer, phase);
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
    const { stepDir, interactionDir, stepCount, originalUrl, headers } = opts;

    const useBeta = this.computeUseBeta(originalUrl, headers);

    // Escribir headers.json en el step para uso futuro de reconstructStepMessage
    const headersPath = path.join(stepDir, 'response', 'headers.json');
    await fs.mkdir(path.dirname(headersPath), { recursive: true });
    await fs.writeFile(
      headersPath,
      JSON.stringify({ 'anthropic-beta': useBeta ? 'true' : undefined }),
      'utf8',
    );

    try {
      const result = await this.auditWriterService.writeTopLevelMultiStepResponse(
        interactionDir,
        stepCount,
        opts.context,
      );
      return {
        sseResponseBodyAttempted: true,
        sseResponseBodyWritten: result.written,
        sseResponseBodyError: result.error,
        sseResponseBodySource: result.written ? 'file' : undefined,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        sseResponseBodyAttempted: true,
        sseResponseBodyWritten: false,
        sseResponseBodyError: errMsg,
      };
    }
  }

  /**
   * Reensambla el wire-format SSE a partir de las líneas capturadas en
   * `sse.jsonl`. Cada entrada `{i, ts, line, phase?}` aporta una línea SSE ya trimada
   * (sin `\r` final, sin trailing newline). El SDK de Anthropic exige que los
   * eventos estén delimitados por línea en blanco (`\n\n`).
   *
   * Cuando se especifica `phase`, filtra las líneas para incluir solo las de esa fase,
   * permitiendo reconstruir separadamente la delegación inicial y la respuesta final
   * en steps coalesced de Agent.
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
      let parsed: { line?: unknown; phase?: SsePhase };
      try {
        parsed = JSON.parse(raw) as { line?: unknown; phase?: SsePhase };
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

  private reconstructMessageFromSseJsonlPhase(jsonlBuffer: Buffer, phase: SsePhase): Anthropic.Message {
    const text = jsonlBuffer.toString('utf8');
    const rawLines = text.split('\n');
    const events: unknown[] = [];

    for (const raw of rawLines) {
      if (raw.trim() === '') continue;
      let parsed: { line?: unknown; phase?: SsePhase };
      try {
        parsed = JSON.parse(raw) as { line?: unknown; phase?: SsePhase };
      } catch {
        continue;
      }

      // Filtrar por fase
      if (parsed.phase !== undefined && parsed.phase !== phase) {
        continue;
      }

      // Parsear solo líneas data: como eventos
      const line = typeof parsed.line === 'string' ? parsed.line : '';
      if (!line.startsWith('data: ')) continue;

      try {
        const evt = JSON.parse(line.slice(6)) as unknown;
        events.push(evt);
      } catch {
        // Ignorar líneas data: que no son JSON válido
      }
    }

    return this.buildMessageFromEvents(events);
  }

  private buildMessageFromEvents(events: unknown[]): Anthropic.Message {
    const message: Partial<Anthropic.Message> = {
      id: 'unknown',
      type: 'message',
      role: 'assistant',
      content: [],
      model: 'unknown',
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      } as Anthropic.Usage,
    };

    // Mapas para acumular contenido por índice
    const contentBlocks = new Map<number, Anthropic.ContentBlock>();
    const textAccumulators = new Map<number, string>();
    const thinkingAccumulators = new Map<number, string>();
    const toolInputAccumulators = new Map<number, string>();

    for (const evt of events) {
      if (typeof evt !== 'object' || evt === null) continue;
      const event = evt as Record<string, unknown>;

      if (event.type === 'message_start' && event.message) {
        const msg = event.message as Record<string, unknown>;
        if (typeof msg.id === 'string') message.id = msg.id;
        if (typeof msg.model === 'string') message.model = msg.model;
        if (msg.usage && message.usage) {
          const usage = msg.usage as Record<string, unknown>;
          if (typeof usage.input_tokens === 'number') message.usage.input_tokens = usage.input_tokens;
          if (typeof usage.output_tokens === 'number') message.usage.output_tokens = usage.output_tokens;
        }
      }

      if (event.type === 'content_block_start' && typeof event.index === 'number') {
        const block = event.content_block as Record<string, unknown>;
        if (block.type === 'text') {
          contentBlocks.set(event.index, { type: 'text', text: '', citations: [] });
          textAccumulators.set(event.index, '');
        } else if (block.type === 'thinking') {
          contentBlocks.set(event.index, { type: 'thinking', thinking: '', signature: '' });
          thinkingAccumulators.set(event.index, '');
        } else if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
          contentBlocks.set(event.index, {
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: {},
          } as Anthropic.ContentBlock);
          toolInputAccumulators.set(event.index, '');
        }
      }

      if (event.type === 'content_block_delta' && typeof event.index === 'number') {
        const delta = event.delta as Record<string, unknown>;
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          const acc = textAccumulators.get(event.index);
          if (acc !== undefined) textAccumulators.set(event.index, acc + delta.text);
        } else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          const acc = thinkingAccumulators.get(event.index);
          if (acc !== undefined) thinkingAccumulators.set(event.index, acc + delta.thinking);
        } else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          const acc = toolInputAccumulators.get(event.index);
          if (acc !== undefined) toolInputAccumulators.set(event.index, acc + delta.partial_json);
        }
      }

      if (event.type === 'content_block_stop' && typeof event.index === 'number') {
        // Consolidar bloque
        const block = contentBlocks.get(event.index);
        if (!block) continue;

        if (block.type === 'text') {
          const acc = textAccumulators.get(event.index) || '';
          block.text = acc;
        } else if (block.type === 'thinking') {
          const acc = thinkingAccumulators.get(event.index) || '';
          block.thinking = acc;
        } else if (block.type === 'tool_use') {
          const acc = toolInputAccumulators.get(event.index) || '';
          // El JSON acumulado debe ser parseado solo si es válido
          try {
            const parsed = JSON.parse(acc) as Record<string, unknown>;
            block.input = parsed;
          } catch {
            // Si el JSON no es válido, dejar input como el string acumulado o vacío
            block.input = acc.length > 0 ? acc : {};
          }
        }
      }

      if (event.type === 'message_delta') {
        if (event.delta) {
          const delta = event.delta as Record<string, unknown>;
          if (delta.stop_reason) {
            message.stop_reason = delta.stop_reason as Anthropic.Message['stop_reason'];
          }
        }
        if (event.usage && message.usage) {
          const usage = event.usage as Record<string, unknown>;
          if (typeof usage.output_tokens === 'number') message.usage.output_tokens = usage.output_tokens;
        }
      }
    }

    // Convertir Map a array de content blocks
    message.content = Array.from(contentBlocks.values()).sort((_a, _b) => {
      // Ordenar por índice de aparición (no tenemos índice explícito, usamos el orden del Map)
      return 0;
    });

    return message as Anthropic.Message;
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
}
