import * as path from 'node:path';
import { SessionResolverService } from '../1-domain/services/session-resolver.service.js';
import type { ISessionStore } from '../2-services/ports/session-store.port.js';
import type { IAuditWriter } from '../2-services/ports/audit-writer.port.js';
import { classifyRequestBody } from '../1-domain/services/turn-classifier.service.js';
import {
  ActiveTurn,
  InteractionType,
  StepMeta,
  TurnClassification,
  computeTokenTotals,
  computeSseRawBytesTotal,
} from '../1-domain/types/audit.types.js';
import { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';

interface AuditInteractionResult {
  auditInteractionDir: string;
  requestBodyOmitted: boolean;
  requestSequence: number;
  auditSessionId: string;
  interactionType: InteractionType;
  turnClassification: TurnClassification;
}

/**
 * Handler para orquestar la auditoría de la interacción entrante.
 * Clasifica el request, gestiona turnos activos y escribe la auditoría del request.
 */
export class AuditInteractionHandler {
  constructor(
    private sessionResolver: SessionResolverService,
    private sessionStore: ISessionStore,
    private auditWriter: IAuditWriter,
    private config: ProxyEnvironmentConfig,
  ) {}

  public async execute(params: {
    headers: Record<string, string | string[] | undefined>;
    rawBody: Buffer;
    requestId: string;
  }): Promise<AuditInteractionResult | null> {
    const auditSession = this.sessionResolver.getAuditSessionId(params.headers);
    const auditSessionId = auditSession.sessionId;

    // Detectar y ignorar health checks de Bun que no aportan valor a la observabilidad
    if (this.isIgnorableHealthCheck(params, auditSessionId)) {
      return null;
    }

    // Capturar headers ANTES del strip para preservar cabeceras de sesión en auditoría
    const headersForAudit = { ...params.headers };

    if (this.config.STRIP_AUDIT_SESSION_HEADER && auditSession.stripHeaderName) {
      this.sessionResolver.stripAuditHeaderInPlace(params.headers, auditSession.stripHeaderName);
    }

    const classification = classifyRequestBody(params.rawBody);
    const activeTurn = await this.sessionStore.getActiveTurn(auditSessionId);

    if (classification.type === 'side-request') {
      return this.handleSideRequest(params, headersForAudit, auditSessionId, classification);
    }

    if (classification.type === 'fresh') {
      return this.handleFresh(params, headersForAudit, auditSessionId, classification, activeTurn ? true : false);
    }

    if (classification.type === 'continuation') {
      if (!activeTurn) {
        console.warn('[audit] No active turn found for continuation request — fallback to fresh');
        return this.handleFresh(params, headersForAudit, auditSessionId, { type: 'fresh' }, false);
      }
      return this.handleContinuation(params, headersForAudit, auditSessionId, classification, activeTurn);
    }

    if (classification.type === 'preflight-quota') {
      return this.handlePreflightQuota(params, headersForAudit, auditSessionId, classification);
    }

    if (classification.type === 'preflight-warmup') {
      if (!activeTurn) {
        // Sin turno activo: tratar como fresh (cliente sin herramientas)
        return this.handleFresh(params, headersForAudit, auditSessionId, { type: 'fresh' }, false);
      }
      return this.handlePreflightWarmup(params, headersForAudit, auditSessionId, classification, activeTurn);
    }

    // Fallback inalcanzable
    return this.handleFresh(params, headersForAudit, auditSessionId, { type: 'fresh' }, false);
  }

  private async handleFresh(
    params: { rawBody: Buffer; requestId: string },
    headersForAudit: Record<string, string | string[] | undefined>,
    auditSessionId: string,
    classification: TurnClassification,
    hasInterruptedTurn: boolean,
  ): Promise<AuditInteractionResult> {
    if (hasInterruptedTurn) {
      // Forzar cierre del turno anterior con metadata completa
      const prev = await this.sessionStore.getActiveTurn(auditSessionId);
      if (prev) {
        await this.sessionStore.closeTurn(prev.interactionDir, auditSessionId);
        await this.writeInterruptedTurnMeta(prev);
      }
    }

    const seq = await this.sessionStore.nextAuditInteractionSequence(auditSessionId);
    const folderName = this.sessionResolver.formatAuditInteractionDirName(seq, params.requestId);

    const wr = await this.auditWriter.writeInteractionRequest({
      baseDir: this.sessionStore.getBaseDir(),
      sessionId: auditSessionId,
      folderName,
      headers: headersForAudit,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
    });

    // Escribir steps/001/request para simetría estructural (todos los steps tienen request/)
    const stepDir = path.join(wr.dir, 'steps', '001');
    await this.auditWriter.writeStepRequest({
      stepDir,
      headers: headersForAudit,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
    });

    const startedAt = Date.now();

    // Marcar interacción como en progreso (state.json)
    await this.auditWriter.writeInteractionState(wr.dir, {
      state: 'in-progress',
      startedAt: new Date(startedAt).toISOString(),
      interactionType: 'agentic-turn',
    });

    await this.sessionStore.setActiveTurn(auditSessionId, {
      interactionDir: wr.dir,
      interactionType: 'agentic-turn',
      stepCount: 1,
      requestSequence: seq,
      startedAt,
      requestBodyOmitted: wr.requestBodyOmitted,
      requestBodyBytes: params.rawBody.length,
      stepsMeta: [],
    });

    return {
      auditInteractionDir: wr.dir,
      requestBodyOmitted: wr.requestBodyOmitted,
      requestSequence: seq,
      auditSessionId,
      interactionType: 'agentic-turn',
      turnClassification: classification,
    };
  }

  private async handleContinuation(
    params: { rawBody: Buffer; requestId: string },
    headersForAudit: Record<string, string | string[] | undefined>,
    auditSessionId: string,
    classification: TurnClassification,
    activeTurn: NonNullable<Awaited<ReturnType<ISessionStore['getActiveTurn']>>>,
  ): Promise<AuditInteractionResult> {
    const stepCount = this.sessionStore.incrementStepCountByDir(activeTurn.interactionDir);
    const stepDir = path.join(activeTurn.interactionDir, 'steps', String(stepCount).padStart(3, '0'));

    await this.auditWriter.writeStepRequest({
      stepDir,
      headers: headersForAudit,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
    });

    return {
      auditInteractionDir: activeTurn.interactionDir,
      requestBodyOmitted: activeTurn.requestBodyOmitted,
      requestSequence: activeTurn.requestSequence,
      auditSessionId,
      interactionType: activeTurn.interactionType,
      turnClassification: classification,
    };
  }

  private async handlePreflightQuota(
    params: { rawBody: Buffer; requestId: string },
    headersForAudit: Record<string, string | string[] | undefined>,
    auditSessionId: string,
    classification: TurnClassification,
  ): Promise<AuditInteractionResult> {
    const seq = await this.sessionStore.nextAuditInteractionSequence(auditSessionId);
    const folderName = this.sessionResolver.formatAuditInteractionDirName(seq, params.requestId);

    const wr = await this.auditWriter.writeInteractionRequest({
      baseDir: this.sessionStore.getBaseDir(),
      sessionId: auditSessionId,
      folderName,
      headers: headersForAudit,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
      skipTopLevelRequest: true,
    });

    const stepDir = path.join(wr.dir, 'steps', '001');
    await this.auditWriter.writeStepRequest({
      stepDir,
      headers: headersForAudit,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
    });

    const startedAt = Date.now();

    await this.auditWriter.writeInteractionState(wr.dir, {
      state: 'in-progress',
      startedAt: new Date(startedAt).toISOString(),
      interactionType: 'client-preflight',
    });

    await this.sessionStore.setActiveTurn(auditSessionId, {
      interactionDir: wr.dir,
      interactionType: 'client-preflight',
      stepCount: 1,
      requestSequence: seq,
      startedAt,
      requestBodyOmitted: false,
      requestBodyBytes: params.rawBody.length,
      stepsMeta: [],
    });

    return {
      auditInteractionDir: wr.dir,
      requestBodyOmitted: false,
      requestSequence: seq,
      auditSessionId,
      interactionType: 'client-preflight',
      turnClassification: classification,
    };
  }

  private async handleSideRequest(
    params: { rawBody: Buffer; requestId: string },
    headersForAudit: Record<string, string | string[] | undefined>,
    auditSessionId: string,
    classification: TurnClassification,
  ): Promise<AuditInteractionResult> {
    const seq = await this.sessionStore.nextAuditInteractionSequence(auditSessionId);
    const folderName = this.sessionResolver.formatAuditInteractionDirName(seq, params.requestId);

    const wr = await this.auditWriter.writeInteractionRequest({
      baseDir: this.sessionStore.getBaseDir(),
      sessionId: auditSessionId,
      folderName,
      headers: headersForAudit,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
    });

    // Escribir steps/001/request para simetría estructural
    const stepDir = path.join(wr.dir, 'steps', '001');
    await this.auditWriter.writeStepRequest({
      stepDir,
      headers: headersForAudit,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
    });

    const startedAt = Date.now();

    await this.auditWriter.writeInteractionState(wr.dir, {
      state: 'in-progress',
      startedAt: new Date(startedAt).toISOString(),
      interactionType: 'side-request',
    });

    // Side-request con interactionType propio (no desplaza al turno agentic activo)
    const turn: ActiveTurn = {
      interactionDir: wr.dir,
      interactionType: 'side-request',
      stepCount: 1,
      requestSequence: seq,
      startedAt,
      requestBodyOmitted: wr.requestBodyOmitted,
      requestBodyBytes: params.rawBody.length,
      stepsMeta: [],
    };

    this.sessionStore.registerTurn(wr.dir, turn);

    return {
      auditInteractionDir: wr.dir,
      requestBodyOmitted: wr.requestBodyOmitted,
      requestSequence: seq,
      auditSessionId,
      interactionType: 'side-request',
      turnClassification: classification,
    };
  }

  private async handlePreflightWarmup(
    params: { rawBody: Buffer; requestId: string },
    headersForAudit: Record<string, string | string[] | undefined>,
    auditSessionId: string,
    classification: TurnClassification,
    activeTurn: NonNullable<Awaited<ReturnType<ISessionStore['getActiveTurn']>>>,
  ): Promise<AuditInteractionResult> {
    const stepCount = this.sessionStore.incrementStepCountByDir(activeTurn.interactionDir);
    const stepDir = path.join(activeTurn.interactionDir, 'steps', String(stepCount).padStart(3, '0'));

    await this.auditWriter.writeStepRequest({
      stepDir,
      headers: headersForAudit,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
    });

    return {
      auditInteractionDir: activeTurn.interactionDir,
      requestBodyOmitted: false,
      requestSequence: activeTurn.requestSequence,
      auditSessionId,
      interactionType: 'client-preflight',
      turnClassification: classification,
    };
  }

  /**
   * Escribe el meta.json de un turno interrumpido conservando
   * la información ya disponible (statusCode, sse, totals, sseRawBytes).
   */
  private async writeInterruptedTurnMeta(prev: ActiveTurn): Promise<void> {
    const steps: StepMeta[] = prev.stepsMeta;
    const lastStep = steps.length > 0 ? steps[steps.length - 1] : undefined;
    const statusCode = lastStep?.statusCode ?? null;
    const sse = steps.some((s) => s.sse === true);
    const totals = prev.interactionType !== 'client-preflight'
      ? computeTokenTotals(steps)
      : null;
    const sseRawBytesTotal = computeSseRawBytesTotal(steps);
    const sseRawTruncated = steps.some((s) => s.sseRawTruncatedByLimit === true);

    await this.auditWriter.writeTurnMeta(prev.interactionDir, {
      interactionType: prev.interactionType,
      turnOutcome: 'interrupted',
      stepCount: steps.length,
      startedAt: new Date(prev.startedAt).toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: Date.now() - prev.startedAt,
      statusCode,
      sse,
      steps,
      totals,
      sseResponseBodyAttempted: false,
      sseResponseBodyWritten: false,
      sseResponseBodyError: null,
      sseResponseBodySource: null,
      errorMessage: null,
      errorCode: null,
      truncation: {
        requestBodyOmitted: prev.requestBodyOmitted,
        responseBodyBytesTotal: null,
        responseBodyBytesAudited: null,
        responseTruncatedByProxyBuffer: null,
        responseTruncatedByAuditLimit: null,
        sseRawBytesAudited: sseRawBytesTotal > 0 ? sseRawBytesTotal : null,
        sseRawBytesLimit: null,
        sseRawTruncatedByLimit: sseRawTruncated,
        sseRawWriteError: false,
      },
    });

    // Eliminar state.json al cerrar turno
    await this.auditWriter.removeInteractionState(prev.interactionDir);
  }

  /**
   * Detecta health checks de Bun/Claude Code que no aportan valor a la observabilidad.
   * Criterios (todos deben cumplirse):
   * - User-Agent contiene "Bun" (no "claude-cli")
   * - Body vacío (rawBody.length === 0)
   * - Sin header de autorización
   * - Sin headers de sesión (x-claude-code-session-id ni x-cc-audit-session)
   * - Sesión resuelta a '_unknown' (fallback final)
   */
  private isIgnorableHealthCheck(
    params: { headers: Record<string, string | string[] | undefined>; rawBody: Buffer },
    auditSessionId: string,
  ): boolean {
    // Solo si fallback a _unknown
    if (auditSessionId !== '_unknown') {
      return false;
    }

    // Body debe estar vacío
    if (params.rawBody.length > 0) {
      return false;
    }

    // User-Agent debe ser Bun (no claude-cli)
    const userAgent = this.getHeaderValue(params.headers, 'user-agent') || '';
    if (!userAgent.includes('Bun') || userAgent.includes('claude-cli')) {
      return false;
    }

    // Sin header de autorización
    const auth = this.getHeaderValue(params.headers, 'authorization');
    if (auth) {
      return false;
    }

    // Sin headers de sesión específicos de Claude Code
    const sessionId = this.getHeaderValue(params.headers, 'x-claude-code-session-id');
    const auditSession = this.getHeaderValue(params.headers, 'x-cc-audit-session');
    if (sessionId || auditSession) {
      return false;
    }

    return true;
  }

  /**
   * Helper para obtener un valor de header de forma case-insensitive.
   */
  private getHeaderValue(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string | undefined {
    const lower = name.toLowerCase();
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === lower) {
        const value = headers[key];
        return Array.isArray(value) ? value[0] : value;
      }
    }
    return undefined;
  }
}
