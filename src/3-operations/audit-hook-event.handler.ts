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
import { FALLBACK_SPEECH } from '../2-services/tts/fallback-speech.constants.js';
import { resolveSessionDir } from './audit-workflow-closure.handler.js';
import Anthropic from '@anthropic-ai/sdk';

const VOICE_ASSISTANT_SYSTEM_PROMPT =
  'Eres la voz del asistente Smart Code Proxy. ' +
  'Responde al último mensaje del usuario en una sola oración breve y natural en español, ' +
  'confirmando lo que vas a hacer. Sin puntos al final. Sin markdown.';

const CONTINUITY_SYSTEM_PROMPT =
  'Eres la voz del asistente de continuidad de Smart Code Proxy. ' +
  'En un máximo de tres oraciones cortas en español, resume: ' +
  'qué se completó, qué quedó pendiente y cuál es el estado final. ' +
  'Sin puntos al final de las oraciones. Sin markdown. Habla en primera persona.';

type MessageContentBlock = { type: string; text?: string };

function extractSpeakableTextFromContent(content: MessageContentBlock[] | undefined): string {
  if (!content?.length) return '';
  return content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

export class AuditHookEventHandler {
  private anthropic: Anthropic | undefined;
  private capturedToken: string | undefined;

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
    private readonly upstreamOrigin: string = 'https://api.anthropic.com',
  ) {
    // Instanciar Anthropic solo si hay API key estática disponible en el entorno
    const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN;
    if (apiKey?.trim()) {
      this.anthropic = new Anthropic({ apiKey: apiKey.trim() });
    }
  }

  /**
   * Inicializa el cliente Anthropic con un OAuth Bearer token capturado
   * del primer request autenticado que pasa por el proxy.
   * No-op si el cliente ya fue creado (ya sea por API key estática o por
   * una llamada previa a este método).
   */
  public setAuthToken(token: string): void {
    if (!this.capturedToken && token.trim()) {
      this.capturedToken = token.trim();
    }
    if (!this.anthropic && token.trim()) {
      this.anthropic = new Anthropic({ authToken: token.trim() });
    }
  }

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
        this.workflowRepo.openWorkflow(
          event.sessionId,
          {
            agentId: event.agentId,
            isSubagentRequest: false,
          },
          { workflowKind: 'agentic' },
        );
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
        // Resumen de cierre por voz y toast
        void this.announceStop(event);
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
        // Resumen de cierre de subagente por voz
        void this.speakAsync(event, 'summary');
        void this.emitToast('SubagentStop', 'Subagente terminado');
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
  private async speakAsync(
    event: ClaudeHookEvent,
    mode: 'prompt' | 'summary',
  ): Promise<void> {
    if (!this.tts) return;

    try {
      // 1. Extraer contexto del transcript si está disponible
      const messages = await this.extractContext(event.transcriptPath);

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
    const fallback = FALLBACK_SPEECH[eventName] ?? 'Procesando.';

    // Detectar provider: para bearer auth (OpenRouter, Ollama, etc.) usar env var; para OAuth usar capturedToken
    const isAnthropic = this.upstreamOrigin.includes('api.anthropic.com');
    const envToken = process.env.ANTHROPIC_AUTH_TOKEN?.trim();
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    // Para Anthropic: OAuth capturado o API key estática; para otros providers: token bearer desde env
    const token = isAnthropic
      ? (this.capturedToken || apiKey)
      : (envToken || this.capturedToken);

    if (!token) {
      this.logTtsFallback(eventName, 'no-token', fallback);
      return fallback;
    }
    if (messages.length === 0) {
      this.logTtsFallback(eventName, 'no-messages', fallback);
      return fallback;
    }

    try {
      // || (no ??): una variable vacía ('' tras trim) debe caer al modelo por defecto
      const model = process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL?.trim() || 'claude-haiku-4-5';
      const systemPrompt = mode === 'prompt' ? VOICE_ASSISTANT_SYSTEM_PROMPT : CONTINUITY_SYSTEM_PROMPT;

      // Construir el historial de chat con los mensajes de contexto
      const chatHistory = messages.map((m) => ({
        role: (m.role === 'system' ? 'user' : m.role) as 'user' | 'assistant',
        content: m.role === 'system' ? `[Sistema]: ${m.text}` : m.text,
      }));

      // El último mensaje debe ser de usuario para que el LLM pueda responder
      const lastRole = chatHistory.at(-1)?.role;
      if (lastRole !== 'user') {
        chatHistory.push({ role: 'user', content: '¿Qué pasó en este turno?' });
      }

      const port = process.env.PORT || 8787;

      const baseHeaders = {
        'authorization': `Bearer ${token}`,
        'content-type': 'application/json',
      };

      const headers = isAnthropic
        ? { ...baseHeaders, 'anthropic-version': '2023-06-01' }
        : { ...baseHeaders, 'HTTP-Referer': 'https://smartcodeproxy.local', 'X-Title': 'Smart Code Proxy' };

      // Los modelos thinking (MiniMax-M2.5, laguna-xs.2) consumen tokens en razonamiento
      // antes de producir bloques text; necesitan ≥512 o devuelven empty-response.
      // Ollama cloud rechaza max_tokens >150 (404), por eso mantiene el cap bajo.
      // reasoning: { effort: 'none' } reduce el thinking en OpenRouter pero no lo elimina
      // de forma fiable; MiniMax y Ollama lo ignoran sin error.
      const isOllama = this.upstreamOrigin.includes('localhost:11434');
      const nonAnthropicMaxTokens = isOllama ? 150 : 512;
      const ttsBody = {
        model,
        messages: chatHistory,
        system: systemPrompt,
        max_tokens: isAnthropic ? 150 : nonAnthropicMaxTokens,
        ...(isAnthropic ? {} : { reasoning: { effort: 'none' } }),
      };

      const res = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(ttsBody),
      });

      if (!res.ok) {
        this.logTtsFallback(eventName, `http-${res.status}`, fallback);
        return fallback;
      }

      const data = await res.json() as { content?: MessageContentBlock[] };
      const text = extractSpeakableTextFromContent(data.content);

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
    if (!isError && event.toolName === 'TaskUpdate' && event.toolInput?.['status'] === 'in_progress') {
      const taskInProgressPayload: Record<string, unknown> = { tool_input: event.toolInput };
      const taskMsg = formatTaskInProgressMessage(taskInProgressPayload);
      if (taskMsg) {
        void this.emitToast('TaskInProgress', taskMsg);
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
