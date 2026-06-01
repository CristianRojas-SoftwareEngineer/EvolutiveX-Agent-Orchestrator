import type { AgentContext } from '../1-domain/types/audit.types.js';
import type { ClaudeHookEvent } from '../1-domain/types/hook.types.js';
import type {
  IWorkflowRepository,
  OpenSubagentWorkflowOptions,
  OpenWorkflowOptions,
  WireSubagentEntry,
  WireWorkflowMeta,
} from '../1-domain/repositories/IWorkflowRepository.js';
import type { IWorkflow } from '../1-domain/interfaces/gateway/IWorkflow.js';
import type { IStep } from '../1-domain/interfaces/gateway/IStep.js';
import type { IToolUse } from '../1-domain/interfaces/gateway/IToolUse.js';
import type { IWorkflowResult } from '../1-domain/interfaces/gateway/IWorkflowResult.js';
import type { IEventBus } from '../1-domain/repositories/IEventBus.js';
import type { WorkflowOutcome } from '../1-domain/types/gateway/workflow.types.js';
import { Workflow } from '../1-domain/models/gateway/Workflow.js';
import { buildWorkflowResult } from '../1-domain/services/gateway/build-workflow-result.js';

export class WorkflowRepositoryService implements IWorkflowRepository {
  // Índice wire (C1/C2/C3): agentId → WireSubagentEntry
  private readonly index = new Map<string, WireSubagentEntry>();
  // Índice de lifecycle (G2): workflowId → Workflow
  private readonly workflows = new Map<string, Workflow>();
  // Pendientes de correlación: workflowId → (toolUseId → { stepId, toolUse })
  private readonly pendingToolUses = new Map<string, Map<string, { stepId: string; toolUse: IToolUse }>>();
  // Secuencias por sesión.
  private readonly sequences = new Map<string, number>();
  // Índice de layout NN por sesión (wire audit).
  private readonly layoutIndices = new Map<string, number>();
  // Metadatos wire por workflowId.
  private readonly wireMeta = new Map<string, WireWorkflowMeta>();
  // tool_use_id → workflowId (correlación continuation).
  private readonly toolUseIdToWorkflowId = new Map<string, string>();
  // Locks por sesión (cadena de promesas).
  private readonly sessionLocks = new Map<string, Promise<unknown>>();

  constructor(private readonly eventBus?: IEventBus) {}

  /** Construye y publica un evento al bus, resolviendo `sessionId` desde el workflow. */
  private emit(type: string, workflowId: string, payload: Record<string, unknown>): void {
    if (!this.eventBus) return;
    const sessionId = this.workflows.get(workflowId)?.sessionId ?? '';
    this.eventBus.publish({
      type,
      sessionId,
      workflowId,
      timestamp: new Date().toISOString(),
      payload: { workflowId, ...payload },
    });
  }

  // ── Métodos wire (C1/C2/C3) ──────────────────────────────────────────────

  public openSubagentFromWire(sessionId: string, agentCtx: AgentContext): WireSubagentEntry {
    const agentId = agentCtx.agentId ?? '';
    // Si ya existe un placeholder creado por hook-antes-wire, preservar confirmed/triggeringToolUseId
    const existing = agentId ? this.index.get(agentId) : undefined;
    const entry: WireSubagentEntry = {
      sessionId,
      agentId,
      ...(agentCtx.parentAgentId ? { parentAgentId: agentCtx.parentAgentId } : {}),
      ...(existing?.confirmed !== undefined ? { confirmed: existing.confirmed } : {}),
      ...(existing?.triggeringToolUseId ? { triggeringToolUseId: existing.triggeringToolUseId } : {}),
    };
    if (agentCtx.agentId) {
      this.index.set(agentCtx.agentId, entry);
    }
    return entry;
  }

  public getWorkflowByAgentId(agentId: string): WireSubagentEntry | undefined {
    return this.index.get(agentId);
  }

  public confirmSubagentFromHook(agentId: string, toolUseId?: string): void {
    const existing = this.index.get(agentId);
    if (existing) {
      // Wire llegó antes: marcar confirmado y registrar toolUseId si viene
      existing.confirmed = true;
      if (toolUseId) existing.triggeringToolUseId = toolUseId;
    } else {
      // Hook-antes-wire (carrera §28): crear placeholder para que openSubagentFromWire lo complete
      const placeholder: WireSubagentEntry = {
        sessionId: '',
        agentId,
        confirmed: true,
        ...(toolUseId ? { triggeringToolUseId: toolUseId } : {}),
      };
      this.index.set(agentId, placeholder);
    }
  }

  // ── Métodos de lifecycle (G2) ─────────────────────────────────────────────

  public openWorkflow(
    sessionId: string,
    agentCtx: AgentContext,
    options: OpenWorkflowOptions = {},
  ): IWorkflow {
    if (!options.forceNew) {
      const existing = this.workflows.get(sessionId);
      if (existing) return existing;
    }

    const layoutIndex =
      options.layoutIndex ??
      (() => {
        const next = this.layoutIndices.get(sessionId) ?? 0;
        this.layoutIndices.set(sessionId, next + 1);
        return next;
      })();

    const workflowId = options.forceNew ? `${sessionId}-wire-${layoutIndex}` : sessionId;
    const workflow = new Workflow({
      id: workflowId,
      sessionId,
      kind: 'main',
      agentId: agentCtx.agentId,
      status: 'running',
      steps: [],
      startedAt: new Date(),
    });
    this.workflows.set(workflowId, workflow);
    if (options.workflowKind) {
      this.wireMeta.set(workflowId, {
        layoutIndex,
        requestSequence: 0,
        requestBodyOmitted: false,
        requestBodyBytes: 0,
        workflowKind: options.workflowKind,
        ...(options.sideRequestKind ? { sideRequestKind: options.sideRequestKind } : {}),
      });
    }
    this.emit('workflow_start', workflow.id, {
      kind: 'main',
      layoutIndex,
      ...(options.request !== undefined && !options.skipWorkflowRequest
        ? { request: options.request }
        : {}),
      ...(options.workflowKind ? { workflowKind: options.workflowKind } : {}),
    });
    return workflow;
  }

  public openSubagentWorkflow(
    sessionId: string,
    agentCtx: AgentContext,
    parentWorkflowId: string,
    parentToolUseId: string,
    options: OpenSubagentWorkflowOptions = {},
  ): IWorkflow {
    const layoutIndex =
      options.layoutIndex ??
      (() => {
        const next = this.layoutIndices.get(sessionId) ?? 0;
        this.layoutIndices.set(sessionId, next + 1);
        return next;
      })();

    const workflowId = agentCtx.agentId ?? `${sessionId}-sub-${layoutIndex}`;
    const workflow = new Workflow({
      id: workflowId,
      sessionId,
      kind: 'subagent',
      agentId: agentCtx.agentId,
      status: 'running',
      steps: [],
      parentWorkflowId,
      parentToolUseId,
      startedAt: new Date(),
    });
    this.workflows.set(workflowId, workflow);
    this.wireMeta.set(workflowId, {
      layoutIndex,
      requestSequence: 0,
      requestBodyOmitted: false,
      requestBodyBytes: 0,
      workflowKind: 'agentic',
      ...(options.parentContext ? { parentContext: options.parentContext } : {}),
    });
    this.emit('workflow_spawn', workflow.id, {
      parentWorkflowId,
      parentToolUseId,
      ...(options.request !== undefined ? { request: options.request } : {}),
      ...(options.parentContext ? { parentContext: options.parentContext } : {}),
    });
    return workflow;
  }

  public getWorkflow(workflowId: string): IWorkflow | undefined {
    return this.workflows.get(workflowId);
  }

  public registerStep(workflowId: string, step: IStep): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;
    workflow.steps.push(step);
    this.emit('step_request', workflowId, {
      stepIndex: step.index,
      step,
      request: step.inferenceRequest,
    });
  }

  public closeStep(workflowId: string, stepId: string): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;
    const step = workflow.steps.find((s) => s.id === stepId);
    if (step) step.closedAt = new Date();
  }

  public registerToolUse(workflowId: string, toolUse: IToolUse): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;
    const step = workflow.steps.find((s) => s.id === toolUse.stepId);
    if (!step) return;
    step.toolUses.push(toolUse);
    this.emit('tool_call', workflowId, {
      stepIndex: step.index,
      toolUseId: toolUse.id,
      toolName: toolUse.name,
      input: toolUse.arguments,
    });
  }

  public completeToolUse(
    workflowId: string,
    toolUseId: string,
    result: { isError: boolean; result: unknown },
  ): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;
    let toolUse: IToolUse | undefined;
    for (const step of workflow.steps) {
      toolUse = step.toolUses.find((t) => t.id === toolUseId);
      if (toolUse) break;
    }
    // También puede estar registrado como pendiente.
    if (!toolUse) {
      toolUse = this.pendingToolUses.get(workflowId)?.get(toolUseId)?.toolUse;
    }
    if (!toolUse) return; // no-op defensivo
    toolUse.result = result;
    toolUse.status = result.isError ? 'error' : 'completed';
    toolUse.completedAt = new Date();
    this.emit('tool_result', workflowId, { toolUseId, result });
  }

  public readyToClose(workflowId: string, hook: ClaudeHookEvent): boolean {
    if (!this.workflows.has(workflowId)) return false;
    if (hook.stopHookActive === true) return false;
    if ((hook.backgroundTasks ?? 0) > 0) return false;
    return true;
  }

  public setWorkflowModel(workflowId: string, modelId: string): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow || workflow.languageModelId !== undefined) return;
    workflow.languageModelId = modelId;
  }

  public close(workflowId: string, hook: ClaudeHookEvent): IWorkflowResult {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      // No debería ocurrir si el caller verifica getWorkflow antes; devolver resultado vacío
      return buildWorkflowResult({ id: workflowId, sessionId: hook.sessionId, kind: 'main', status: 'failed', steps: [], startedAt: new Date() }, [], [], hook);
    }
    // Idempotencia §28: si ya está cerrado, devolver el resultado existente
    if (workflow.result != null) return workflow.result;

    const closedSteps = workflow.steps.filter((s) => s.closedAt != null);
    const childResults: IWorkflowResult[] = Array.from(this.workflows.values())
      .filter((w) => w.parentWorkflowId === workflowId && w.result != null)
      .map((w) => w.result as IWorkflowResult);

    const result = buildWorkflowResult(workflow, closedSteps, childResults, hook);
    workflow.result = result;
    workflow.completedAt = new Date();
    workflow.status = result.outcome === 'success' ? 'completed' : 'failed';
    // `aborted` → cancelación; cualquier otro outcome → cierre completo.
    if (result.outcome === 'aborted') {
      this.emit('workflow_cancel', workflowId, { result, cancellationReason: result.outcome });
    } else {
      this.emit('workflow_complete', workflowId, { result, outcome: result.outcome });
    }
    return result;
  }

  public forceClose(
    workflowId: string,
    outcome: WorkflowOutcome,
    resultExtras?: Record<string, unknown>,
  ): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow || workflow.result != null) return;
    const closedSteps = workflow.steps.filter((s) => s.closedAt != null);
    const result: IWorkflowResult = {
      outcome,
      stepCount: closedSteps.length,
      closedByEvent: 'StopFailure',
      sessionId: workflow.sessionId,
      ...(resultExtras ?? {}),
    };
    workflow.result = result;
    workflow.completedAt = new Date();
    workflow.status = outcome === 'orphaned' || outcome === 'upstream-error' ? 'failed' : 'failed';
    this.emit('workflow_complete', workflowId, { result, outcome, ...(resultExtras ?? {}) });
    this.wireMeta.delete(workflowId);
    for (const [toolId, wfId] of this.toolUseIdToWorkflowId) {
      if (wfId === workflowId) this.toolUseIdToWorkflowId.delete(toolId);
    }
  }

  // ── Métodos de lookup (migración de handlers L3) ──────────────────────────

  public getWorkflowBySessionId(sessionId: string): IWorkflow | undefined {
    const direct = this.workflows.get(sessionId);
    if (direct && direct.kind === 'main') return direct;
    for (const wf of this.workflows.values()) {
      if (wf.kind === 'main' && wf.sessionId === sessionId) return wf;
    }
    return undefined;
  }

  public findWorkflowWithPendingToolUse(
    sessionId: string,
    toolUseId: string,
  ): { workflow: IWorkflow; toolUse: IToolUse } | undefined {
    for (const [workflowId, pendings] of this.pendingToolUses) {
      const workflow = this.workflows.get(workflowId);
      if (!workflow || workflow.sessionId !== sessionId) continue;
      const entry = pendings.get(toolUseId);
      if (entry) return { workflow, toolUse: entry.toolUse };
    }
    return undefined;
  }

  public registerPendingToolUse(workflowId: string, stepId: string, toolUse: IToolUse): void {
    if (!this.workflows.has(workflowId)) return;
    let pendings = this.pendingToolUses.get(workflowId);
    if (!pendings) {
      pendings = new Map();
      this.pendingToolUses.set(workflowId, pendings);
    }
    pendings.set(toolUse.id, { stepId, toolUse });
    this.toolUseIdToWorkflowId.set(toolUse.id, workflowId);
  }

  public consumePendingToolUse(workflowId: string, toolUseId: string): IToolUse | undefined {
    const pendings = this.pendingToolUses.get(workflowId);
    if (!pendings) return undefined;
    const entry = pendings.get(toolUseId);
    if (!entry) return undefined;
    pendings.delete(toolUseId);
    return entry.toolUse;
  }

  public findStaleWorkflows(sessionId: string, maxAgeMs: number): IWorkflow[] {
    const now = Date.now();
    const stale: IWorkflow[] = [];
    for (const wf of this.workflows.values()) {
      if (wf.sessionId !== sessionId) continue;
      if (wf.status !== 'running') continue;
      if (now - wf.startedAt.getTime() > maxAgeMs) stale.push(wf);
    }
    return stale;
  }

  public findStaleWorkflowsAwaitingContinuation(sessionId: string, maxAgeMs: number): IWorkflow[] {
    const now = Date.now();
    const stale: IWorkflow[] = [];
    for (const wf of this.workflows.values()) {
      if (wf.sessionId !== sessionId || wf.status !== 'running') continue;
      const meta = this.wireMeta.get(wf.id);
      if (
        meta?.awaitingContinuation === true &&
        typeof meta.awaitingSince === 'number' &&
        now - meta.awaitingSince > maxAgeMs
      ) {
        stale.push(wf);
      }
    }
    return stale;
  }

  public getAllRunningWorkflows(): IWorkflow[] {
    return [...this.workflows.values()].filter((wf) => wf.status === 'running');
  }

  public findWorkflowWithPendingTools(
    sessionId: string,
    predicate: (toolUse: IToolUse) => boolean,
    options?: { excludeSubagents?: boolean },
  ): { workflow: IWorkflow; pendings: IToolUse[] } | undefined {
    for (const [workflowId, pendings] of this.pendingToolUses) {
      const workflow = this.workflows.get(workflowId);
      if (!workflow || workflow.sessionId !== sessionId) continue;
      if (options?.excludeSubagents && workflow.kind === 'subagent') continue;
      if (options?.excludeSubagents && workflow.parentWorkflowId) continue;
      const matches: IToolUse[] = [];
      for (const entry of pendings.values()) {
        if (predicate(entry.toolUse)) matches.push(entry.toolUse);
      }
      if (matches.length > 0) return { workflow, pendings: matches };
    }
    return undefined;
  }

  public findWorkflowByToolUseId(sessionId: string, toolUseId: string): IWorkflow | undefined {
    const wfId = this.toolUseIdToWorkflowId.get(toolUseId);
    if (wfId) {
      const wf = this.workflows.get(wfId);
      if (wf?.sessionId === sessionId) return wf;
    }
    return this.findWorkflowWithPendingToolUse(sessionId, toolUseId)?.workflow;
  }

  public consumeFirstPendingToolUseByName(workflowId: string, toolName: string): IToolUse | undefined {
    const pendings = this.pendingToolUses.get(workflowId);
    if (!pendings) return undefined;
    const normalized = toolName.toLowerCase().replace(/_/g, '');
    for (const [id, entry] of pendings) {
      const name = entry.toolUse.name.toLowerCase().replace(/_/g, '');
      if (name === normalized || name === `${normalized}tool`) {
        pendings.delete(id);
        return entry.toolUse;
      }
    }
    return undefined;
  }

  public getWireMeta(workflowId: string): WireWorkflowMeta | undefined {
    return this.wireMeta.get(workflowId);
  }

  public patchWireMeta(workflowId: string, patch: Partial<WireWorkflowMeta>): void {
    const existing = this.wireMeta.get(workflowId);
    if (!existing) return;
    this.wireMeta.set(workflowId, { ...existing, ...patch });
  }

  public async allocLayoutIndex(sessionId: string): Promise<number> {
    const next = this.layoutIndices.get(sessionId) ?? 0;
    this.layoutIndices.set(sessionId, next + 1);
    return next;
  }

  public async nextSequence(sessionId: string): Promise<number> {
    const current = this.sequences.get(sessionId) ?? 0;
    this.sequences.set(sessionId, current + 1);
    return current;
  }

  public withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.sessionLocks.get(sessionId) ?? Promise.resolve();
    const next = prev.then(() => fn(), () => fn());
    this.sessionLocks.set(
      sessionId,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }
}
