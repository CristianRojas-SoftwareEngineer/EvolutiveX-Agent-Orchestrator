import type { IWorkflowRepository } from '../1-domain/repositories/IWorkflowRepository.js';
import type { Logger } from '../1-domain/types/logger.types.js';
import type { ClaudeHookEvent } from '../1-domain/types/hook.types.js';
import type { ITTSService } from '../1-domain/ports/ITTSService.js';
import type { IContextExtractor, SessionMessage } from '../1-domain/ports/IContextExtractor.js';
import { SessionMetricsService } from '../2-services/session-metrics.service.js';
import { resolveSessionDir } from './audit-workflow-closure.handler.js';
import Anthropic from '@anthropic-ai/sdk';

/** Mensajes de fallback para cada evento si falla el LLM o la extracción de contexto. */
const FALLBACK_SPEECH: Record<string, string> = {
  UserPromptSubmit: 'Solicitud recibida. Procesando con Claude.',
  Stop: 'El asistente terminó su turno.',
  SubagentStop: 'El subagente completó su trabajo.',
  StopFailure: 'Ocurrió un error durante la ejecución.',
};

const VOICE_ASSISTANT_SYSTEM_PROMPT =
  'Eres la voz del asistente Smart Code Proxy. ' +
  'Responde al último mensaje del usuario en una sola oración breve y natural en español, ' +
  'confirmando lo que vas a hacer. Sin puntos al final. Sin markdown.';

const CONTINUITY_SYSTEM_PROMPT =
  'Eres la voz del asistente de continuidad de Smart Code Proxy. ' +
  'En un máximo de tres oraciones cortas en español, resume: ' +
  'qué se completó, qué quedó pendiente y cuál es el estado final. ' +
  'Sin puntos al final de las oraciones. Sin markdown. Habla en primera persona.';

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
        // Locución asíncrona como asistente de voz
        void this.speakAsync(event, 'prompt');
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
        // Resumen de cierre por voz
        void this.speakAsync(event, 'summary');
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
  private async generateSpeechText(
    eventName: string,
    messages: SessionMessage[],
    mode: 'prompt' | 'summary',
  ): Promise<string> {
    const fallback = FALLBACK_SPEECH[eventName] ?? 'Procesando.';

    if (!this.capturedToken || messages.length === 0) return fallback;

    try {
      const model = process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL?.trim() ?? 'claude-haiku-4-5';
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
      const res = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${this.capturedToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model, messages: chatHistory, system: systemPrompt, max_tokens: 150 }),
      });

      if (!res.ok) return fallback;

      const data = await res.json() as { content?: Array<{ type: string; text?: string }> };
      const text = data.content
        ?.filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text.trim())
        .join(' ')
        .trim();

      return text || fallback;
    } catch {
      return fallback;
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
  }

  private async delegateClosure(sessionId: string, workflowId: string): Promise<void> {
    const workflow = this.workflowRepo.getWorkflow(workflowId);
    if (!workflow || (workflow.kind !== 'main' && workflow.kind !== 'subagent')) return;

    const sessionDir = resolveSessionDir(this.auditBaseDir, sessionId);
    const closedSteps = workflow.steps.filter((s) => s.closedAt != null);
    await this.sessionMetrics.finalizeWorkflowMetrics(sessionDir, workflowId, closedSteps);
  }
}
