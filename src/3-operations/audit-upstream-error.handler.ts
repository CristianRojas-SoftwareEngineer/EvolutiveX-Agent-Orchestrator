import * as path from 'node:path';
import type { IAuditWriter } from '../2-services/ports/audit-writer.port.js';
import type { ISessionStore } from '../2-services/ports/session-store.port.js';
import { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';
import {
  InteractionMetadata,
  computeTokenTotals,
  computeSseRawBytesTotal,
} from '../1-domain/types/audit.types.js';

/**
 * Handler para escribir metadata de error cuando falla la conexión upstream.
 * Si hay una interacción activa, cierra la interacción con outcome: "upstream-error".
 */
export class AuditUpstreamErrorHandler {
  constructor(
    private auditWriter: IAuditWriter,
    private config: ProxyEnvironmentConfig,
    private sessionStore: ISessionStore,
  ) {}

  public async execute(params: {
    auditInteractionDir: string;
    requestId: string;
    requestSequence: number;
    auditSessionId: string;
    method: string;
    url: string;
    requestStartTime: number;
    requestBodyBytes: number;
    requestBodyOmitted: boolean;
    error: Error & { code?: string };
  }): Promise<void> {
    const interaction = await this.sessionStore.getInteractionByDir(params.auditInteractionDir);
    this.sessionStore.closeInteraction(params.auditInteractionDir);

    const endedAt = Date.now();
    const interactionType = interaction?.interactionType ?? 'agentic';
    const startedAt = interaction?.startedAt ?? params.requestStartTime;
    const stepsMeta = interaction?.stepsMeta ?? [];
    const requestBodyOmitted = interaction?.requestBodyOmitted ?? params.requestBodyOmitted;

    const totals = interactionType !== 'client-preflight' ? computeTokenTotals(stepsMeta) : null;
    const sseRawBytesTotal = computeSseRawBytesTotal(stepsMeta);
    const sseRawTruncatedAny = stepsMeta.some((s) => s.sseRawTruncatedByLimit === true);
    const hadSse = stepsMeta.some((s) => s.sse === true);
    const errorMessage = params.error?.message ?? String(params.error);
    const errorCode = params.error?.code ?? null;

    const meta: InteractionMetadata = {
      interactionType,
      ...(interaction?.modelId ? { modelId: interaction.modelId } : {}),
      outcome: 'upstream-error',
      stepCount: stepsMeta.length,
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      durationMs: endedAt - startedAt,
      statusCode: null,
      sse: hadSse,
      steps: stepsMeta,
      totals,
      sseResponseBodyAttempted: false,
      sseResponseBodyWritten: false,
      sseResponseBodyError: null,
      sseResponseBodySource: null,
      errorMessage,
      errorCode,
      ...(interaction?.parentContext ? { parentContext: interaction.parentContext } : {}),
      ...(interaction?.sideRequestKind ? { sideRequestKind: interaction.sideRequestKind } : {}),
      ...(interaction?.resolvedInternalTools && interaction.resolvedInternalTools.length > 0
        ? { resolvedInternalTools: interaction.resolvedInternalTools }
        : {}),
      truncation: {
        requestBodyOmitted,
        responseBodyBytesTotal: null,
        responseBodyBytesAudited: null,
        responseTruncatedByProxyBuffer: null,
        responseTruncatedByAuditLimit: null,
        sseRawBytesAudited: sseRawBytesTotal > 0 ? sseRawBytesTotal : null,
        sseRawBytesLimit: null,
        sseRawTruncatedByLimit: sseRawTruncatedAny,
        sseRawWriteError: false,
      },
    };
    await this.auditWriter.writeInteractionMeta(params.auditInteractionDir, meta);

    if (interaction && interactionType !== 'client-preflight' && interaction.modelId && totals) {
      const sessionDir = path.join(this.sessionStore.getBaseDir(), interaction.sessionId);
      await this.sessionStore.withSessionLock(interaction.sessionId, async () => {
        await this.auditWriter
          .updateSessionMetrics(sessionDir, interaction.modelId!, totals, stepsMeta.length)
          .catch(() => {
            /* error no crítico */
          });
      });
    }

    await this.auditWriter.removeInteractionState(params.auditInteractionDir);
  }
}
