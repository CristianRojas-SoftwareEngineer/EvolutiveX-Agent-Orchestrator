import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import { RedactService } from '../1-domain/services/redact.service.js';
import { MarkdownRendererService } from '../1-domain/services/markdown-renderer.service.js';
import {
  InteractionMetadata,
  MarkdownRenderContext,
  ParentContext,
  SseLine,
  SubagentSummary,
  SubagentsSummary,
  CoalescedAgentStepResponse,
} from '../1-domain/types/audit.types.js';
import { JsonValue } from '../1-domain/types/json.types.js';
import type { ISseAuditWriter } from './ports/sse-audit-writer.port.js';
import {
  DIR_OUTPUT,
  DIR_STEPS,
  DIR_STEP_REQUEST,
  DIR_STEP_RESPONSE,
  DIR_STEP_THOUGHT,
  PAD_STEP,
} from '../1-domain/constants/audit-paths.js';

/**
 * Servicio encargado de la persistencia física de los logs de auditoría.
 */
/** @deprecated-p2 Escrituras SSE y reconstrucción; reemplazar por suscripción a `stream_chunk` en P2. */
export class AuditWriterService implements ISseAuditWriter {
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
        `Omitted: request body is ${size} bytes (limit MAX_AUDIT_BYTES=${params.maxAuditRequestBytes}).`,
        'utf8',
      ),
    );
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
   * Extrae resúmenes de subagentes bajo stepDir/tools/…/sub-agent/workflow/ (layout causal).
   * Prefiere parentToolUseId / parentContext del meta sobre correlación FIFO por orden.
   */
  private async extractSubagentsSummary(
    stepDir: string,
    initialMessage: JsonValue,
    _toolUseIds: string[],
  ): Promise<SubagentsSummary | null> {
    try {
      const toolsDir = path.join(stepDir, 'tools');
      let toolDirNames: string[] = [];
      try {
        const entries = await fs.readdir(toolsDir, { withFileTypes: true });
        toolDirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
      } catch {
        return null;
      }

      const subWorkflows: Array<{ toolDirName: string; workflowDir: string }> = [];
      for (const toolDirName of toolDirNames) {
        const workflowDir = path.join(toolsDir, toolDirName, 'sub-agent', 'workflow');
        try {
          const st = await fs.stat(workflowDir);
          if (st.isDirectory()) {
            subWorkflows.push({ toolDirName, workflowDir });
          }
        } catch {
          /* sin sub-workflow en este tool */
        }
      }

      if (subWorkflows.length === 0) {
        return null;
      }

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

      for (let i = 0; i < subWorkflows.length; i++) {
        const { toolDirName, workflowDir } = subWorkflows[i];
        const dirName = path.join('tools', toolDirName, 'sub-agent', 'workflow');
        const metaPath = path.join(workflowDir, 'meta.json');
        const resultPath = path.join(workflowDir, 'output', 'result.json');
        const outputPath = path.join(dirName, 'output', 'result.json');

        let meta: Record<string, unknown> | null = null;
        try {
          const raw = await fs.readFile(metaPath, 'utf8');
          meta = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          /* meta ausente */
        }

        let result: Record<string, unknown> | null = null;
        try {
          const raw = await fs.readFile(resultPath, 'utf8');
          result = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          /* result ausente */
        }

        const legacyMeta = meta as InteractionMetadata | null;
        const parentCtx = (meta?.parentContext ?? legacyMeta?.parentContext) as
          | ParentContext
          | undefined;

        const outcome = this.mapSubagentOutcome(meta, result);

        let toolUseId: string | null = null;
        let inferredByOrder = false;
        const parentToolUseId =
          typeof meta?.parentToolUseId === 'string' ? meta.parentToolUseId : null;
        if (parentToolUseId) {
          toolUseId = parentToolUseId;
        } else if (parentCtx?.triggeringToolUseId) {
          toolUseId = parentCtx.triggeringToolUseId;
        } else if (parentCtx?.correlationStatus === 'unresolved') {
          toolUseId = null;
        } else if (i < agentToolUses.length) {
          toolUseId = agentToolUses[i].id;
          inferredByOrder = true;
        }

        const agentToolUse = toolUseId
          ? agentToolUses.find((t) => t.id === toolUseId) ||
            (i < agentToolUses.length ? agentToolUses[i] : null)
          : null;

        const durationMs = this.durationMsFromMeta(meta);
        const stepCount =
          typeof result?.stepCount === 'number'
            ? result.stepCount
            : legacyMeta?.stepCount || 0;
        const toolCalls = legacyMeta?.steps?.flatMap((s) => s.toolCalls || []) || [];
        const usage = (result?.usage ?? {}) as Record<string, number | undefined>;
        const inputTokens = usage.input_tokens ?? legacyMeta?.totals?.inputTokens ?? 0;
        const outputTokens = usage.output_tokens ?? legacyMeta?.totals?.outputTokens ?? 0;
        const finalStopReason = legacyMeta?.steps?.[legacyMeta.steps.length - 1]?.stopReason ?? null;

        let finalResponsePreview: string | null = null;
        if (outcome === 'completed') {
          const finalText =
            typeof result?.finalText === 'string'
              ? result.finalText
              : result
                ? this.extractFinalTextFromJson(result as JsonValue)
                : null;
          if (finalText) {
            finalResponsePreview = finalText.slice(0, 200).trim();
            if (finalText.length > 200) finalResponsePreview += '...';
          } else {
            try {
              const mdPath = path.join(workflowDir, 'output', 'result.parsed.md');
              const mdRaw = await fs.readFile(mdPath, 'utf8');
              finalResponsePreview = mdRaw.slice(0, 200).trim();
              if (mdRaw.length > 200) finalResponsePreview += '...';
            } catch {
              finalResponsePreview = null;
            }
          }
        }

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
      return null;
    }
  }

  private mapSubagentOutcome(
    meta: Record<string, unknown> | null,
    result: Record<string, unknown> | null,
  ): SubagentSummary['outcome'] {
    const raw = String(meta?.outcome ?? result?.outcome ?? meta?.status ?? '');
    if (raw === 'completed' || raw === 'success') return 'completed';
    if (raw === 'orphaned') return 'orphaned';
    if (
      raw === 'client-error' ||
      raw === 'upstream-error' ||
      raw === 'truncated' ||
      raw === 'api_error' ||
      raw === 'failed'
    ) {
      return 'client-error';
    }
    return 'unknown';
  }

  private durationMsFromMeta(meta: Record<string, unknown> | null): number {
    if (!meta) return 0;
    if (typeof meta.durationMs === 'number') return meta.durationMs;
    const started = typeof meta.startedAt === 'string' ? Date.parse(meta.startedAt) : NaN;
    const ended = typeof meta.completedAt === 'string' ? Date.parse(meta.completedAt) : NaN;
    if (!Number.isNaN(started) && !Number.isNaN(ended) && ended >= started) {
      return ended - started;
    }
    return 0;
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

}
