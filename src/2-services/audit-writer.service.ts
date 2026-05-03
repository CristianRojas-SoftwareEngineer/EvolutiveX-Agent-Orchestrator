import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import { RedactService } from '../1-domain/services/redact.service.js';
import { MarkdownRendererService } from '../1-domain/services/markdown-renderer.service.js';
import { InteractionState, SessionMetrics, SessionModelMetrics, SseLine, TurnMetadata } from '../1-domain/types/audit.types.js';
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
          ? this.markdownRendererService.renderRequestConversationMarkdown(parsed)
          : this.markdownRendererService.renderResponseConversationMarkdown(parsed);
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

    const requestBodyOmitted = await this.writeRequestPayload(
      dir,
      params.headers,
      params.bodyBuffer,
      params.maxAuditRequestBytes,
    );
    return { dir, requestBodyOmitted };
  }

  public async writeSubInteractionRequest(params: {
    parentInteractionDir: string;
    parentStepIndex: number;
    folderName: string;
    headers: Record<string, string | string[] | undefined>;
    bodyBuffer: Buffer | null;
    maxAuditRequestBytes: number;
  }): Promise<{ dir: string; requestBodyOmitted: boolean }> {
    const dir = path.join(
      params.parentInteractionDir,
      'steps',
      String(params.parentStepIndex).padStart(3, '0'),
      'sub-interactions',
      params.folderName,
    );
    const requestBodyOmitted = await this.writeRequestPayload(
      dir,
      params.headers,
      params.bodyBuffer,
      params.maxAuditRequestBytes,
    );
    return { dir, requestBodyOmitted };
  }

  public async nextSubInteractionSequence(
    parentInteractionDir: string,
    parentStepIndex: number,
  ): Promise<number> {
    const subDir = path.join(
      parentInteractionDir,
      'steps',
      String(parentStepIndex).padStart(3, '0'),
      'sub-interactions',
    );
    let max = 0;
    try {
      const entries = await fs.readdir(subDir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const m = /^(\d{6})_/.exec(e.name);
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
  ): Promise<boolean> {
    const requestDir = path.join(interactionDir, 'request');
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
        await this.writeFormattedAndMarkdown(requestDir, 'body', parsed, 'request');
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
    await this.writeJsonAtomic(
      path.join(interactionDir, 'meta.json'),
      meta as unknown as JsonValue,
    );
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
  public async writeStepResponseMarkdown(stepDir: string, message: JsonValue): Promise<void> {
    const responseDir = path.join(stepDir, 'response');
    await fs.mkdir(responseDir, { recursive: true });

    await this.writeJsonAtomic(path.join(responseDir, 'body.json'), message);

    const md = this.markdownRendererService.renderResponseConversationMarkdown(message);
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
  ): Promise<{ written: boolean; error?: string }> {
    const steps: Array<{ stepIndex: number; parsed: JsonValue }> = [];

    for (let i = 1; i <= stepCount; i++) {
      const stepBodyPath = path.join(
        interactionDir,
        'steps',
        String(i).padStart(3, '0'),
        'response',
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

    const responseDir = path.join(interactionDir, 'response');
    await fs.mkdir(responseDir, { recursive: true });

    try {
      const multiStepObj: JsonValue = {
        type: 'multi-step-response',
        stepCount,
        steps: steps.map((s) => ({
          stepIndex: s.stepIndex,
          ...(s.parsed as Record<string, JsonValue>),
        })),
      };
      await this.writeJsonAtomic(path.join(responseDir, 'body.json'), multiStepObj);

      const md = this.markdownRendererService.renderMultiStepResponseMarkdown(steps);
      await this.writeFileAtomic(
        path.join(responseDir, 'body.parsed.md'),
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
