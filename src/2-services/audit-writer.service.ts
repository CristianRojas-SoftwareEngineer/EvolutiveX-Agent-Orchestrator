import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import { RedactService } from '../1-domain/services/redact.service.js';
import { MarkdownRendererService } from '../1-domain/services/markdown-renderer.service.js';
import { InteractionState, InteractionMetadata, MarkdownRenderContext, SessionMetrics, SessionModelMetrics, SseLine } from '../1-domain/types/audit.types.js';
import { JsonValue } from '../1-domain/types/json.types.js';
import type { IAuditWriter } from './ports/audit-writer.port.js';
import {
  DIR_INPUT,
  DIR_OUTPUT,
  DIR_STEPS,
  DIR_STEP_REQUEST,
  DIR_STEP_RESPONSE,
  DIR_STEP_THOUGHT,
  PREFIX_SUB_AGENT,
  PAD_STEP,
  PAD_SUB_AGENT,
} from '../1-domain/constants/audit-paths.js';

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
    context?: MarkdownRenderContext,
  ): Promise<void> {
    await this.writeJsonAtomic(path.join(dir, `${baseName}.json`), parsed);
    try {
      const md =
        type === 'request'
          ? this.markdownRendererService.renderRequestConversationMarkdown(parsed, context)
          : this.markdownRendererService.renderResponseConversationMarkdown(parsed, context);
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
    interactionDir: string;
    headers: Record<string, string | string[] | undefined>;
    bodyBuffer: Buffer | null;
    maxAuditRequestBytes: number;
    skipTopLevelRequest?: boolean;
    context?: MarkdownRenderContext;
  }): Promise<{ requestBodyOmitted: boolean }> {
    if (params.skipTopLevelRequest) {
      await fs.mkdir(params.interactionDir, { recursive: true });
      return { requestBodyOmitted: false };
    }

    const requestBodyOmitted = await this.writeRequestPayload(
      params.interactionDir,
      params.headers,
      params.bodyBuffer,
      params.maxAuditRequestBytes,
      params.context,
    );
    return { requestBodyOmitted };
  }

  public async writeSubInteractionRequest(params: {
    parentInteractionDir: string;
    parentStepIndex: number;
    folderName: string;
    headers: Record<string, string | string[] | undefined>;
    bodyBuffer: Buffer | null;
    maxAuditRequestBytes: number;
    context?: MarkdownRenderContext;
  }): Promise<{ dir: string; requestBodyOmitted: boolean }> {
    const dir = path.join(
      params.parentInteractionDir,
      DIR_STEPS,
      String(params.parentStepIndex).padStart(PAD_STEP, '0'),
      params.folderName,
    );
    const requestBodyOmitted = await this.writeRequestPayload(
      dir,
      params.headers,
      params.bodyBuffer,
      params.maxAuditRequestBytes,
      params.context,
    );
    return { dir, requestBodyOmitted };
  }

  public async writeCoalescedAgentContinuationRequest(params: {
    stepDir: string;
    headers: Record<string, string | string[] | undefined>;
    bodyBuffer: Buffer | null;
    maxAuditRequestBytes: number;
    context?: MarkdownRenderContext;
  }): Promise<void> {
    const responseDir = path.join(params.stepDir, DIR_STEP_RESPONSE);
    await fs.mkdir(responseDir, { recursive: true });
    await this.writeJsonAtomic(
      path.join(responseDir, 'continuation.request.headers.json'),
      params.headers as unknown as JsonValue,
    );

    const body = params.bodyBuffer ?? Buffer.alloc(0);
    await this.writeFileAtomic(
      path.join(responseDir, 'continuation.request.body.bin'),
      body.subarray(0, params.maxAuditRequestBytes),
    );

    if (body.length > params.maxAuditRequestBytes) {
      await this.writeFileAtomic(
        path.join(responseDir, 'continuation.request.body.omitted.txt'),
        Buffer.from(
          `Request body omitted after ${params.maxAuditRequestBytes} bytes. Original bytes: ${body.length}.`,
          'utf8',
        ),
      );
      return;
    }

    try {
      const parsed = body.length ? JSON.parse(body.toString('utf8')) as JsonValue : null;
      await this.writeFormattedAndMarkdown(
        responseDir,
        'continuation.request.body',
        parsed,
        'request',
        params.context,
      );
    } catch {
      await this.writeFileAtomic(
        path.join(responseDir, 'continuation.request.body.raw.txt'),
        body,
      );
    }
  }

  public async nextSubInteractionSequence(
    parentInteractionDir: string,
    parentStepIndex: number,
  ): Promise<number> {
    const stepDir = path.join(
      parentInteractionDir,
      DIR_STEPS,
      String(parentStepIndex).padStart(PAD_STEP, '0'),
    );
    let max = 0;
    try {
      const entries = await fs.readdir(stepDir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const m = new RegExp(`^${PREFIX_SUB_AGENT}-(\\d{${PAD_SUB_AGENT}})$`).exec(e.name);
        if (m) {
          const n = parseInt(m[1], 10);
          if (!Number.isNaN(n)) max = Math.max(max, n);
        }
      }
    } catch {
      /* directorio inexistente: secuencia arranca en 1 */
    }
    return max + 1;
  }

  /**
   * Helper interno: escribe `request/headers.json`, `request/body.bin` y los
   * derivados markdown si el body cabe en el límite. Devuelve si el body fue
   * omitido por exceder el tamaño máximo.
   */
  private async writeRequestPayload(
    interactionDir: string,
    headers: Record<string, string | string[] | undefined>,
    bodyBuffer: Buffer | null,
    maxAuditRequestBytes: number,
    context?: MarkdownRenderContext,
  ): Promise<boolean> {
    const requestDir = path.join(interactionDir, DIR_INPUT);
    await fs.mkdir(requestDir, { recursive: true });
    await this.writeJsonAtomic(
      path.join(requestDir, 'headers.json'),
      headers as unknown as JsonValue,
    );

    const size = Buffer.isBuffer(bodyBuffer) ? bodyBuffer.length : 0;
    if (size === 0 || !bodyBuffer) {
      return false;
    }

    if (size <= maxAuditRequestBytes) {
      await this.writeFileAtomic(path.join(requestDir, 'body.bin'), bodyBuffer);
      const parsed = this.redactService.tryParseJson(bodyBuffer);
      if (parsed !== null) {
        await this.writeFormattedAndMarkdown(requestDir, 'body', parsed, 'request', context);
      }
      return false;
    }

    await this.writeFileAtomic(
      path.join(requestDir, 'body.omitted.txt'),
      Buffer.from(
        `Omitted: request body is ${size} bytes (limit MAX_AUDIT_REQUEST_BODY_BYTES=${maxAuditRequestBytes}).`,
        'utf8',
      ),
    );
    return true;
  }

  /**
   * Escribe el body del request en el directorio de un step específico.
   */
  public async writeStepRequest(params: {
    stepDir: string;
    headers: Record<string, string | string[] | undefined>;
    bodyBuffer: Buffer | null;
    maxAuditRequestBytes: number;
    context?: MarkdownRenderContext;
  }): Promise<void> {
    const requestDir = path.join(params.stepDir, DIR_STEP_REQUEST);
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
        await this.writeFormattedAndMarkdown(requestDir, 'body', parsed, 'request', params.context);
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
    const responseDir = path.join(params.interactionDir, DIR_STEP_RESPONSE);
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
    const responseDir = path.join(params.interactionDir, DIR_STEP_RESPONSE);
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

  public async writeTopLevelResponseHeaders(
    interactionDir: string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    const outputDir = path.join(interactionDir, DIR_OUTPUT);
    await fs.mkdir(outputDir, { recursive: true });
    await this.writeJsonAtomic(
      path.join(outputDir, 'headers.json'),
      headers as unknown as JsonValue,
    );
  }

  public async writeResponseHeadersAudit(
    stepDir: string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    const responseDir = path.join(stepDir, DIR_STEP_RESPONSE);
    await fs.mkdir(responseDir, { recursive: true });
    await this.writeJsonAtomic(
      path.join(responseDir, 'headers.json'),
      headers as unknown as JsonValue,
    );
  }

  public async writeStepThought(stepDir: string, thinkingBlocks: string[]): Promise<void> {
    if (thinkingBlocks.length === 0) return;
    const thoughtDir = path.join(stepDir, DIR_STEP_THOUGHT);
    await fs.mkdir(thoughtDir, { recursive: true });
    const content = thinkingBlocks.join('\n\n---\n\n');
    await this.writeFileAtomic(
      path.join(thoughtDir, 'content.md'),
      Buffer.from(`${content}\n`, 'utf8'),
    );
  }

  public async writeInteractionMeta(interactionDir: string, meta: InteractionMetadata): Promise<void> {
    await this.writeJsonAtomic(
      path.join(interactionDir, 'meta.json'),
      meta as unknown as JsonValue,
    );
  }

  public appendSseLine(stepDir: string, lineObj: SseLine): void {
    const p = stepDir.endsWith('.jsonl')
      ? stepDir
      : path.join(stepDir, DIR_STEP_RESPONSE, 'sse.jsonl');
    fsSync.mkdirSync(path.dirname(p), { recursive: true });
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
  public appendSseRawChunk(stepDir: string, chunk: Buffer): void {
    const p = stepDir.endsWith('.txt')
      ? stepDir
      : path.join(stepDir, DIR_STEP_RESPONSE, 'sse.txt');
    fsSync.mkdirSync(path.dirname(p), { recursive: true });
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
    context?: MarkdownRenderContext,
  ): Promise<void> {
    const responseDir = path.join(stepDir, DIR_STEP_RESPONSE);
    await fs.mkdir(responseDir, { recursive: true });

    await this.writeJsonAtomic(path.join(responseDir, 'body.json'), message);

    const md = this.markdownRendererService.renderResponseConversationMarkdown(message, context);
    await this.writeFileAtomic(
      path.join(responseDir, 'body.parsed.md'),
      Buffer.from(`${md}\n`, 'utf8'),
    );
  }

  public async writeCoalescedAgentStepResponse(params: {
    stepDir: string;
    initialMessage: JsonValue;
    continuationRequest: JsonValue | null;
    finalMessage: JsonValue;
    context?: MarkdownRenderContext;
  }): Promise<void> {
    const responseDir = path.join(params.stepDir, DIR_STEP_RESPONSE);
    await fs.mkdir(responseDir, { recursive: true });

    const body: JsonValue = {
      type: 'coalesced-agent-step-response',
      initial: params.initialMessage,
      continuationRequest: params.continuationRequest,
      final: params.finalMessage,
    };

    await this.writeJsonAtomic(path.join(responseDir, 'body.json'), body);

    const md = this.markdownRendererService.renderCoalescedAgentStepResponseMarkdown(
      params.initialMessage,
      params.continuationRequest,
      params.finalMessage,
      params.context,
    );
    await this.writeFileAtomic(
      path.join(responseDir, 'body.parsed.md'),
      Buffer.from(`${md}\n`, 'utf8'),
    );
  }

  /**
   * Lee los body.json de cada step y escribe en el top-level de la interacción:
   * - response/body.json  (objeto multi-step-response con todos los steps)
   * - response/body.parsed.md  (markdown con secciones por step)
   */
  public async writeTopLevelMultiStepResponse(
    interactionDir: string,
    stepCount: number,
    context?: MarkdownRenderContext,
  ): Promise<{ written: boolean; error?: string }> {
    const steps: Array<{ stepIndex: number; parsed: JsonValue }> = [];

    for (let i = 1; i <= stepCount; i++) {
      const stepBodyPath = path.join(
        interactionDir,
        DIR_STEPS,
        String(i).padStart(PAD_STEP, '0'),
        DIR_STEP_RESPONSE,
        'body.json',
      );
      try {
        const raw = await fs.readFile(stepBodyPath, 'utf8');
        steps.push({ stepIndex: i, parsed: JSON.parse(raw) as JsonValue });
      } catch {
        // step body ausente — omitir (best-effort)
      }
    }

    if (steps.length === 0) {
      return { written: false, error: 'no step bodies found' };
    }

    const outputDir = path.join(interactionDir, DIR_OUTPUT);
    await fs.mkdir(outputDir, { recursive: true });

    try {
      const multiStepObj: JsonValue = {
        type: 'multi-step-response',
        stepCount,
        steps: steps.map((s) => ({
          stepIndex: s.stepIndex,
          ...(s.parsed as Record<string, JsonValue>),
        })),
      };
      await this.writeJsonAtomic(path.join(outputDir, 'body.json'), multiStepObj);

      const md = this.markdownRendererService.renderMultiStepResponseMarkdown(steps, context);
      await this.writeFileAtomic(
        path.join(outputDir, 'body.parsed.md'),
        Buffer.from(`${md}\n`, 'utf8'),
      );

      return { written: true };
    } catch (err: unknown) {
      return { written: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  public async updateSessionMetrics(
    sessionDir: string,
    modelId: string,
    totals: Pick<SessionModelMetrics, 'inputTokens' | 'cacheReadInputTokens' | 'cacheCreationInputTokens' | 'outputTokens'>,
    stepCount: number,
  ): Promise<void> {
    const filePath = path.join(sessionDir, 'session-metrics.json');

    let data: SessionMetrics = { models: {} };
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      data = JSON.parse(raw) as SessionMetrics;
    } catch {
      // ENOENT o parse error → empezar desde cero
    }

    const existing = data.models[modelId] ?? {
      count: 0,
      inputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      outputTokens: 0,
    };

    data.models[modelId] = {
      count: existing.count + stepCount,
      inputTokens: existing.inputTokens + totals.inputTokens,
      cacheReadInputTokens: existing.cacheReadInputTokens + totals.cacheReadInputTokens,
      cacheCreationInputTokens: existing.cacheCreationInputTokens + totals.cacheCreationInputTokens,
      outputTokens: existing.outputTokens + totals.outputTokens,
    };

    await this.writeJsonAtomic(filePath, data as unknown as JsonValue);
  }
}
