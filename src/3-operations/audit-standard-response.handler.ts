import type { IWorkflowRepository } from '../1-domain/repositories/IWorkflowRepository.js';
import type { IEventBus } from '../1-domain/repositories/IEventBus.js';
import type { AnthropicMessage } from '../1-domain/types/anthropic.types.js';
import {
  buildInferenceRequestSnapshot,
  buildWireStep,
  registerWireStepInCorrelator,
} from './gateway-wire-step.util.js';
import { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';
import { AuditWorkflowContext } from '../1-domain/types/audit.types.js';

/**
 * Handler para orquestar la auditoría de respuestas estándar (no-SSE).
 * Registra el step en el correlador y emite `step_response` para que
 * SessionPersistence escriba el body/headers a disco. Meta.json lo proyecta
 * SessionPersistence al recibir `workflow_complete` vía bus.
 */
export class AuditStandardResponseHandler {
  constructor(
    private eventBus: IEventBus,
    private config: ProxyEnvironmentConfig,
    private workflowRepo: IWorkflowRepository,
  ) {}

  public execute(
    stream: NodeJS.ReadableStream,
    context: AuditWorkflowContext,
    _contentType: string,
    responseHeaders?: Record<string, string | string[] | undefined>,
  ): void {
    const workflow = this.workflowRepo.getWorkflowBySessionId(context.auditSessionId);
    if (!workflow) return;

    const chunks: Buffer[] = [];
    const maxBuffer = this.config.MAX_RESPONSE_BUFFER_BYTES;
    let totalBytes = 0;

    stream.on('error', (err) => {
      console.error('Error en stream no-SSE:', err);
      this.workflowRepo.forceClose(workflow.id, 'api_error');
    });

    stream.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes <= maxBuffer) {
        chunks.push(chunk);
      }
    });

    stream.on('end', () => {
      try {
        const buf = Buffer.concat(chunks);

        let bodyUsage:
          | {
              input_tokens?: number;
              output_tokens?: number;
              cache_creation_input_tokens?: number;
              cache_read_input_tokens?: number;
            }
          | undefined;
        let stopReason: string | undefined;
        let assistantMessage: AnthropicMessage = { role: 'assistant', content: [] };
        let parsedBody: unknown;

        try {
          const json = JSON.parse(buf.toString('utf8')) as Record<string, unknown>;
          parsedBody = json;
          if (json.usage && typeof json.usage === 'object') {
            bodyUsage = json.usage as typeof bodyUsage;
          }
          if (typeof json.stop_reason === 'string') stopReason = json.stop_reason;
          if (Array.isArray(json.content)) {
            assistantMessage = {
              role: 'assistant',
              content: json.content as AnthropicMessage['content'],
            };
          }
        } catch {
          // Body no es JSON válido — no hay usage ni stopReason
        }

        if (!bodyUsage) return;

        const inferenceRequest = buildInferenceRequestSnapshot(workflow);
        const now = new Date();
        const wireStep = buildWireStep({
          workflow,
          inferenceRequest,
          assistantMessage,
          usage: {
            input_tokens: bodyUsage.input_tokens ?? 0,
            output_tokens: bodyUsage.output_tokens ?? 0,
            ...(bodyUsage.cache_creation_input_tokens != null
              ? { cache_creation_input_tokens: bodyUsage.cache_creation_input_tokens }
              : {}),
            ...(bodyUsage.cache_read_input_tokens != null
              ? { cache_read_input_tokens: bodyUsage.cache_read_input_tokens }
              : {}),
          },
          stopReason,
          startedAt: now,
          closedAt: now,
        });
        registerWireStepInCorrelator(this.workflowRepo, wireStep, stopReason);

        this.eventBus.publish({
          type: 'step_response',
          sessionId: workflow.sessionId,
          workflowId: workflow.id,
          timestamp: new Date().toISOString(),
          payload: {
            workflowId: workflow.id,
            stepIndex: wireStep.index,
            response: parsedBody,
            ...(responseHeaders ? { headers: responseHeaders } : {}),
          },
        });
      } catch (err) {
        console.error('Error al procesar respuesta estándar:', err);
      }
    });
  }
}
