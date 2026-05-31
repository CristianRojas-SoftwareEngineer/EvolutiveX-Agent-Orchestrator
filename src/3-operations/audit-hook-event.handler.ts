import type { IWorkflowRepository } from '../1-domain/repositories/IWorkflowRepository.js';
import type { Logger } from '../1-domain/types/logger.types.js';
import type { ClaudeHookEvent } from '../1-domain/types/hook.types.js';
import type { ISessionStore } from '../2-services/ports/session-store.port.js';
import {
  AuditWorkflowClosureHandler,
  resolveSessionDir,
} from './audit-workflow-closure.handler.js';

export class AuditHookEventHandler {
  constructor(
    private readonly workflowRepo: IWorkflowRepository,
    private readonly sessionStore: ISessionStore,
    private readonly closureHandler: AuditWorkflowClosureHandler,
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
        this.workflowRepo.openWorkflow(event.sessionId, {
          agentId: event.agentId,
          isSubagentRequest: false,
        });
        break;

      case 'Stop': {
        const wf = this.workflowRepo.getWorkflow(event.sessionId);
        if (!wf) {
          this.logger?.info({ eventName: event.eventName, sessionId: event.sessionId }, 'workflow no encontrado — evento ignorado');
          break;
        }
        if (this.workflowRepo.readyToClose(event.sessionId, event)) {
          this.workflowRepo.close(event.sessionId, event);
          await this.delegateClosure(event.sessionId, event.sessionId);
        }
        break;
      }

      case 'SubagentStop': {
        const agentId = event.agentId;
        if (!agentId) break;
        const wf = this.workflowRepo.getWorkflow(agentId);
        if (!wf) {
          this.logger?.info({ eventName: event.eventName, agentId }, 'sub-workflow no encontrado — evento ignorado');
          break;
        }
        if (this.workflowRepo.readyToClose(agentId, event)) {
          this.workflowRepo.close(agentId, event);
          await this.delegateClosure(event.sessionId, agentId);
        }
        break;
      }

      case 'StopFailure': {
        const wf = this.workflowRepo.getWorkflow(event.sessionId);
        if (!wf) {
          this.logger?.info({ eventName: event.eventName, sessionId: event.sessionId }, 'workflow no encontrado — evento ignorado');
          break;
        }
        this.workflowRepo.close(event.sessionId, event);
        await this.delegateClosure(event.sessionId, event.sessionId);
        break;
      }

      case 'PreToolUse':
        this.logger?.info({ eventName: event.eventName }, 'hook recibido — ToolUse.status = running diferido a G4');
        break;

      case 'PostToolUse':
        this.logger?.info({ eventName: event.eventName }, 'hook recibido — ToolUse.status = completed diferido a G4');
        break;

      case 'PostToolUseFailure':
        this.logger?.info({ eventName: event.eventName }, 'hook recibido — ToolUse.status = error diferido a G4');
        break;

      default:
        this.logger?.info({ eventName: event.eventName }, 'hook desconocido recibido — ignorado');
        break;
    }
  }

  private async delegateClosure(sessionId: string, workflowId: string): Promise<void> {
    const workflow = this.workflowRepo.getWorkflow(workflowId);
    if (!workflow) return;

    const sessionDir = resolveSessionDir(this.sessionStore.getBaseDir(), sessionId);
    await this.closureHandler.execute({ sessionDir, workflow });
  }
}
