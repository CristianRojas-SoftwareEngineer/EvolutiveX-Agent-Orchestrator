import type { IAuditWriter } from '../2-services/ports/audit-writer.port.js';
import type { ISessionStore } from '../2-services/ports/session-store.port.js';
import { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';
import {
  TurnMetadata,
  computeTokenTotals,
  computeSseRawBytesTotal,
} from '../1-domain/types/audit.types.js';

/**
 * Handler para escribir metadata de error cuando falla la conexión upstream.
 * Si hay un turno activo, cierra el turno con turnOutcome: "upstream-error".
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
    const turn = await this.sessionStore.getTurnByDir(params.auditInteractionDir);
    this.sessionStore.closeTurn(params.auditInteractionDir);

    const endedAt = Date.now();
    const interactionType = turn?.interactionType ?? 'agentic-turn';
    const startedAt = turn?.startedAt ?? params.requestStartTime;
    const stepsMeta = turn?.stepsMeta ?? [];
    const requestBodyOmitted = turn?.requestBodyOmitted ?? params.requestBodyOmitted;

    const totals =
      interactionType !== 'client-preflight' ? computeTokenTotals(stepsMeta) : null;
    const sseRawBytesTotal = computeSseRawBytesTotal(stepsMeta);
    const sseRawTruncatedAny = stepsMeta.some((s) => s.sseRawTruncatedByLimit === true);
    const hadSse = stepsMeta.some((s) => s.sse === true);
    const errorMessage = params.error?.message ?? String(params.error);
    const errorCode = params.error?.code ?? null;

    const meta: TurnMetadata = {
      interactionType,
      turnOutcome: 'upstream-error',
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
      ...(turn?.parentContext ? { parentContext: turn.parentContext } : {}),
      ...(turn?.contextSyncFallback ? { contextSyncFallback: true } : {}),
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
    await this.auditWriter.writeTurnMeta(params.auditInteractionDir, meta);
    await this.auditWriter.removeInteractionState(params.auditInteractionDir);
  }
}
