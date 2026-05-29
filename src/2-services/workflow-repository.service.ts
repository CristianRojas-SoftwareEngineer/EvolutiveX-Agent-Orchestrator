import type { AgentContext } from '../1-domain/types/audit.types.js';
import type { ClaudeHookEvent } from '../1-domain/types/hook.types.js';
import type { IWorkflowRepository, WireSubagentEntry } from '../1-domain/repositories/IWorkflowRepository.js';
import type { IWorkflow } from '../1-domain/interfaces/gateway/IWorkflow.js';
import type { IStep } from '../1-domain/interfaces/gateway/IStep.js';
import type { IToolUse } from '../1-domain/interfaces/gateway/IToolUse.js';
import type { IWorkflowResult } from '../1-domain/interfaces/gateway/IWorkflowResult.js';
import { Workflow } from '../1-domain/models/gateway/Workflow.js';
import { buildWorkflowResult } from '../1-domain/services/gateway/build-workflow-result.js';

export class WorkflowRepositoryService implements IWorkflowRepository {
  // Índice wire (C1/C2/C3): agentId → WireSubagentEntry
  private readonly index = new Map<string, WireSubagentEntry>();
  // Índice de lifecycle (G2): workflowId → Workflow
  private readonly workflows = new Map<string, Workflow>();

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

  public openWorkflow(sessionId: string, agentCtx: AgentContext): IWorkflow {
    const existing = this.workflows.get(sessionId);
    if (existing) return existing;
    const workflow = new Workflow({
      id: sessionId,
      sessionId,
      kind: 'main',
      agentId: agentCtx.agentId,
      status: 'running',
      steps: [],
      startedAt: new Date(),
    });
    this.workflows.set(sessionId, workflow);
    return workflow;
  }

  public openSubagentWorkflow(
    sessionId: string,
    agentCtx: AgentContext,
    parentWorkflowId: string,
    parentToolUseId: string,
  ): IWorkflow {
    const workflowId = agentCtx.agentId ?? sessionId;
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
    return workflow;
  }

  public getWorkflow(workflowId: string): IWorkflow | undefined {
    return this.workflows.get(workflowId);
  }

  public registerStep(workflowId: string, step: IStep): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;
    workflow.steps.push(step);
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
    if (step) step.toolUses.push(toolUse);
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
    return result;
  }
}
