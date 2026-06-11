import type { IStep } from '../1-domain/interfaces/gateway/IStep.js';
import type { IWorkflow } from '../1-domain/interfaces/gateway/IWorkflow.js';
import type { SessionMetricsService } from '../2-services/session-metrics.service.js';
import { resolveSessionDir } from './audit-workflow-closure.handler.js';

/** Persiste métricas per-step para workflows agénticos con usage disponible (G16′). */
export async function persistBillableStepMetricsIfNeeded(
  sessionMetrics: SessionMetricsService,
  auditBaseDir: string,
  workflow: IWorkflow,
  step: IStep,
): Promise<void> {
  if (workflow.kind !== 'main' && workflow.kind !== 'subagent') return;
  if (step.usage == null) return;

  const sessionDir = resolveSessionDir(auditBaseDir, workflow.sessionId);
  await sessionMetrics.updateFromStep(sessionDir, step);
}
