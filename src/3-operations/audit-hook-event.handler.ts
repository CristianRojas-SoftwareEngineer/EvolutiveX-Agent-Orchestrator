import type { IWorkflowRepository } from '../1-domain/repositories/IWorkflowRepository.js';
import type { Logger } from '../1-domain/types/logger.types.js';
import type { ClaudeHookEvent } from '../1-domain/types/hook.types.js';
import type { IContextExtractor } from '../1-domain/ports/IContextExtractor.js';
import type { INotificationService } from '../2-services/notifications/INotificationService.js';
import type { NotificationEvent } from '../2-services/notifications/types.js';
import {
  truncate,
  normalizeWhitespace,
  formatUserPromptSubmitMessage,
  formatStopFailureMessage,
  formatPermissionRequestMessage,
  formatPreToolUseAskMessage,
  formatTaskInProgressMessage,
} from '../2-services/notifications/hook-payload-notification-message.js';
import { SessionMetricsService } from '../2-services/session-metrics.service.js';
import { resolveSessionDir } from './audit-workflow-closure.handler.js';
import { KanbanBoardProjector } from './kanban-board.projector.js';


export class AuditHookEventHandler {
  constructor(
    private readonly workflowRepo: IWorkflowRepository,
    private readonly auditBaseDir: string,
    private readonly sessionMetrics: SessionMetricsService,
    private readonly logger?: Logger,
    private readonly contextExtractor?: IContextExtractor,
    private readonly contextN: number = 3,
    private readonly notifier?: INotificationService,
    private readonly toastBranding?: { appId?: string; icon?: string },
    private readonly kanbanProjector?: KanbanBoardProjector,
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
        void this.emitToast(
          'SubagentStart',
          event.agentId ? `Subagente iniciado (${event.agentId})` : 'Subagente iniciado',
        );
        break;

      case 'UserPromptSubmit': {
        // El workflow del turno lo crea exclusivamente `ensureTurnWorkflow` al llegar
        // la request HTTP real; crear aquí produciría workflows sin request body.
        // Toast con preview del prompt (mismo texto que el script relay)
        const userPromptMsg =
          event.prompt !== undefined
            ? formatUserPromptSubmitMessage({ prompt: event.prompt } as Record<string, unknown>)
            : null;
        if (userPromptMsg) {
          void this.emitToast('UserPromptSubmit', userPromptMsg);
        }
        break;
      }

      case 'Stop': {
        const wf = this.workflowRepo.getWorkflowBySessionId(event.sessionId);
        if (!wf) {
          this.logger?.warn(
            { eventName: event.eventName, sessionId: event.sessionId },
            'workflow no encontrado — evento ignorado',
          );
          break;
        }
        if (this.workflowRepo.readyToClose(wf.id, event)) {
          this.workflowRepo.close(wf.id, event);
          await this.delegateClosure(event.sessionId, wf.id);
        }
        // Resumen de cierre por voz y toast
        void this.announceStop(event);
        break;
      }

      case 'SubagentStop': {
        const agentId = event.agentId;
        if (!agentId) break;
        const entry = this.workflowRepo.getWorkflowByAgentId(agentId);
        if (!entry) {
          this.logger?.warn(
            { eventName: event.eventName, agentId },
            'sub-workflow no encontrado — evento ignorado',
          );
          break;
        }
        const wfId = entry.agentId;
        const wf = this.workflowRepo.getWorkflow(wfId);
        if (!wf) {
          this.logger?.error(
            { eventName: event.eventName, agentId, wfId },
            'sub-workflow en índice wire pero no en lifecycle — evento ignorado',
          );
          break;
        }
        if (this.workflowRepo.readyToClose(wfId, event)) {
          this.workflowRepo.close(wfId, event);
          await this.delegateClosure(event.sessionId, wfId);
        }
        // Toast de cierre de subagente enriquecido con el último mensaje del asistente
        void this.emitContextualToast('SubagentStop', event, 'Subagente terminado');
        break;
      }

      case 'StopFailure': {
        const wf = this.workflowRepo.getWorkflowBySessionId(event.sessionId);
        if (!wf) {
          this.logger?.warn(
            { eventName: event.eventName, sessionId: event.sessionId },
            'workflow no encontrado — evento ignorado',
          );
          break;
        }
        this.workflowRepo.close(wf.id, event);
        await this.delegateClosure(event.sessionId, wf.id);
        // Toast con detalle del error (último mensaje o tipo de error)
        const stopFailurePayload: Record<string, unknown> = {};
        if (event.lastAssistantMessage) {
          stopFailurePayload['last_assistant_message'] = event.lastAssistantMessage;
        }
        const stopFailureMsg = formatStopFailureMessage(stopFailurePayload);
        if (stopFailureMsg) {
          void this.emitToast('StopFailure', stopFailureMsg);
        }
        break;
      }

      case 'PreToolUse': {
        this.logger?.info({ eventName: event.eventName }, 'hook PreToolUse recibido');
        // Toast condicional: solo si la tool es AskUserQuestion y trae questions
        if (event.toolName === 'AskUserQuestion' && event.toolInput) {
          const askPayload: Record<string, unknown> = { tool_input: event.toolInput };
          const askMsg = formatPreToolUseAskMessage(askPayload);
          if (askMsg) {
            void this.emitToast('PreToolUse', askMsg);
          }
        }
        break;
      }

      case 'PostToolUse':
        this.handlePostToolUse(event, false);
        break;

      case 'PostToolUseFailure':
        this.handlePostToolUse(event, true);
        break;

      case 'SessionStart':
        void this.emitToast(
          'SessionStart',
          event.sessionId ? `Sesión iniciada (${event.sessionId})` : 'Sesión iniciada',
        );
        break;

      case 'SessionEnd': {
        // Enriquecimiento con el último mensaje del asistente leído del transcript.
        const recap = await this.lastAssistantText(event.transcriptPath);
        void this.emitToast(
          'SessionEnd',
          recap ? `Sesión finalizada: ${recap}` : 'Sesión finalizada',
        );
        break;
      }

      case 'TaskCreated': {
        const subject = this.taskSubject(event);
        void this.emitToast('TaskCreated', subject ? `Tarea creada: ${subject}` : 'Tarea creada');
        break;
      }

      case 'TaskCompleted': {
        const subject = this.taskSubject(event);
        void this.emitToast(
          'TaskCompleted',
          subject ? `Tarea completada: ${subject}` : 'Tarea completada',
        );
        break;
      }

      case 'PermissionRequest': {
        const permPayload: Record<string, unknown> = {};
        if (event.toolName) permPayload['tool_name'] = event.toolName;
        if (event.toolInput) permPayload['tool_input'] = event.toolInput;
        const permMsg = formatPermissionRequestMessage(permPayload);
        if (permMsg) {
          void this.emitToast('PermissionRequest', permMsg);
        }
        break;
      }

      default:
        this.logger?.info({ eventName: event.eventName }, 'hook desconocido recibido — ignorado');
        break;
    }
  }

  /**
   * Lee el último mensaje del asistente desde el transcript de la sesión.
   * Devuelve `undefined` si no hay transcript, extractor o mensaje de asistente.
   * Es lectura de contexto para toasts (UX no-voz); nunca propaga errores.
   */
  private async lastAssistantText(transcriptPath: string | undefined): Promise<string | undefined> {
    if (!transcriptPath || !this.contextExtractor) return undefined;
    try {
      const messages = await this.contextExtractor.extractLastNMessages(transcriptPath, this.contextN);
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
      return lastAssistant?.text?.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  /** Extrae el `subject` del `tool_input` de los eventos de tarea (TaskCreated/TaskCompleted). */
  private taskSubject(event: ClaudeHookEvent): string | undefined {
    const subject = event.toolInput?.['subject'];
    return typeof subject === 'string' && subject.trim() ? subject.trim() : undefined;
  }

  /**
   * Emite un toast enriquecido con el último mensaje del asistente del transcript.
   * Si el transcript no aporta contexto, usa el texto de fallback provisto.
   */
  private async emitContextualToast(
    title: string,
    event: ClaudeHookEvent,
    fallback: string,
  ): Promise<void> {
    const recap = await this.lastAssistantText(event.transcriptPath);
    await this.emitToast(title, recap ? `${fallback}: ${recap}` : fallback);
  }

  /** Toast de cierre del turno: último mensaje del asistente del transcript, sin voz. */
  private async announceStop(event: ClaudeHookEvent): Promise<void> {
    try {
      const recap = await this.lastAssistantText(event.transcriptPath);
      await this.emitToast('Stop', recap ?? 'El asistente terminó su turno.');
    } catch (err) {
      this.logger?.error({ err }, '[Toast] fallo en announceStop');
    }
  }

  private async emitToast(title: string, text: string): Promise<void> {
    if (!this.notifier) return;
    const message = truncate(normalizeWhitespace(text), 250);
    try {
      const notifEvent: NotificationEvent = { title, message, ...this.toastBranding };
      await this.notifier.notify(notifEvent);
    } catch (err) {
      this.logger?.error({ err }, '[Toast] fallo al emitir');
    }
  }

  private handlePostToolUse(event: ClaudeHookEvent, isError: boolean): void {
    const toolUseId = event.toolUseId;
    if (!toolUseId) return;

    const match = this.workflowRepo.findWorkflowWithPendingToolUse(event.sessionId, toolUseId);
    const workflow =
      match?.workflow ?? this.workflowRepo.findWorkflowByToolUseId(event.sessionId, toolUseId);
    if (!workflow) return;

    if (this.workflowRepo.getToolCompletionAuthority(workflow.id, toolUseId) !== 'hook') {
      return;
    }

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

    // Toast condicional: solo si la tool es TaskUpdate y status === 'in_progress'
    if (
      !isError &&
      event.toolName === 'TaskUpdate' &&
      event.toolInput?.['status'] === 'in_progress'
    ) {
      const taskInProgressPayload: Record<string, unknown> = { tool_input: event.toolInput };
      const taskMsg = formatTaskInProgressMessage(taskInProgressPayload);
      if (taskMsg) {
        void this.emitToast('TaskInProgress', taskMsg);
      }
    }

    // Proyección Kanban: solo para TaskCreate/TaskUpdate con source='spec-delta'
    if (
      !isError &&
      this.kanbanProjector &&
      (event.toolName === 'TaskCreate' || event.toolName === 'TaskUpdate') &&
      (event.toolInput?.['metadata'] as Record<string, unknown> | undefined)?.['source'] ===
        'spec-delta'
    ) {
      if (event.toolName === 'TaskCreate') {
        void this.kanbanProjector.onTaskCreate(event);
      } else {
        void this.kanbanProjector.onTaskUpdate(event);
      }
    }
  }

  private async delegateClosure(sessionId: string, workflowId: string): Promise<void> {
    const workflow = this.workflowRepo.getWorkflow(workflowId);
    if (!workflow || (workflow.kind !== 'main' && workflow.kind !== 'subagent')) return;

    const sessionDir = resolveSessionDir(this.auditBaseDir, sessionId);
    const closedSteps = workflow.steps.filter((s) => s.closedAt != null);
    await this.sessionMetrics.finalizeWorkflowMetrics(sessionDir, workflowId, closedSteps);
  }
}
