import * as path from 'node:path';
import { SessionResolverService } from '../1-domain/services/session-resolver.service.js';
import type { ISessionStore } from '../2-services/ports/session-store.port.js';
import type { IAuditWriter } from '../2-services/ports/audit-writer.port.js';
import { classifyRequestBody } from '../1-domain/services/turn-classifier.service.js';
import {
  InteractionType,
  ParentContext,
  PendingAgentToolUse,
  TurnClassification,
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

    if (classification.type === 'side-request') {
      return this.handleSideRequest(params, headersForAudit, auditSessionId, classification);
    }

    if (classification.type === 'fresh') {
      // Antes de tratar la request como un nuevo turn raíz, comprobar si en la
      // misma sesión hay un agentic-turn padre con tool_uses `Agent` aún sin
      // resolver: si lo hay, esta fresh se anida como subagente bajo el step
      // padre correspondiente.
      const pendingMatch = this.sessionStore.findTurnWithPendingAgents(auditSessionId);
      if (pendingMatch) {
        return this.handleSubagent(
          params,
          headersForAudit,
          auditSessionId,
          classification,
          pendingMatch,
        );
      }
      return this.handleFresh(params, headersForAudit, auditSessionId, classification);
    }

    if (classification.type === 'continuation') {
      return this.handleContinuation(params, headersForAudit, auditSessionId, classification);
    }

    if (classification.type === 'preflight-quota') {
      return this.handlePreflightQuota(params, headersForAudit, auditSessionId, classification);
    }

    if (classification.type === 'preflight-warmup') {
      return this.handlePreflightWarmup(params, headersForAudit, auditSessionId, classification);
    }

    // Fallback inalcanzable
    return this.handleFresh(params, headersForAudit, auditSessionId, { type: 'fresh' });
  }

  private async handleFresh(
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

    this.sessionStore.registerTurn({
      interactionDir: wr.dir,
      interactionType: 'agentic-turn',
      stepCount: 1,
      requestSequence: seq,
      startedAt,
      requestBodyOmitted: wr.requestBodyOmitted,
      requestBodyBytes: params.rawBody.length,
      stepsMeta: [],
      sessionId: auditSessionId,
      pendingAgentToolUses: [],
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

  /**
   * Crea una interacción de subagente anidada bajo el step padre que emitió
   * el tool_use `Agent`. La asignación de la secuencia local del subagente y
   * la escritura del request van serializadas dentro de `withSessionLock`
   * para evitar colisiones con subagentes paralelos en la misma sesión.
   */
  private async handleSubagent(
    params: { rawBody: Buffer; requestId: string },
    headersForAudit: Record<string, string | string[] | undefined>,
    auditSessionId: string,
    classification: TurnClassification,
    match: { turn: { interactionDir: string; pendingAgentToolUses: PendingAgentToolUse[] }; pendings: PendingAgentToolUse[] },
  ): Promise<AuditInteractionResult> {
    return this.sessionStore.withSessionLock(auditSessionId, async () => {
      const parentInteractionDir = match.turn.interactionDir;
      // Si todos los pendings comparten el mismo step padre, lo usamos; si no,
      // tomamos el menor (caso defensivo: en la práctica el SSE registra todos
      // los pendings durante el mismo step antes de ceder el control al cliente).
      const parentStepIndex = match.pendings.reduce(
        (min, p) => Math.min(min, p.stepIndex),
        match.pendings[0].stepIndex,
      );

      // Correlación tool_use ↔ subagente:
      // - 1 pending → unívoco, lo consumimos ya.
      // - >1 pending → ambiguo; dejamos null y el id correcto se conocerá al
      //   recibir el tool_result en la continuation del padre.
      const triggeringToolUseId =
        match.pendings.length === 1 ? match.pendings[0].toolUseId : null;
      const subagentType =
        match.pendings.length === 1 ? match.pendings[0].subagentType : undefined;

      const subSeq = await this.auditWriter.nextSubInteractionSequence(
        parentInteractionDir,
        parentStepIndex,
      );
      const folderName = this.sessionResolver.formatAuditInteractionDirName(subSeq, params.requestId);

      const wr = await this.auditWriter.writeSubInteractionRequest({
        parentInteractionDir,
        parentStepIndex,
        folderName,
        headers: headersForAudit,
        bodyBuffer: params.rawBody,
        maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
      });

      // Escribir steps/001/request del subagente para mantener simetría
      // estructural con el resto de turns.
      const stepDir = path.join(wr.dir, 'steps', '001');
      await this.auditWriter.writeStepRequest({
        stepDir,
        headers: headersForAudit,
        bodyBuffer: params.rawBody,
        maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
      });

      const startedAt = Date.now();
      const parentContext: ParentContext = {
        parentInteractionDir,
        parentStepIndex,
        triggeringToolUseId,
        ...(subagentType ? { subagentType } : {}),
      };

      await this.auditWriter.writeInteractionState(wr.dir, {
        state: 'in-progress',
        startedAt: new Date(startedAt).toISOString(),
        interactionType: 'agentic-turn',
        parentContext,
      });

      // Si la correlación fue unívoca, consumimos el pending en este momento.
      if (triggeringToolUseId) {
        this.sessionStore.consumePendingAgentToolUse(parentInteractionDir, triggeringToolUseId);
      }

      this.sessionStore.registerTurn({
        interactionDir: wr.dir,
        interactionType: 'agentic-turn',
        stepCount: 1,
        requestSequence: subSeq,
        startedAt,
        requestBodyOmitted: wr.requestBodyOmitted,
        requestBodyBytes: params.rawBody.length,
        stepsMeta: [],
        sessionId: auditSessionId,
        pendingAgentToolUses: [],
        parentContext,
      });

      return {
        auditInteractionDir: wr.dir,
        requestBodyOmitted: wr.requestBodyOmitted,
        requestSequence: subSeq,
        auditSessionId,
        interactionType: 'agentic-turn',
        turnClassification: classification,
      };
    });
  }

  private async handleContinuation(
    params: { rawBody: Buffer; requestId: string },
    headersForAudit: Record<string, string | string[] | undefined>,
    auditSessionId: string,
    classification: TurnClassification,
  ): Promise<AuditInteractionResult> {
    const toolUseIds = this.extractToolUseIdsFromBody(params.rawBody);
    const parentTurn = toolUseIds.length > 0
      ? this.sessionStore.getTurnByToolUseId(toolUseIds[0])
      : null;

    if (!parentTurn) {
      console.warn('[audit] No se encontró turno padre para continuation (tool_use_ids:', toolUseIds, ') — creando interacción standalone');
      const result = await this.handleFresh(params, headersForAudit, auditSessionId, { type: 'fresh' });
      // Marcar la interacción como orphan en state.json
      await this.auditWriter.writeInteractionState(result.auditInteractionDir, {
        state: 'in-progress',
        startedAt: new Date().toISOString(),
        interactionType: 'agentic-turn',
        continuationOrphan: true,
      });
      return { ...result, turnClassification: classification };
    }

    const stepCount = this.sessionStore.incrementStepCountByDir(parentTurn.interactionDir);
    const stepDir = path.join(parentTurn.interactionDir, 'steps', String(stepCount).padStart(3, '0'));

    await this.auditWriter.writeStepRequest({
      stepDir,
      headers: headersForAudit,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
    });

    // Si la continuation trae tool_result_ids que correspondan a Agents que
    // quedaron como pending (caso ambiguo no resuelto en handleSubagent),
    // los consumimos aquí: la llegada del tool_result evidencia que el
    // subagente correspondiente ya completó su ciclo.
    for (const toolUseId of toolUseIds) {
      this.sessionStore.consumePendingAgentToolUse(parentTurn.interactionDir, toolUseId);
    }

    return {
      auditInteractionDir: parentTurn.interactionDir,
      requestBodyOmitted: parentTurn.requestBodyOmitted,
      requestSequence: parentTurn.requestSequence,
      auditSessionId,
      interactionType: parentTurn.interactionType,
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

    this.sessionStore.registerTurn({
      interactionDir: wr.dir,
      interactionType: 'client-preflight',
      stepCount: 1,
      requestSequence: seq,
      startedAt,
      requestBodyOmitted: false,
      requestBodyBytes: params.rawBody.length,
      stepsMeta: [],
      sessionId: auditSessionId,
      pendingAgentToolUses: [],
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

    // Side-request con interactionType propio (no desplaza a ningún turno agentic)
    this.sessionStore.registerTurn({
      interactionDir: wr.dir,
      interactionType: 'side-request',
      stepCount: 1,
      requestSequence: seq,
      startedAt,
      requestBodyOmitted: wr.requestBodyOmitted,
      requestBodyBytes: params.rawBody.length,
      stepsMeta: [],
      sessionId: auditSessionId,
      pendingAgentToolUses: [],
    });

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

    this.sessionStore.registerTurn({
      interactionDir: wr.dir,
      interactionType: 'client-preflight',
      stepCount: 1,
      requestSequence: seq,
      startedAt,
      requestBodyOmitted: wr.requestBodyOmitted,
      requestBodyBytes: params.rawBody.length,
      stepsMeta: [],
      sessionId: auditSessionId,
      pendingAgentToolUses: [],
    });

    return {
      auditInteractionDir: wr.dir,
      requestBodyOmitted: wr.requestBodyOmitted,
      requestSequence: seq,
      auditSessionId,
      interactionType: 'client-preflight',
      turnClassification: classification,
    };
  }

  /**
   * Extrae todos los tool_use_id de los bloques tool_result del body de una continuation.
   * Path: messages[-1].content[*].tool_use_id donde type === "tool_result".
   */
  private extractToolUseIdsFromBody(body: Buffer): string[] {
    try {
      const json = JSON.parse(body.toString('utf8'));
      const messages: unknown[] = json?.messages;
      if (!Array.isArray(messages) || messages.length === 0) return [];
      const lastMsg = messages[messages.length - 1] as Record<string, unknown>;
      const content = lastMsg?.content;
      if (!Array.isArray(content)) return [];
      const ids: string[] = [];
      for (const item of content) {
        const block = item as Record<string, unknown>;
        if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
          ids.push(block.tool_use_id);
        }
      }
      return ids;
    } catch {
      return [];
    }
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
