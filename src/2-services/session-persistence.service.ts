import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { IEventBus } from '../1-domain/repositories/IEventBus.js';
import type { TelemetryEvent } from '../1-domain/types/telemetry.types.js';
import type { Logger } from '../1-domain/types/logger.types.js';
import type { ISseReconstructor } from './ports/sse-reconstructor.port.js';
import type { MarkdownRendererService } from '../1-domain/services/markdown-renderer.service.js';
import { getWorkflowDir, slugifyToolName } from './session-routing.js';

/** Versión del layout de directorios proyectado por este servicio. */
const LAYOUT_VERSION = 'causal-workflows-v1';

/** Tope máximo de chunks por step (§33.8). */
const MAX_STREAMING_CHUNKS = 10_000;

/** Índice con zero-padding a 4 dígitos (para nombres de archivos de chunks). */
function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

/** Estado en disco que `SessionPersistence` mantiene por tool_use. */
interface ToolEntry {
  dir: string;
  meta: Record<string, unknown>;
}

/** Entrada en el índice workflow-sequence.json de una sesión. */
interface WorkflowSequenceEntry {
  workflowIndex: number;
  workflowId: string;
  startedAt: string;
  completedAt?: string;
  status: string;
}

/** Estado en disco que `SessionPersistence` mantiene por workflow. */
interface WorkflowEntry {
  sessionId: string;
  /** Índice numérico del workflow (para workflow-sequence.json). */
  workflowIndex: number;
  /** Directorio base del workflow (con `/` final). */
  baseDir: string;
  /** Contador local de tool_uses para asignar el índice KK. */
  toolCounter: number;
  /** tool_use.id → entrada de tool. */
  tools: Map<string, ToolEntry>;
  /** Metadata mutable del workflow; se reescribe en cada transición. */
  meta: Record<string, unknown>;
}

/**
 * Suscriptor del `EventBus` que proyecta los eventos del correlador y handlers
 * a disco bajo el layout `causal-workflows-v1` (`workflows/NN/steps/MM/tools/KK-slug/`).
 *
 * No conoce el correlador: toda la información proviene del payload de los eventos.
 * Las escrituras de un mismo archivo se serializan con un `writeQueue` por ruta
 * (escritura atómica: temp + rename). Los directorios se crean lazy.
 */
export class SessionPersistence {
  /** Próximo índice NN de workflow por sesión. */
  private readonly nextWorkflowIndex = new Map<string, number>();
  /** workflowId → estado del workflow. */
  private readonly workflows = new Map<string, WorkflowEntry>();
  /** sessionId → array de entradas del índice de workflows (mantenido en memoria). */
  private readonly workflowSequences = new Map<string, WorkflowSequenceEntry[]>();
  /** Cola de escritura por ruta de archivo (serialización). */
  private readonly writeQueue = new Map<string, Promise<void>>();
  /** Conjunto de escrituras en curso (para `flush()` en tests). */
  private readonly pending = new Set<Promise<void>>();

  /** Raíz bajo la cual se resuelven las rutas relativas `sessions/...`. */
  private readonly rootDir: string;
  private readonly logger?: Logger;
  private readonly sseReconstruct?: ISseReconstructor;
  private readonly markdownRenderer?: MarkdownRendererService;

  constructor(
    eventBus: IEventBus,
    opts: {
      rootDir?: string;
      logger?: Logger;
      sseReconstruct?: ISseReconstructor;
      markdownRenderer?: MarkdownRendererService;
    } = {},
  ) {
    this.rootDir = opts.rootDir ?? process.cwd();
    this.logger = opts.logger;
    this.sseReconstruct = opts.sseReconstruct;
    this.markdownRenderer = opts.markdownRenderer;
    eventBus.subscribe('workflow_start', (e) => this.onWorkflowStart(e));
    eventBus.subscribe('workflow_spawn', (e) => this.onWorkflowSpawn(e));
    eventBus.subscribe('step_request', (e) => this.onStepRequest(e));
    eventBus.subscribe('step_response', (e) => this.onStepResponse(e));
    eventBus.subscribe('tool_call', (e) => this.onToolCall(e));
    eventBus.subscribe('tool_result', (e) => this.onToolResult(e));
    eventBus.subscribe('workflow_complete', (e) => this.onWorkflowComplete(e));
    eventBus.subscribe('workflow_cancel', (e) => this.onWorkflowCancel(e));
    eventBus.subscribe('stream_chunk', (e) => this.onStreamChunk(e));
    eventBus.subscribe('*', (e) => this.onAnyEvent(e));
  }

  /** Espera a que todas las escrituras encoladas terminen (uso en tests). */
  public async flush(): Promise<void> {
    await Promise.all([...this.pending]);
  }

  // ── Handlers de eventos ────────────────────────────────────────────────────

  private onWorkflowStart(event: TelemetryEvent): void {
    const p = event.payload as {
      workflowId: string;
      kind?: string;
      request?: unknown;
      layoutIndex?: number;
    };
    const index =
      typeof p.layoutIndex === 'number' ? p.layoutIndex : this.allocWorkflowIndex(event.sessionId);
    const baseDir = getWorkflowDir(event.sessionId, index);
    const workflowKind = p.kind ?? 'main';
    const meta: Record<string, unknown> = {
      workflowId: p.workflowId,
      sessionId: event.sessionId,
      workflowKind,
      status: 'running',
      layoutVersion: LAYOUT_VERSION,
      startedAt: event.timestamp,
    };
    this.workflows.set(p.workflowId, {
      sessionId: event.sessionId,
      workflowIndex: index,
      baseDir,
      toolCounter: 0,
      tools: new Map(),
      meta,
    });
    this.writeMeta(baseDir, meta);
    if (p.request !== undefined) {
      this.writeJson(`${baseDir}request/body.json`, p.request);
    }
    // Actualizar workflow-sequence.json solo para workflows main
    if (workflowKind === 'main') {
      this.upsertWorkflowSequence(event.sessionId, p.workflowId, index, {
        startedAt: event.timestamp,
        status: 'running',
      });
    }
  }

  private onWorkflowSpawn(event: TelemetryEvent): void {
    const p = event.payload as {
      workflowId: string;
      parentWorkflowId: string;
      parentToolUseId: string;
      layoutIndex?: number;
      parentContext?: Record<string, unknown>;
      request?: unknown;
    };
    const baseDir = this.resolveSpawnBaseDir(
      event.sessionId,
      p.parentWorkflowId,
      p.parentToolUseId,
    );
    const meta: Record<string, unknown> = {
      workflowId: p.workflowId,
      sessionId: event.sessionId,
      workflowKind: 'subagent',
      parentWorkflowId: p.parentWorkflowId,
      parentToolUseId: p.parentToolUseId,
      status: 'running',
      layoutVersion: LAYOUT_VERSION,
      startedAt: event.timestamp,
      ...(p.parentContext ? { parentContext: p.parentContext } : {}),
    };
    this.workflows.set(p.workflowId, {
      sessionId: event.sessionId,
      workflowIndex: -1,
      baseDir,
      toolCounter: 0,
      tools: new Map(),
      meta,
    });
    this.writeMeta(baseDir, meta);
    if (p.request !== undefined) {
      this.writeJson(`${baseDir}request/body.json`, p.request);
    }
  }

  private onStepRequest(event: TelemetryEvent): void {
    const p = event.payload as { workflowId: string; stepIndex: number; request?: unknown };
    const entry = this.workflows.get(p.workflowId);
    if (!entry) return;
    if (p.request !== undefined) {
      const stepDir = this.stepDir(entry, p.stepIndex);
      this.writeJson(`${stepDir}request/body.json`, p.request);
    }
  }

  private onStepResponse(event: TelemetryEvent): void {
    const p = event.payload as {
      workflowId: string;
      stepIndex: number;
      response?: unknown;
      headers?: unknown;
      markdown?: string;
      coalescedDelegationStepIndex?: number;
    };
    const entry = this.workflows.get(p.workflowId);
    if (!entry) return;
    const responseDir = `${this.stepDir(entry, p.stepIndex)}response/`;
    if (p.response !== undefined) this.writeJson(`${responseDir}body.json`, p.response);
    if (p.headers !== undefined) this.writeJson(`${responseDir}headers.json`, p.headers);
    if (p.markdown !== undefined) this.writeText(`${responseDir}parsed.md`, p.markdown);

    // P2-g: generar vistas coalesced si el step es una continuation
    if (
      typeof p.coalescedDelegationStepIndex === 'number' &&
      this.sseReconstruct &&
      this.markdownRenderer
    ) {
      const contStepDir = this.stepDir(entry, p.stepIndex);
      const delegStepDir = this.stepDir(entry, p.coalescedDelegationStepIndex);
      const coalescedPromise = this.generateCoalescedView(
        contStepDir,
        delegStepDir,
        this.sseReconstruct,
        this.markdownRenderer,
      );
      this.pending.add(coalescedPromise);
      void coalescedPromise.finally(() => this.pending.delete(coalescedPromise));
    }
  }

  private async generateCoalescedView(
    contStepDir: string,
    delegStepDir: string,
    sseReconstruct: ISseReconstructor,
    markdownRenderer: MarkdownRendererService,
  ): Promise<void> {
    try {
      const delegMsg = await sseReconstruct.reconstructStepPhaseMessage(delegStepDir, 'delegation');
      const contMsg = await sseReconstruct.reconstructStepPhaseMessage(contStepDir, 'continuation');

      const body = {
        type: 'coalesced-agent-step-response',
        delegation: { message: delegMsg },
        continuation: { response: { message: contMsg } },
      };

      const responseDir = `${contStepDir}response/`;
      const bodyJson = Buffer.from(`${JSON.stringify(body, null, 2)}\n`, 'utf8');
      await this.atomicWrite(`${responseDir}body.coalesced.json`, bodyJson);

      const md = markdownRenderer.renderCoalescedAgentStepResponseMarkdown(
        delegMsg as unknown as import('../1-domain/types/json.types.js').JsonValue,
        null,
        contMsg as unknown as import('../1-domain/types/json.types.js').JsonValue,
        undefined,
      );
      await this.atomicWrite(
        `${responseDir}body.coalesced.parsed.md`,
        Buffer.from(`${md}\n`, 'utf8'),
      );
    } catch (err) {
      this.logger?.error({ err }, 'SessionPersistence: error generando vista coalesced');
    }
  }

  private onToolCall(event: TelemetryEvent): void {
    const p = event.payload as {
      workflowId: string;
      stepIndex: number;
      toolUseId: string;
      toolName: string;
      input: unknown;
    };
    const entry = this.workflows.get(p.workflowId);
    if (!entry) return;
    const toolIndex = entry.toolCounter++;
    const slug = slugifyToolName(p.toolName);
    const dir = `${this.stepDir(entry, p.stepIndex)}tools/${pad(toolIndex)}-${slug}/`;
    const meta: Record<string, unknown> = {
      toolUseId: p.toolUseId,
      toolName: p.toolName,
      status: 'running',
    };
    entry.tools.set(p.toolUseId, { dir, meta });
    this.writeJson(`${dir}input.json`, p.input);
    this.writeMeta(dir, meta);
  }

  private onToolResult(event: TelemetryEvent): void {
    const p = event.payload as {
      workflowId: string;
      toolUseId: string;
      result: { isError: boolean; result: unknown };
    };
    const entry = this.workflows.get(p.workflowId);
    if (!entry) return;
    const tool = entry.tools.get(p.toolUseId);
    if (!tool) return;
    this.writeJson(`${tool.dir}result.json`, p.result);
    tool.meta.status = p.result?.isError ? 'error' : 'completed';
    this.writeMeta(tool.dir, tool.meta);
  }

  private onWorkflowComplete(event: TelemetryEvent): void {
    const p = event.payload as {
      workflowId: string;
      result: unknown;
      outcome?: string;
      lostPendingAgents?: unknown;
      lostPendingWebSearch?: unknown;
      lostPendingWebFetch?: unknown;
      continuationOrphan?: boolean;
    };
    const entry = this.workflows.get(p.workflowId);
    if (!entry) return;
    const auditOutcome = p.outcome ?? (p.result as Record<string, unknown>)?.outcome;
    const finalStatus = auditOutcome === 'orphaned' ? 'orphaned' : 'completed';
    entry.meta.status = finalStatus;
    entry.meta.completedAt = event.timestamp;
    if (auditOutcome !== undefined) entry.meta.outcome = auditOutcome;
    if (p.lostPendingAgents !== undefined) entry.meta.lostPendingAgents = p.lostPendingAgents;
    if (p.lostPendingWebSearch !== undefined)
      entry.meta.lostPendingWebSearch = p.lostPendingWebSearch;
    if (p.lostPendingWebFetch !== undefined) entry.meta.lostPendingWebFetch = p.lostPendingWebFetch;
    if (p.continuationOrphan !== undefined) entry.meta.continuationOrphan = p.continuationOrphan;
    this.writeMeta(entry.baseDir, entry.meta);
    this.writeJson(`${entry.baseDir}output/result.json`, p.result);
    this.writeText(`${entry.baseDir}output/result.parsed.md`, this.renderResultMarkdown(p.result));
    if (entry.workflowIndex >= 0) {
      this.upsertWorkflowSequence(entry.sessionId, p.workflowId, entry.workflowIndex, {
        completedAt: event.timestamp,
        status: finalStatus,
      });
    }
  }

  private onWorkflowCancel(event: TelemetryEvent): void {
    const p = event.payload as { workflowId: string; cancellationReason?: string };
    const entry = this.workflows.get(p.workflowId);
    if (!entry) return;
    entry.meta.status = 'cancelled';
    entry.meta.completedAt = event.timestamp;
    if (p.cancellationReason !== undefined) entry.meta.cancellationReason = p.cancellationReason;
    this.writeMeta(entry.baseDir, entry.meta);
    if (entry.workflowIndex >= 0) {
      this.upsertWorkflowSequence(entry.sessionId, p.workflowId, entry.workflowIndex, {
        completedAt: event.timestamp,
        status: 'cancelled',
      });
    }
  }

  private onStreamChunk(event: TelemetryEvent): void {
    const p = event.payload as {
      seq: number;
      stepIndex: number;
      workflowId: string;
      chunk: { i: number; ts: string; line: string; phase?: string };
    };
    const entry = this.workflows.get(p.workflowId);
    if (!entry) return;
    if (p.seq > MAX_STREAMING_CHUNKS) return;

    // Filtrar pings: línea comentario SSE o evento de tipo ping
    const line = p.chunk.line;
    if (line.startsWith(': ping') || line.startsWith(':ping')) return;
    if (line.startsWith('data: ')) {
      try {
        const evt = JSON.parse(line.slice(6)) as Record<string, unknown>;
        if (evt.type === 'ping') return;
      } catch {
        /* no es JSON válido, no es ping */
      }
    }

    const chunkFile = `${this.stepDir(entry, p.stepIndex)}response/streaming/${pad4(p.seq)}-chunk.ndjson`;
    const lineData = JSON.stringify(p.chunk);
    this.enqueue(chunkFile, () =>
      this.atomicWrite(chunkFile, Buffer.from(`${lineData}\n`, 'utf8')),
    );
  }

  private onAnyEvent(event: TelemetryEvent): void {
    const eventsPath = `sessions/${event.sessionId}/events.ndjson`;
    const line = JSON.stringify(event);
    this.enqueue(eventsPath, () => this.appendLine(eventsPath, line));
  }

  // ── Helpers de routing ──────────────────────────────────────────────────────

  private allocWorkflowIndex(sessionId: string): number {
    const next = this.nextWorkflowIndex.get(sessionId) ?? 0;
    this.nextWorkflowIndex.set(sessionId, next + 1);
    return next;
  }

  private stepDir(entry: WorkflowEntry, stepIndex: number): string {
    return `${entry.baseDir}steps/${pad(stepIndex)}/`;
  }

  /**
   * Resuelve el directorio base de un sub-workflow: se anida bajo el directorio
   * del tool invocador del workflow padre. Si no se encuentra, cae a un
   * directorio de workflow nuevo (defensivo).
   */
  private resolveSpawnBaseDir(
    sessionId: string,
    parentWorkflowId: string,
    parentToolUseId: string,
  ): string {
    const parent = this.workflows.get(parentWorkflowId);
    const tool = parent?.tools.get(parentToolUseId);
    if (tool) return `${tool.dir}sub-agent/workflow/`;
    return getWorkflowDir(sessionId, this.allocWorkflowIndex(sessionId));
  }

  // ── workflow-sequence.json ──────────────────────────────────────────────────

  private upsertWorkflowSequence(
    sessionId: string,
    workflowId: string,
    workflowIndex: number,
    patch: Partial<WorkflowSequenceEntry>,
  ): void {
    let seq = this.workflowSequences.get(sessionId);
    if (!seq) {
      seq = [];
      this.workflowSequences.set(sessionId, seq);
    }
    const existing = seq.find((e) => e.workflowId === workflowId);
    if (existing) {
      Object.assign(existing, patch);
    } else {
      seq.push({
        workflowIndex,
        workflowId,
        startedAt: patch.startedAt ?? '',
        status: patch.status ?? 'running',
        ...(patch.completedAt ? { completedAt: patch.completedAt } : {}),
      });
    }
    const seqPath = `sessions/${sessionId}/workflows/workflow-sequence.json`;
    this.writeJson(seqPath, seq);
  }

  // ── Escritura serializada y atómica ─────────────────────────────────────────

  private writeMeta(dir: string, meta: Record<string, unknown>): void {
    // Snapshot del meta para evitar mutaciones posteriores antes de serializar.
    this.writeJson(`${dir}meta.json`, { ...meta });
  }

  private writeJson(filePath: string, data: unknown): void {
    this.enqueue(filePath, () =>
      this.atomicWrite(filePath, Buffer.from(`${JSON.stringify(data, null, 2)}\n`, 'utf8')),
    );
  }

  private writeText(filePath: string, text: string): void {
    this.enqueue(filePath, () => this.atomicWrite(filePath, Buffer.from(text, 'utf8')));
  }

  /** Encola una escritura serializada por ruta de archivo. */
  private enqueue(filePath: string, writeFn: () => Promise<void>): void {
    const prev = this.writeQueue.get(filePath) ?? Promise.resolve();
    const next = prev
      .then(() => writeFn())
      .catch((err: unknown) => {
        this.logger?.error({ err, filePath }, 'SessionPersistence: error de escritura');
      });
    this.writeQueue.set(filePath, next);
    this.pending.add(next);
    void next.finally(() => this.pending.delete(next));
  }

  /** Escritura atómica: escribir temp + rename. Resuelve `filePath` bajo `rootDir`. */
  private async atomicWrite(filePath: string, data: Buffer): Promise<void> {
    const abs = path.resolve(this.rootDir, filePath);
    const dir = path.dirname(abs);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${abs}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(tmp, data);
    try {
      await fs.rename(tmp, abs);
    } catch (err) {
      // En Windows, rename falla con EPERM si el destino está bloqueado por AV/indexador.
      // En Linux/macOS este catch nunca se activa (rename POSIX es atómico sin restricciones de lock).
      if ((err as NodeJS.ErrnoException).code !== 'EPERM') {
        await fs.unlink(tmp).catch(() => {});
        throw err;
      }
      let lastErr: unknown = err;
      for (let i = 1; i <= 3; i++) {
        await new Promise<void>((r) => setTimeout(r, 50 * i));
        try {
          await fs.rename(tmp, abs);
          lastErr = null;
          break;
        } catch (retryErr) {
          lastErr = retryErr;
        }
      }
      if (lastErr) {
        await fs.unlink(tmp).catch(() => {});
        throw lastErr;
      }
    }
  }

  /** Append serializado de una línea JSON a un archivo NDJSON (no atómico). */
  private async appendLine(filePath: string, line: string): Promise<void> {
    const abs = path.resolve(this.rootDir, filePath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.appendFile(abs, `${line}\n`, 'utf8');
  }

  // ── Formateadores ───────────────────────────────────────────────────────────

  /** Vista Markdown simple del `IWorkflowResult` (formateador básico P1). */
  private renderResultMarkdown(result: unknown): string {
    const r = (result ?? {}) as Record<string, unknown>;
    const lines: string[] = ['# Workflow result', ''];
    if (typeof r.outcome === 'string') lines.push(`**Outcome:** ${r.outcome}`, '');
    if (typeof r.finalText === 'string' && r.finalText.trim() !== '') {
      lines.push('## Final text', '', r.finalText, '');
    }
    lines.push('## Raw result', '', '```json', JSON.stringify(result, null, 2), '```', '');
    return lines.join('\n');
  }
}

/** Índice con zero-padding a 2 dígitos. */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}
