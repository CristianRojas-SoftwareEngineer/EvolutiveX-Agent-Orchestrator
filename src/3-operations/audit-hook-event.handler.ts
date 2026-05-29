import type { IWorkflowRepository } from '../1-domain/repositories/IWorkflowRepository.js';
import type { Logger } from '../1-domain/types/logger.types.js';
import type { ClaudeHookEvent } from '../1-domain/types/hook.types.js';

export class AuditHookEventHandler {
  constructor(
    private readonly workflowRepo: IWorkflowRepository,
    private readonly logger?: Logger,
  ) {}

  public execute(event: ClaudeHookEvent): void {
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
        break;
      }

      // Stubs — ToolUse.status tracking diferido a G4
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
}
