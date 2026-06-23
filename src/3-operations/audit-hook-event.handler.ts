import type { IWorkflowRepository } from '../1-domain/repositories/IWorkflowRepository.js';
import type { Logger } from '../1-domain/types/logger.types.js';
import type { ClaudeHookEvent } from '../1-domain/types/hook.types.js';
import type { ITTSService } from '../1-domain/ports/ITTSService.js';
import type { IContextExtractor, SessionMessage } from '../1-domain/ports/IContextExtractor.js';
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

const GEMINI_FLASH_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const TTS_MAX_TOKENS = 512;

const VOICE_ASSISTANT_SYSTEM_PROMPT =
  'Eres la voz del asistente Smart Code Proxy. ' +
  'Recibirás tres mensajes: la petición anterior del usuario, ' +
  'tu última respuesta, y la nueva petición del usuario. ' +
  'Responde SOLO a la nueva petición (la tercera) en una sola oración breve y natural en español, ' +
  'confirmando que procederás a investigar o ejecutar lo solicitado. ' +
  'Texto plano para ser leído en voz alta: sin markdown, sin asteriscos, ' +
  'comillas, guiones ni símbolos. Sin puntos al final.';

const CONTINUITY_SYSTEM_PROMPT =
  'Eres la voz del asistente de continuidad de Smart Code Proxy. ' +
  'Narra en alto nivel, en una o dos frases cortas en español, una síntesis de lo realizado. ' +
  'Parafrasea; no expliques detalle técnico punto por punto ni enumeres pasos. ' +
  'Texto plano para ser leído en voz alta: sin markdown, sin asteriscos, ' +
  'comillas, guiones ni símbolos. Sin puntos al final de las oraciones. Habla en primera persona.';


export class AuditHookEventHandler {
  constructor(
    private readonly workflowRepo: IWorkflowRepository,
    private readonly auditBaseDir: string,
    private readonly sessionMetrics: SessionMetricsService,
    private readonly logger?: Logger,
    private readonly tts?: ITTSService,
    private readonly contextExtractor?: IContextExtractor,
    private readonly contextN: number = 3,
    private readonly notifier?: INotificationService,
    private readonly toastBranding?: { appId?: string; icon?: string },
    private readonly ttsApiKey?: string,
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
        void this.emitToast('SubagentStart', 'Subagente iniciado');
        break;

      case 'UserPromptSubmit': {
        // El workflow del turno lo crea exclusivamente `ensureTurnWorkflow` al llegar
        // la request HTTP real; crear aquí produciría workflows sin request body.
        // Locución asíncrona como asistente de voz
        void this.speakAsync(event, 'prompt');
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
        // Resumen de cierre de subagente por voz
        void this.speakAsync(event, 'summary');
        void this.emitToast('SubagentStop', 'Subagente terminado');
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
        // Alerta de fallo por voz
        void this.speakAsync(event, 'summary');
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
        void this.emitToast('SessionStart', 'Sesión iniciada');
        break;

      case 'SessionEnd':
        void this.emitToast('SessionEnd', 'Sesión finalizada');
        break;

      case 'TaskCreated':
        void this.emitToast('TaskCreated', 'Tarea creada');
        break;

      case 'TaskCompleted':
        void this.emitToast('TaskCompleted', 'Tarea completada');
        break;

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
   * Genera un texto mediante LLM usando el contexto del transcript y lo sintetiza por voz.
   * Se ejecuta siempre en segundo plano; nunca propaga errores al flujo principal.
   *
   * @param mode 'prompt' — responde al último mensaje como asistente de voz
   *             'summary' — resume lo ejecutado en el turno finalizado
   */
  private async speakAsync(event: ClaudeHookEvent, mode: 'prompt' | 'summary'): Promise<void> {
    if (!this.tts) return;

    try {
      // 1. Extraer contexto del transcript si está disponible
      //    - 'prompt' (UserPromptSubmit): tríada curada (user + assistant + prompt actual)
      //    - 'summary' (Stop/SubagentStop/StopFailure): últimos N mensajes del turno
      const messages =
        mode === 'prompt'
          ? await this.extractUserPromptContext(event)
          : await this.extractContext(event.transcriptPath);

      // 2. Generar texto con LLM o usar fallback
      const text = await this.generateSpeechText(event.eventName, messages, mode);

      // 3. Sintetizar y reproducir
      await this.tts.speak(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger?.error({ eventName: event.eventName, err: msg }, '[TTS] Error en speakAsync');
    }
  }

  /** Extrae los últimos N mensajes del transcript si la ruta está disponible. */
  private async extractContext(transcriptPath: string | undefined): Promise<SessionMessage[]> {
    if (!transcriptPath || !this.contextExtractor) return [];
    try {
      return await this.contextExtractor.extractLastNMessages(transcriptPath, this.contextN);
    } catch {
      return [];
    }
  }

  /**
   * Extrae la tríada curada para `UserPromptSubmit`:
   *   [penúltimo user del transcript, último assistant, prompt actual].
   * Mapea el `UserPromptContext` del extractor a `SessionMessage[]` (0-3 elementos).
   * Si el extractor o el transcript no están disponibles, devuelve solo el prompt actual.
   */
  private async extractUserPromptContext(event: ClaudeHookEvent): Promise<SessionMessage[]> {
    const messages: SessionMessage[] = [];

    if (this.contextExtractor && event.transcriptPath) {
      try {
        const ctx = await this.contextExtractor.extractUserPromptSubmitContext(
          event.transcriptPath,
          event.prompt ?? '',
        );
        if (ctx.previousUserMessage) {
          messages.push({ role: 'user', text: ctx.previousUserMessage });
        }
        if (ctx.lastAssistantResponse) {
          messages.push({ role: 'assistant', text: ctx.lastAssistantResponse });
        }
      } catch {
        /* extracción fallida: continuar con lo que tengamos */
      }
    }

    messages.push({ role: 'user', text: event.prompt ?? '' });
    return messages;
  }

  /**
   * Construye el prompt para el LLM y obtiene el texto a sintetizar.
   * Si el LLM no está disponible o falla, devuelve el mensaje de fallback.
   */
  private logTtsFallback(eventName: string, reason: string, fallbackText: string): void {
    this.logger?.warn(
      {
        tag: '[TTS-FALLBACK]',
        eventName,
        usedFallback: true,
        reason,
        fallbackText,
      },
      '[TTS] Mensaje genérico de fallback (audio y toast)',
    );
  }

  /**
   * Fallback textual usado cuando el LLM (Gemini Flash) no puede generar el texto
   * a sintetizar. No es un mensaje de TTS: es el texto que se muestra en stdout y
   * en el toast de continuidad cuando la generación de texto falla. La decisión
   * de hablarlo o no la toma el sidecar; este método solo aporta el contenido.
   */
  private composeFallbackText(eventName: string): string {
    switch (eventName) {
      case 'UserPromptSubmit':
        return 'Solicitud recibida. Procesando con Claude.';
      case 'Stop':
        return 'El asistente terminó su turno.';
      case 'SubagentStop':
        return 'El subagente completó su trabajo.';
      case 'StopFailure':
        return 'Ocurrió un error durante la ejecución.';
      default:
        return 'Procesando.';
    }
  }

  private logTtsDynamic(eventName: string, text: string): void {
    this.logger?.info(
      {
        tag: '[TTS-SPEECH]',
        eventName,
        usedFallback: false,
        textPreview: text.slice(0, 120),
      },
      '[TTS] Mensaje dinámico generado',
    );
  }

  private async generateSpeechText(
    eventName: string,
    messages: SessionMessage[],
    mode: 'prompt' | 'summary',
  ): Promise<string> {
    const fallback = this.composeFallbackText(eventName);

    if (!this.ttsApiKey) {
      this.logTtsFallback(eventName, 'no-gemini-key', fallback);
      return fallback;
    }
    if (messages.length === 0) {
      this.logTtsFallback(eventName, 'no-messages', fallback);
      return fallback;
    }

    try {
      const systemPrompt =
        mode === 'prompt' ? VOICE_ASSISTANT_SYSTEM_PROMPT : CONTINUITY_SYSTEM_PROMPT;

      // Gemini usa role "model" (no "assistant") y no acepta role "system" en contents
      const contents = messages.map((m) => ({
        role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
        parts: [{ text: m.role === 'system' ? `[Sistema]: ${m.text}` : m.text }],
      }));

      if (contents.at(-1)?.role !== 'user') {
        contents.push({ role: 'user', parts: [{ text: '¿Qué pasó en este turno?' }] });
      }

      const res = await fetch(`${GEMINI_FLASH_URL}?key=${this.ttsApiKey}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            maxOutputTokens: TTS_MAX_TOKENS,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      });

      if (!res.ok) {
        this.logTtsFallback(eventName, `http-${res.status}`, fallback);
        return fallback;
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      // Las partes de Gemini tienen { text } sin campo `type`; extraer directamente.
      const text = (data.candidates?.[0]?.content?.parts ?? [])
        .map((p) => (typeof p.text === 'string' ? p.text.trim() : ''))
        .filter(Boolean)
        .join(' ')
        .trim();

      if (!text) {
        this.logTtsFallback(eventName, 'empty-response', fallback);
        return fallback;
      }

      this.logTtsDynamic(eventName, text);
      return text;
    } catch {
      this.logTtsFallback(eventName, 'exception', fallback);
      return fallback;
    }
  }

  private async announceStop(event: ClaudeHookEvent): Promise<void> {
    try {
      const messages = await this.extractContext(event.transcriptPath);
      const text = await this.generateSpeechText('Stop', messages, 'summary');
      await Promise.allSettled([this.tts?.speak(text), this.emitToast('Stop', text)]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger?.error({ eventName: 'Stop', err: msg }, '[TTS/Toast] Error en announceStop');
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
