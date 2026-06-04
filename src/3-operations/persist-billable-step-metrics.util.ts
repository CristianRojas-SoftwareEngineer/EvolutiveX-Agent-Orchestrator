import type { IStep } from '../1-domain/interfaces/gateway/IStep.js';
import type { IWorkflow } from '../1-domain/interfaces/gateway/IWorkflow.js';
import { isStepBillableForSessionMetrics } from '../1-domain/services/gateway/is-step-billable-for-session-metrics.js';
import type { SessionMetricsService } from '../2-services/session-metrics.service.js';
import { resolveSessionDir } from './audit-workflow-closure.handler.js';

/** Persiste métricas per-step para workflows main con hop terminal contable (G16). */
export async function persistBillableStepMetricsIfNeeded(
  sessionMetrics: SessionMetricsService,
  auditBaseDir: string,
  workflow: IWorkflow,
  step: IStep,
  stopReason: string | undefined,
): Promise<void> {
  if (workflow.kind !== 'main') return;
  if (!isStepBillableForSessionMetrics(stopReason)) return;
  if (step.usage == null) return;

  const sessionDir = resolveSessionDir(auditBaseDir, workflow.sessionId);
  await sessionMetrics.updateFromStep(sessionDir, step);
}
