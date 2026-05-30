import * as path from 'node:path';
import type { IWorkflow } from '../1-domain/interfaces/gateway/IWorkflow.js';
import type { IWorkflowResult } from '../1-domain/interfaces/gateway/IWorkflowResult.js';
import type { ClaudeHookEvent } from '../1-domain/types/hook.types.js';
import type { ActiveInteraction } from '../1-domain/types/audit.types.js';
import type { IAuditWriter } from '../2-services/ports/audit-writer.port.js';
import { SessionMetricsService } from '../2-services/session-metrics.service.js';
import { projectWorkflowResultToInteractionMetadata } from '../2-services/workflow-result-projector.service.js';
import type { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';

export interface AuditWorkflowClosureContext {
  sessionDir: string;
  interactionDir: string;
  workflow: IWorkflow;
  result: IWorkflowResult;
  hook: ClaudeHookEvent;
  turn: ActiveInteraction;
}

/**
 * Proyecta `IWorkflowResult` a `meta.json` y actualiza métricas de sesión (solo main).
 */
export class AuditWorkflowClosureHandler {
  constructor(
    private readonly auditWriter: IAuditWriter,
    private readonly sessionMetrics: SessionMetricsService,
    private readonly config: ProxyEnvironmentConfig,
  ) {}

  public async execute(ctx: AuditWorkflowClosureContext): Promise<void> {
    const closedSteps = ctx.workflow.steps.filter((s) => s.closedAt != null);
    const meta = projectWorkflowResultToInteractionMetadata({
      result: ctx.result,
      workflow: ctx.workflow,
      turn: ctx.turn,
      config: this.config,
      sse: ctx.turn.stepsMeta.some((s) => s.sse === true),
    });

    await this.auditWriter.writeInteractionMeta(ctx.interactionDir, meta);
    await this.auditWriter.removeInteractionState(ctx.interactionDir);

    if (ctx.workflow.kind === 'main') {
      await this.sessionMetrics.updateFromWorkflow(ctx.sessionDir, closedSteps);
    }
  }

  /**
   * @deprecated-fallback Cierre wire-only cuando los hooks no cerraron el workflow.
   * Usa el mismo projector que la ruta hook-driven.
   */
  public async executeWireFallback(params: {
    sessionDir: string;
    interactionDir: string;
    workflow: IWorkflow;
    result: IWorkflowResult;
    turn: ActiveInteraction;
    hook: ClaudeHookEvent;
  }): Promise<void> {
    await this.execute({
      sessionDir: params.sessionDir,
      interactionDir: params.interactionDir,
      workflow: params.workflow,
      result: params.result,
      hook: params.hook,
      turn: params.turn,
    });
  }
}

/** Resuelve directorio de sesión desde la raíz de auditoría. */
export function resolveSessionDir(auditBaseDir: string, sessionId: string): string {
  return path.join(auditBaseDir, sessionId);
}
