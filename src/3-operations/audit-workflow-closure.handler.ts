import * as path from 'node:path';
import type { IWorkflow } from '../1-domain/interfaces/gateway/IWorkflow.js';
import { SessionMetricsService } from '../2-services/session-metrics.service.js';

export interface AuditWorkflowClosureContext {
  sessionDir: string;
  workflow: IWorkflow;
}

/**
 * Actualiza métricas de sesión al cierre de un workflow main.
 * Meta.json y state.json los proyecta SessionPersistence vía bus.
 */
export class AuditWorkflowClosureHandler {
  constructor(private readonly sessionMetrics: SessionMetricsService) {}

  public async execute(ctx: AuditWorkflowClosureContext): Promise<void> {
    if (ctx.workflow.kind !== 'main') return;
    const closedSteps = ctx.workflow.steps.filter((s) => s.closedAt != null);
    await this.sessionMetrics.finalizeWorkflowMetrics(ctx.sessionDir, ctx.workflow.id, closedSteps);
  }
}

/** Resuelve directorio de sesión desde la raíz de auditoría. */
export function resolveSessionDir(auditBaseDir: string, sessionId: string): string {
  return path.join(auditBaseDir, sessionId);
}
