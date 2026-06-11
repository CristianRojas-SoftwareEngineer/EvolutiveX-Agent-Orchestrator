import type { IWorkflowRepository } from '../1-domain/repositories/IWorkflowRepository.js';
import type { IEventBus } from '../1-domain/repositories/IEventBus.js';
import { SessionMetricsService } from '../2-services/session-metrics.service.js';
import type { AnthropicMessage } from '../1-domain/types/anthropic.types.js';
import {
  buildInferenceRequestSnapshot,
  buildWireStep,
  enrichOpenWireStepWithResponse,
  enrichWireStepWithResponseByIndex,
  registerWireStepInCorrelator,
} from './gateway-wire-step.util.js';
import { persistBillableStepMetricsIfNeeded } from './persist-billable-step-metrics.util.js';
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
    private auditBaseDir: string,
    private sessionMetrics: SessionMetricsService,
  ) {}

  public execute(
    stream: NodeJS.ReadableStream,
    context: AuditWorkflowContext,
    _contentType: string,
    responseHeaders?: Record<string, string | string[] | undefined>,
  ): void {
    const workflow = this.workflowRepo.getWorkflow(context.workflowId);
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

        if (parsedBody === undefined) return;

        const openStepAtIndex = workflow.steps.find(
          (s) => s.index === context.assignedStepIndex && s.closedAt == null,
        );
        const inferenceRequest = buildInferenceRequestSnapshot(workflow, {
          step: openStepAtIndex,
        });
        const now = new Date();
        const usage = bodyUsage
          ? {
              input_tokens: bodyUsage.input_tokens ?? 0,
              output_tokens: bodyUsage.output_tokens ?? 0,
              ...(bodyUsage.cache_creation_input_tokens != null
                ? { cache_creation_input_tokens: bodyUsage.cache_creation_input_tokens }
                : {}),
              ...(bodyUsage.cache_read_input_tokens != null
                ? { cache_read_input_tokens: bodyUsage.cache_read_input_tokens }
                : {}),
            }
          : undefined;
        const responsePatch = {
          assistantMessage,
          ...(usage ? { usage } : {}),
          stopReason,
          closedAt: now,
        };
        const wireStep =
          enrichWireStepWithResponseByIndex(
            this.workflowRepo,
            workflow.id,
            context.assignedStepIndex,
            responsePatch,
            stopReason,
          ) ??
          enrichOpenWireStepWithResponse(
            this.workflowRepo,
            workflow.id,
            responsePatch,
            stopReason,
          ) ??
          (() => {
            const fallback = buildWireStep({
              workflow,
              inferenceRequest,
              assistantMessage,
              ...(usage ? { usage } : {}),
              stopReason,
              startedAt: now,
              closedAt: now,
            });
            return registerWireStepInCorrelator(this.workflowRepo, fallback, stopReason);
          })();
        if (!wireStep) return;

        // Paridad con el camino SSE: registrar los `tool_use` client-side observados
        // en el body para emitir `tool_call` e indexar el linkage de continuation.
        if (Array.isArray(assistantMessage.content)) {
          for (const block of assistantMessage.content) {
            if (
              block.type === 'tool_use' &&
              typeof block.id === 'string' &&
              typeof block.name === 'string'
            ) {
              this.workflowRepo.registerToolUse(workflow.id, {
                id: block.id,
                stepId: wireStep.id,
                name: block.name,
                arguments: block.input,
                status: 'running',
                toolUseBlock: block,
              });
            }
          }
        }

        if (bodyUsage) {
          void persistBillableStepMetricsIfNeeded(
            this.sessionMetrics,
            this.auditBaseDir,
            workflow,
            wireStep,
          );
        }

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
