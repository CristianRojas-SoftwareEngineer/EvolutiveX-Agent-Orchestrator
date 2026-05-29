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
        // Única mutación real de C3: confirmar el subagente en el correlador
        if (event.agentId) {
          this.workflowRepo.confirmSubagentFromHook(event.agentId, event.toolUseId);
        }
        break;

      // Los eventos siguientes son stubs — mutaciones diferidas a G2/C4
      case 'UserPromptSubmit':
      case 'PreToolUse':
      case 'PostToolUse':
      case 'PostToolUseFailure':
      case 'SubagentStop':
      case 'Stop':
      case 'StopFailure':
        this.logger?.info({ eventName: event.eventName }, 'hook recibido — mutación diferida a G2/C4');
        break;

      default:
        this.logger?.info({ eventName: event.eventName }, 'hook desconocido recibido — ignorado');
        break;
    }
  }
}
