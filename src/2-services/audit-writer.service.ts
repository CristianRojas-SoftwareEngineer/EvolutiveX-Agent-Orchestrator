import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import { RedactService } from '../1-domain/services/redact.service.js';
import { MarkdownRendererService } from '../1-domain/services/markdown-renderer.service.js';
import {
  InteractionState,
  InteractionMetadata,
  MarkdownRenderContext,
  SessionMetrics,
  SessionModelMetrics,
  SseLine,
  SubagentSummary,
  SubagentsSummary,
  CoalescedAgentStepResponse,
} from '../1-domain/types/audit.types.js';
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

  public async writeInteractionMeta(
    interactionDir: string,
    meta: InteractionMetadata,
  ): Promise<void> {
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
    const p = stepDir.endsWith('.txt') ? stepDir : path.join(stepDir, DIR_STEP_RESPONSE, 'sse.txt');
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

  /**
   * Extrae el texto final de un mensaje Anthropic desde JSON semántico.
   * Soporta mensajes normales, multi-step-response y coalesced-agent-step-response.
   * Retorna null si no se puede extraer texto significativo.
   */
  public extractFinalTextFromJson(parsed: JsonValue): string | null {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    const obj = parsed as Record<string, JsonValue>;

    // Caso 1: coalesced-agent-step-response - extraer de continuation.response.message
    if (obj.type === 'coalesced-agent-step-response') {
      const coalesced = obj as unknown as CoalescedAgentStepResponse;
      return this.extractFinalTextFromJson(coalesced.continuation.response.message);
    }

    // Caso 2: multi-step-response - extraer del último step
    if (obj.type === 'multi-step-response' && Array.isArray(obj.steps) && obj.steps.length > 0) {
      const lastStep = obj.steps[obj.steps.length - 1];
      return this.extractFinalTextFromJson(lastStep);
    }

    // Caso 3: mensaje normal Anthropic - extraer el último bloque text
    if (Array.isArray(obj.content)) {
      const content = obj.content;
      let lastText = '';
      for (const block of content) {
        if (block && typeof block === 'object' && !Array.isArray(block)) {
          const b = block as Record<string, JsonValue>;
          if (b.type === 'text' && typeof b.text === 'string') {
            lastText = b.text;
          }
        }
      }
      return lastText || null;
    }

    return null;
  }

  /**
   * Extrae resúmenes de subagentes desde los directorios sub-agent-NN bajo el step padre.
   * Usa `parentContext.correlationStatus` para determinar si la correlación está resuelta.
   * Si `correlationStatus` es 'unresolved', no infiere por orden y deja toolUseId null.
   */
  private async extractSubagentsSummary(
    stepDir: string,
    initialMessage: JsonValue,
    _toolUseIds: string[],
  ): Promise<SubagentsSummary | null> {
    try {
      // Listar directorios sub-agent-NN directamente desde stepDir
      const entries = await fs.readdir(stepDir, { withFileTypes: true });
      const subAgentDirs = entries
        .filter((e) => e.isDirectory() && e.name.startsWith(PREFIX_SUB_AGENT))
        .sort((a, b) => a.name.localeCompare(b.name));

      if (subAgentDirs.length === 0) {
        return null;
      }

      // Extraer tool_use Agent del mensaje de delegación
      const agentToolUses: Array<{
        id: string;
        description: string;
        prompt: string;
        subagentType: string | null;
      }> = [];
      if (initialMessage && typeof initialMessage === 'object' && !Array.isArray(initialMessage)) {
        const msg = initialMessage as Record<string, JsonValue>;
        if (msg.content && Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block && typeof block === 'object' && !Array.isArray(block)) {
              const contentBlock = block as Record<string, JsonValue>;
              if (
                contentBlock.type === 'tool_use' &&
                contentBlock.name === 'Agent' &&
                contentBlock.input
              ) {
                const input = contentBlock.input as Record<string, JsonValue>;
                agentToolUses.push({
                  id: String(contentBlock.id || ''),
                  description: String(input.description || ''),
                  prompt: String(input.prompt || ''),
                  subagentType: input.subagent_type ? String(input.subagent_type) : null,
                });
              }
            }
          }
        }
      }

      const subagents: SubagentSummary[] = [];
      let completedCount = 0;
      let failedCount = 0;
      let orphanedCount = 0;
      let totalDurationMs = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      for (let i = 0; i < subAgentDirs.length; i++) {
        const dirName = subAgentDirs[i].name;
        const subAgentDir = path.join(stepDir, dirName);
        const metaPath = path.join(subAgentDir, 'meta.json');
        const outputPath = path.join(dirName, 'output', 'body.parsed.md');

        // Leer meta.json del subagente
        let meta: InteractionMetadata | null = null;
        try {
          const raw = await fs.readFile(metaPath, 'utf8');
          meta = JSON.parse(raw) as InteractionMetadata;
        } catch {
          // Si falla la lectura, marcar como unknown
        }

        // Determinar outcome
        let outcome: SubagentSummary['outcome'] = 'unknown';
        if (meta) {
          if (meta.outcome === 'completed') outcome = 'completed';
          else if (
            meta.outcome === 'client-error' ||
            meta.outcome === 'upstream-error' ||
            meta.outcome === 'truncated'
          )
            outcome = 'client-error';
          else if (meta.outcome === 'orphaned') outcome = 'orphaned';
        }

        // Correlacionar con tool_use Agent usando correlationStatus
        let toolUseId: string | null = null;
        let inferredByOrder = false;
        if (meta?.parentContext?.triggeringToolUseId) {
          toolUseId = meta.parentContext.triggeringToolUseId;
          // No marcar inferredByOrder cuando correlationStatus es 'resolved'
          inferredByOrder = false;
        } else if (meta?.parentContext?.correlationStatus === 'unresolved') {
          // No inferir por orden cuando la correlación está explícitamente no resuelta
          toolUseId = null;
          inferredByOrder = false;
        } else if (i < agentToolUses.length) {
          // Correlación por orden solo para legacy sin correlationStatus
          toolUseId = agentToolUses[i].id;
          inferredByOrder = true;
        }

        // Obtener datos del tool_use Agent
        const agentToolUse = toolUseId
          ? agentToolUses.find((t) => t.id === toolUseId) ||
            (i < agentToolUses.length ? agentToolUses[i] : null)
          : null;

        // Extraer métricas
        const durationMs = meta?.durationMs || 0;
        const stepCount = meta?.stepCount || 0;
        const toolCalls = meta?.steps?.flatMap((s) => s.toolCalls || []) || [];
        const inputTokens = meta?.totals?.inputTokens || 0;
        const outputTokens = meta?.totals?.outputTokens || 0;
        const finalStopReason = meta?.steps?.[meta.steps.length - 1]?.stopReason || null;

        // Extraer preview de respuesta final desde JSON semántico
        let finalResponsePreview: string | null = null;
        if (meta?.outcome === 'completed') {
          try {
            const outputJsonPath = path.join(subAgentDir, 'output', 'body.json');
            const outputRaw = await fs.readFile(outputJsonPath, 'utf8');
            const outputParsed = JSON.parse(outputRaw) as JsonValue;
            const finalText = this.extractFinalTextFromJson(outputParsed);
            if (finalText) {
              // Tomar primeras 200 caracteres del texto final real
              finalResponsePreview = finalText.slice(0, 200).trim();
              if (finalText.length > 200) finalResponsePreview += '...';
            }
          } catch {
            // Fallback a body.parsed.md si JSON no está disponible
            try {
              const outputParsedPath = path.join(subAgentDir, 'output', 'body.parsed.md');
              const outputRaw = await fs.readFile(outputParsedPath, 'utf8');
              finalResponsePreview = outputRaw.slice(0, 200).trim();
              if (outputRaw.length > 200) finalResponsePreview += '...';
            } catch {
              finalResponsePreview = null;
            }
          }
        }

        // Acumular totales
        if (outcome === 'completed') completedCount++;
        else if (outcome === 'client-error') failedCount++;
        else if (outcome === 'orphaned') orphanedCount++;
        totalDurationMs += durationMs;
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;

        subagents.push({
          index: i + 1,
          dirName,
          toolUseId,
          inferredByOrder,
          description: agentToolUse?.description || '',
          prompt: agentToolUse?.prompt || '',
          subagentType: agentToolUse?.subagentType || null,
          outcome,
          durationMs,
          stepCount,
          toolCalls,
          inputTokens,
          outputTokens,
          finalStopReason,
          finalResponsePreview,
          outputPath,
        });
      }

      return {
        items: subagents,
        count: subagents.length,
        completedCount,
        failedCount,
        orphanedCount,
        totalDurationMs,
        totalInputTokens,
        totalOutputTokens,
      };
    } catch {
      // Best-effort: si falla la extracción, retornar null en vez de romper la reconstrucción
      return null;
    }
  }

  public async writeCoalescedAgentStepResponse(params: {
    stepDir: string;
    initialMessage: JsonValue;
    continuationRequest: JsonValue | null;
    continuationHeaders?: Record<string, string | string[] | undefined>;
    finalMessage: JsonValue;
    toolUseIds: string[];
    subagentsSummary?: JsonValue;
    context?: MarkdownRenderContext;
  }): Promise<void> {
    const responseDir = path.join(params.stepDir, DIR_STEP_RESPONSE);
    await fs.mkdir(responseDir, { recursive: true });

    // Eliminar sse.txt si existe para steps coalesced (solo sse.jsonl es canónico)
    const sseTxtPath = path.join(responseDir, 'sse.txt');
    try {
      await fs.unlink(sseTxtPath);
    } catch {
      // El archivo puede no existir, ignorar error
    }

    // Extraer resumen de subagentes si no se proporcionó explícitamente
    const subagentsSummary: SubagentsSummary | null = params.subagentsSummary
      ? (params.subagentsSummary as unknown as SubagentsSummary)
      : await this.extractSubagentsSummary(
          params.stepDir,
          params.initialMessage,
          params.toolUseIds,
        );

    const body: JsonValue = {
      type: 'coalesced-agent-step-response',
      delegation: {
        message: params.initialMessage,
      },
      continuation: {
        request: {
          body: params.continuationRequest,
          ...(params.continuationHeaders ? { headers: params.continuationHeaders } : {}),
        },
        response: {
          message: params.finalMessage,
        },
      },
      toolUseIds: params.toolUseIds,
      ...(subagentsSummary ? { subagents: subagentsSummary as unknown as JsonValue } : {}),
    };

    await this.writeJsonAtomic(path.join(responseDir, 'body.json'), body);

    const md = this.markdownRendererService.renderCoalescedAgentStepResponseMarkdown(
      params.initialMessage,
      params.continuationRequest,
      params.finalMessage,
      subagentsSummary || undefined,
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
    totals: Pick<
      SessionModelMetrics,
      'inputTokens' | 'cacheReadInputTokens' | 'cacheCreationInputTokens' | 'outputTokens'
    >,
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
