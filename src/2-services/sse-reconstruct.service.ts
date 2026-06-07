import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import {
  SseReconstructOptions,
  SseReconstructResult,
  SsePhase,
  MarkdownRenderContext,
} from '../1-domain/types/audit.types.js';
import type { JsonValue } from '../1-domain/types/json.types.js';
import type Anthropic from '@anthropic-ai/sdk';
import type { ISseReconstructor } from './ports/sse-reconstructor.port.js';
import type { MarkdownRendererService } from '../1-domain/services/markdown-renderer.service.js';

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
 * Servicio para reconstruir mensajes Anthropic desde chunks SSE persistidos.
 * Lee `stepDir/response/streaming/*.ndjson` como fuente canónica (P2+).
 */
export class SseReconstructService implements ISseReconstructor {
  constructor(private readonly markdownRenderer?: MarkdownRendererService) {}

  /**
   * Reconstruye un mensaje Anthropic desde los chunks streaming/ de un step.
   * Lee `stepDir/response/streaming/*.ndjson` ordenados por nombre como fuente
   * canónica. Mantiene compatibilidad de firma con la interfaz `ISseReconstructor`.
   */
  public async reconstructStepMessage(
    stepDir: string,
  ): Promise<Anthropic.Message | Anthropic.Beta.Messages.BetaMessage> {
    const responseDir = path.join(stepDir, 'response');
    const headersPath = path.join(responseDir, 'headers.json');
    const jsonlBuffer = await this.readChunksAsJsonl(responseDir);
    if (!jsonlBuffer.length) {
      throw new Error('streaming/ vacío o no encontrado en ' + responseDir);
    }
    this.validateCompleteSseJsonl(jsonlBuffer);
    const sseBuffer = this.reassembleSseBytesFromJsonl(jsonlBuffer);
    if (!sseBuffer.length) {
      throw new Error('no SSE bytes to reconstruct');
    }
    let useBeta = false;
    try {
      const headersRaw = await fs.readFile(headersPath, 'utf8');
      const headers = JSON.parse(headersRaw) as Record<string, unknown>;
      useBeta = headers['anthropic-beta'] !== undefined;
    } catch {
      /* default false */
    }
    return this.reconstructMessageFromSseBytes(sseBuffer, useBeta);
  }

  /**
   * Reconstruye un mensaje Anthropic filtrando por fase desde los chunks
   * streaming/ de un step. Fuente: `stepDir/response/streaming/*.ndjson`.
   */
  public async reconstructStepPhaseMessage(
    stepDir: string,
    phase: SsePhase,
  ): Promise<Anthropic.Message> {
    const responseDir = path.join(stepDir, 'response');
    const jsonlBuffer = await this.readChunksAsJsonl(responseDir);
    if (!jsonlBuffer.length) {
      throw new Error('streaming/ vacío o no encontrado en ' + responseDir);
    }
    return this.reconstructMessageFromSseJsonlPhase(jsonlBuffer, phase);
  }

  /** Lee todos los archivos `streaming/*.ndjson` ordenados y los concatena en un buffer JSONL. */
  private async readChunksAsJsonl(responseDir: string): Promise<Buffer> {
    const streamingDir = path.join(responseDir, 'streaming');
    let fileNames: string[];
    try {
      const entries = await fs.readdir(streamingDir, { withFileTypes: true });
      fileNames = entries
        .filter((e) => e.isFile() && e.name.endsWith('.ndjson'))
        .map((e) => e.name)
        .sort();
    } catch {
      return Buffer.alloc(0);
    }
    const lines: string[] = [];
    for (const name of fileNames) {
      try {
        const content = await fs.readFile(path.join(streamingDir, name), 'utf8');
        const trimmed = content.trim();
        if (trimmed) lines.push(trimmed);
      } catch {
        /* ignorar archivo ilegible */
      }
    }
    if (lines.length === 0) return Buffer.alloc(0);
    return Buffer.from(`${lines.join('\n')}\n`, 'utf8');
  }

  public async reconstructSseJsonlFile(
    jsonlPath: string,
    headersPath?: string,
  ): Promise<Anthropic.Message | Anthropic.Beta.Messages.BetaMessage> {
    let jsonlBuffer: Buffer;
    try {
      jsonlBuffer = await fs.readFile(jsonlPath);
    } catch {
      throw new Error('JSONL source missing or unreadable');
    }

    if (!jsonlBuffer.length) {
      throw new Error('JSONL source empty');
    }

    // Validar que el archivo contenga exactamente un mensaje completo
    this.validateCompleteSseJsonl(jsonlBuffer);

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
      throw new Error('JSONL source missing or unreadable');
    }

    if (!jsonlBuffer.length) {
      throw new Error('JSONL source empty');
    }

    return this.reconstructMessageFromSseJsonlPhase(jsonlBuffer, phase);
  }

  /**
   * Agrega los body.json de cada step y escribe la vista multi-step-response en
   * `interactionDir/output/body.json` y `.parsed.md`.
   */
  public async runReconstruction(opts: SseReconstructOptions): Promise<SseReconstructResult> {
    const { workflowDir, stepCount } = opts;
    try {
      const result = await this.writeTopLevelMultiStepResponse(
        workflowDir,
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

  /** Lee los body.json de cada step (1-based) y escribe la vista top-level. */
  private async writeTopLevelMultiStepResponse(
    workflowDir: string,
    stepCount: number,
    context?: MarkdownRenderContext,
  ): Promise<{ written: boolean; error?: string }> {
    const steps: Array<{ stepIndex: number; parsed: JsonValue }> = [];

    for (let i = 1; i <= stepCount; i++) {
      const stepBodyPath = path.join(
        workflowDir,
        'steps',
        String(i).padStart(2, '0'),
        'response',
        'body.json',
      );
      try {
        const raw = await fs.readFile(stepBodyPath, 'utf8');
        steps.push({ stepIndex: i, parsed: JSON.parse(raw) as JsonValue });
      } catch {
        // step body ausente — best-effort
      }
    }

    if (steps.length === 0) {
      return { written: false, error: 'no step bodies found' };
    }

    const outputDir = path.join(workflowDir, 'output');
    await fs.mkdir(outputDir, { recursive: true });

    const multiStepObj: JsonValue = {
      type: 'multi-step-response',
      stepCount,
      steps: steps.map((s) => ({
        stepIndex: s.stepIndex,
        ...(s.parsed as Record<string, JsonValue>),
      })),
    };

    const bodyPath = path.join(outputDir, 'body.json');
    const tmp = `${bodyPath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(multiStepObj, null, 2), 'utf8');
    await fs.rename(tmp, bodyPath);

    if (this.markdownRenderer) {
      try {
        const md = this.markdownRenderer.renderMultiStepResponseMarkdown(steps, context);
        const mdPath = path.join(outputDir, 'body.parsed.md');
        const mdTmp = `${mdPath}.${process.pid}.${Date.now()}.tmp`;
        await fs.writeFile(mdTmp, `${md}\n`, 'utf8');
        await fs.rename(mdTmp, mdPath);
      } catch {
        /* ignorar error de markdown */
      }
    }

    return { written: true };
  }

  /**
   * Valida que el buffer JSONL contenga exactamente un mensaje completo
   * (un message_start y un message_stop). Lanza error si detecta múltiples
   * mensajes o un stream incompleto. Esta validación previene que el SDK de
   * Anthropic reciba streams multi-mensaje concatenados por colisiones de
   * concurrencia en steps internos (WebSearch/WebFetch).
   */
  private validateCompleteSseJsonl(jsonlBuffer: Buffer): void {
    const text = jsonlBuffer.toString('utf8');
    const rawLines = text.split('\n');
    let messageStartCount = 0;
    let messageStopCount = 0;

    for (const raw of rawLines) {
      if (raw.trim() === '') continue;
      let parsed: { line?: unknown };
      try {
        parsed = JSON.parse(raw) as { line?: unknown };
      } catch {
        continue;
      }

      const line = typeof parsed.line === 'string' ? parsed.line : '';
      if (!line.startsWith('data: ')) continue;

      try {
        const evt = JSON.parse(line.slice(6)) as Record<string, unknown>;
        if (evt.type === 'message_start') {
          messageStartCount += 1;
        } else if (evt.type === 'message_stop') {
          messageStopCount += 1;
        }
      } catch {
        // Ignorar líneas data: que no son JSON válido
      }
    }

    if (messageStartCount > 1) {
      throw new Error('JSONL contiene múltiples mensajes completos (múltiples message_start)');
    }

    if (messageStartCount === 0) {
      throw new Error('JSONL no contiene message_start');
    }

    if (messageStopCount === 0) {
      throw new Error('JSONL incompleto: falta message_stop');
    }
  }

  /**
   * Reensambla el wire-format SSE a partir de un buffer JSONL.
   * Cada entrada `{i, ts, line, phase?}` aporta una línea SSE ya trimada
   * (sin `\r` final, sin trailing newline). El SDK de Anthropic exige que los
   * eventos estén delimitados por línea en blanco (`\n\n`).
   *
   * Este método solo se usa para streams completos (no filtrados por fase).
   * Para reconstrucción por fase (delegation/continuation en steps coalesced),
   * se usa `reconstructMessageFromSseJsonlPhase` que parsea eventos directamente
   * sin pasar por el SDK de Anthropic.
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

  private reconstructMessageFromSseJsonlPhase(
    jsonlBuffer: Buffer,
    phase: SsePhase,
  ): Anthropic.Message {
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
          if (typeof usage.input_tokens === 'number')
            message.usage.input_tokens = usage.input_tokens;
          if (typeof usage.output_tokens === 'number')
            message.usage.output_tokens = usage.output_tokens;
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
        } else if (
          block.type === 'tool_use' &&
          typeof block.id === 'string' &&
          typeof block.name === 'string'
        ) {
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
          if (typeof usage.output_tokens === 'number')
            message.usage.output_tokens = usage.output_tokens;
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
