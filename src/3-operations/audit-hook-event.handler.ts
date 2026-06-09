import type { IWorkflowRepository } from '../1-domain/repositories/IWorkflowRepository.js';
import type { Logger } from '../1-domain/types/logger.types.js';
import type { ClaudeHookEvent } from '../1-domain/types/hook.types.js';
import { SessionMetricsService } from '../2-services/session-metrics.service.js';
import { resolveSessionDir } from './audit-workflow-closure.handler.js';

export class AuditHookEventHandler {
  constructor(
    private readonly workflowRepo: IWorkflowRepository,
    private readonly auditBaseDir: string,
    private readonly sessionMetrics: SessionMetricsService,
    private readonly logger?: Logger,
  ) {}

  public execute(event: ClaudeHookEvent): void {
    void this.executeAsync(event);
  }

  private async executeAsync(event: ClaudeHookEvent): Promise<void> {
    switch (event.eventName) {
      case 'SubagentStart':
        if (event.agentId) {
          this.workflowRepo.confirmSubagentFromHook(event.agentId, event.toolUseId);
        }
        break;

      case 'UserPromptSubmit':
        this.workflowRepo.openWorkflow(
          event.sessionId,
          {
            agentId: event.agentId,
            isSubagentRequest: false,
          },
          { workflowKind: 'agentic' },
        );
        break;

      case 'Stop': {
        const wf = this.workflowRepo.getWorkflowBySessionId(event.sessionId);
        if (!wf) {
          this.logger?.info(
            { eventName: event.eventName, sessionId: event.sessionId },
            'workflow no encontrado — evento ignorado',
          );
          break;
        }
        if (this.workflowRepo.readyToClose(wf.id, event)) {
          this.workflowRepo.close(wf.id, event);
          await this.delegateClosure(event.sessionId, wf.id);
        }
        break;
      }

      case 'SubagentStop': {
        const agentId = event.agentId;
        if (!agentId) break;
        const entry = this.workflowRepo.getWorkflowByAgentId(agentId);
        if (!entry) {
          this.logger?.info(
            { eventName: event.eventName, agentId },
            'sub-workflow no encontrado — evento ignorado',
          );
          break;
        }
        const wfId = entry.agentId;
        const wf = this.workflowRepo.getWorkflow(wfId);
        if (!wf) {
          this.logger?.info(
            { eventName: event.eventName, agentId, wfId },
            'sub-workflow en índice wire pero no en lifecycle — evento ignorado',
          );
          break;
        }
        if (this.workflowRepo.readyToClose(wfId, event)) {
          this.workflowRepo.close(wfId, event);
          await this.delegateClosure(event.sessionId, wfId);
        }
        break;
      }

      case 'StopFailure': {
        const wf = this.workflowRepo.getWorkflowBySessionId(event.sessionId);
        if (!wf) {
          this.logger?.info(
            { eventName: event.eventName, sessionId: event.sessionId },
            'workflow no encontrado — evento ignorado',
          );
          break;
        }
        this.workflowRepo.close(wf.id, event);
        await this.delegateClosure(event.sessionId, wf.id);
        break;
      }

      case 'PreToolUse':
        this.logger?.info({ eventName: event.eventName }, 'hook PreToolUse recibido');
        break;

      case 'PostToolUse':
        this.handlePostToolUse(event, false);
        break;

      case 'PostToolUseFailure':
        this.handlePostToolUse(event, true);
        break;

      default:
        this.logger?.info({ eventName: event.eventName }, 'hook desconocido recibido — ignorado');
        break;
    }
  }

  private handlePostToolUse(event: ClaudeHookEvent, isError: boolean): void {
    const toolUseId = event.toolUseId;
    if (!toolUseId) return;

    const match = this.workflowRepo.findWorkflowWithPendingToolUse(event.sessionId, toolUseId);
    const workflow =
      match?.workflow ?? this.workflowRepo.findWorkflowByToolUseId(event.sessionId, toolUseId);
    if (!workflow) return;

    const resultPayload =
      event.lastAssistantMessage != null && event.lastAssistantMessage !== ''
        ? event.lastAssistantMessage
        : isError
          ? { error: 'PostToolUseFailure' }
          : null;

    this.workflowRepo.completeToolUse(workflow.id, toolUseId, {
      isError,
      result: resultPayload,
    });
  }

  private async delegateClosure(sessionId: string, workflowId: string): Promise<void> {
    const workflow = this.workflowRepo.getWorkflow(workflowId);
    if (!workflow || (workflow.kind !== 'main' && workflow.kind !== 'subagent')) return;

    const sessionDir = resolveSessionDir(this.auditBaseDir, sessionId);
    const closedSteps = workflow.steps.filter((s) => s.closedAt != null);
    await this.sessionMetrics.finalizeWorkflowMetrics(sessionDir, workflowId, closedSteps);
  }
}
