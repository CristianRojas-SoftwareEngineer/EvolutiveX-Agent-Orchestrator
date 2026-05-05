import * as path from 'node:path';
import { SessionResolverService } from '../1-domain/services/session-resolver.service.js';
import type { ISessionStore } from '../2-services/ports/session-store.port.js';
import type { IAuditWriter } from '../2-services/ports/audit-writer.port.js';
import {
  classifyRequestBody,
  extractModelFromRequestBody,
} from '../1-domain/services/request-classifier.service.js';
import {
  ActiveInteraction,
  InteractionType,
  MarkdownRenderContext,
  ParentContext,
  PendingAgentToolUse,
  PendingWebSearchToolUse,
  RequestClassification,
  computeTokenTotals,
  computeSseRawBytesTotal,
} from '../1-domain/types/audit.types.js';
import { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';
import type { Logger } from '../1-domain/types/logger.types.js';
import {
  DIR_MAIN_AGENT,
  DIR_INTERACTIONS,
  DIR_SIDE_INTERACTIONS,
  DIR_STEPS,
  PREFIX_SUB_AGENT,
  PAD_STEP,
  PAD_SUB_AGENT,
} from '../1-domain/constants/audit-paths.js';

export interface AuditInteractionResult {
  auditInteractionDir: string;
  requestBodyOmitted: boolean;
  requestSequence: number;
  auditSessionId: string;
  interactionType: InteractionType;
  requestClassification: RequestClassification;
}

/**
 * Handler para orquestar la auditoría de la interacción entrante.
 * Clasifica el request, gestiona interacciones activas y escribe la auditoría del request.
 */
export class AuditInteractionHandler {
  /** Umbral de antigüedad (ms) para considerar una interacción awaiting como orphan. */
  static readonly ORPHAN_MAX_AGE_MS = 60_000;

  constructor(
    private sessionResolver: SessionResolverService,
    private sessionStore: ISessionStore,
    private auditWriter: IAuditWriter,
    private config: ProxyEnvironmentConfig,
    private logger?: Logger,
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
      // Cleanup de interacciones orphan: cerrar interacciones stale que esperan continuation
      // que nunca llegó (tool call malformado, cancelación, etc.).
      await this.closeOrphanInteractions(auditSessionId);

      // Verificar si es una llamada de implementación de web_search: el harness
      // ejecuta WebSearch haciendo una llamada interna a la API que el proxy
      // captura como fresh. Si hay un pending web_search, redirigir como step
      // adicional del padre en lugar de crear un sub-agente.
      const webSearchPending = this.sessionStore.findInteractionWithPendingWebSearch(auditSessionId);
      if (webSearchPending) {
        return this.handleWebSearchStep(
          params,
          headersForAudit,
          auditSessionId,
          classification,
          webSearchPending,
        );
      }

      // Antes de tratar la request como una nueva interacción raíz, comprobar si en la
      // misma sesión hay un agentic padre con tool_uses `Agent` aún sin
      // resolver: si lo hay, esta fresh se anida como subagente bajo el step
      // padre correspondiente.
      const pendingMatch = this.sessionStore.findInteractionWithPendingAgents(auditSessionId);
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
    classification: RequestClassification,
  ): Promise<AuditInteractionResult> {
    const seq = await this.sessionStore.nextMainAgentSequence(auditSessionId);
    const folderName = this.sessionResolver.formatAuditInteractionDirName(seq);
    const interactionDir = path.join(
      this.sessionStore.getBaseDir(),
      auditSessionId,
      DIR_MAIN_AGENT,
      DIR_INTERACTIONS,
      folderName,
    );

    const wr = await this.auditWriter.writeInteractionRequest({
      interactionDir,
      headers: headersForAudit,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
      context: { interactionType: 'agentic', stepIndex: 1 },
    });

    // Escribir steps/01/request para simetría estructural (todos los steps tienen request/)
    const stepDir = path.join(interactionDir, DIR_STEPS, String(1).padStart(PAD_STEP, '0'));
    await this.auditWriter.writeStepRequest({
      stepDir,
      headers: headersForAudit,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
      context: { interactionType: 'agentic', stepIndex: 1 },
    });

    const startedAt = Date.now();

    // Marcar interacción como en progreso (state.json)
    await this.auditWriter.writeInteractionState(interactionDir, {
      state: 'in-progress',
      startedAt: new Date(startedAt).toISOString(),
      interactionType: 'agentic',
    });

    this.sessionStore.registerInteraction({
      interactionDir,
      interactionType: 'agentic',
      stepCount: 1,
      requestSequence: seq,
      startedAt,
      requestBodyOmitted: wr.requestBodyOmitted,
      requestBodyBytes: params.rawBody.length,
      stepsMeta: [],
      sessionId: auditSessionId,
      pendingAgentToolUses: [],
      pendingWebSearchToolUses: [],
      modelId: extractModelFromRequestBody(params.rawBody) ?? undefined,
    });

    return {
      auditInteractionDir: interactionDir,
      requestBodyOmitted: wr.requestBodyOmitted,
      requestSequence: seq,
      auditSessionId,
      interactionType: 'agentic',
      requestClassification: classification,
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
    classification: RequestClassification,
    match: {
      interaction: { interactionDir: string; pendingAgentToolUses: PendingAgentToolUse[] };
      pendings: PendingAgentToolUse[];
    },
  ): Promise<AuditInteractionResult> {
    return this.sessionStore.withSessionLock(auditSessionId, async () => {
      const parentInteractionDir = match.interaction.interactionDir;
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
      const triggeringToolUseId = match.pendings.length === 1 ? match.pendings[0].toolUseId : null;
      const subagentType = match.pendings.length === 1 ? match.pendings[0].subagentType : undefined;

      const subSeq = await this.auditWriter.nextSubInteractionSequence(
        parentInteractionDir,
        parentStepIndex,
      );
      const folderName = `${PREFIX_SUB_AGENT}-${String(subSeq).padStart(PAD_SUB_AGENT, '0')}`;

      const subagentContext: MarkdownRenderContext = {
        interactionType: 'agentic',
        subagentType: subagentType ?? match.pendings[0]?.subagentType,
        stepIndex: 1,
      };

      const wr = await this.auditWriter.writeSubInteractionRequest({
        parentInteractionDir,
        parentStepIndex,
        folderName,
        headers: headersForAudit,
        bodyBuffer: params.rawBody,
        maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
        context: subagentContext,
      });

      // Escribir steps/01/request del subagente para mantener simetría estructural.
      const stepDir = path.join(wr.dir, DIR_STEPS, String(1).padStart(PAD_STEP, '0'));
      await this.auditWriter.writeStepRequest({
        stepDir,
        headers: headersForAudit,
        bodyBuffer: params.rawBody,
        maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
        context: subagentContext,
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
        interactionType: 'agentic',
        parentContext,
      });

      // Si la correlación fue unívoca, consumimos el pending en este momento.
      if (triggeringToolUseId) {
        this.sessionStore.consumePendingAgentToolUse(parentInteractionDir, triggeringToolUseId);
      }

      this.sessionStore.registerInteraction({
        interactionDir: wr.dir,
        interactionType: 'agentic',
        stepCount: 1,
        requestSequence: subSeq,
        startedAt,
        requestBodyOmitted: wr.requestBodyOmitted,
        requestBodyBytes: params.rawBody.length,
        stepsMeta: [],
        sessionId: auditSessionId,
        pendingAgentToolUses: [],
      pendingWebSearchToolUses: [],
        parentContext,
        modelId: extractModelFromRequestBody(params.rawBody) ?? undefined,
      });

      return {
        auditInteractionDir: wr.dir,
        requestBodyOmitted: wr.requestBodyOmitted,
        requestSequence: subSeq,
        auditSessionId,
        interactionType: 'agentic',
        requestClassification: classification,
      };
    });
  }

  /**
   * Registra la llamada de implementación de WebSearch como un step adicional
   * dentro de la interacción padre que emitió el tool_use `web_search`. No crea
   * una interacción independiente — el request/response del harness se escriben
   * en `steps/NN/` del padre, igual que cualquier otro step de ejecución de tool.
   */
  private async handleWebSearchStep(
    params: { rawBody: Buffer; requestId: string },
    headersForAudit: Record<string, string | string[] | undefined>,
    auditSessionId: string,
    classification: RequestClassification,
    match: {
      interaction: { interactionDir: string; pendingWebSearchToolUses: PendingWebSearchToolUse[] };
      pendings: PendingWebSearchToolUse[];
    },
  ): Promise<AuditInteractionResult> {
    const parentInteractionDir = match.interaction.interactionDir;
    this.sessionStore.consumeWebSearchPending(parentInteractionDir);

    // Determinar el siguiente número de step del padre
    const stepCount = this.sessionStore.incrementStepCountByDir(parentInteractionDir);
    const stepDir = path.join(
      parentInteractionDir,
      DIR_STEPS,
      String(stepCount).padStart(PAD_STEP, '0'),
    );

    await this.auditWriter.writeStepRequest({
      stepDir,
      headers: headersForAudit,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
      context: {
        interactionType: 'agentic',
        stepIndex: stepCount,
      },
    });

    return {
      auditInteractionDir: parentInteractionDir,
      requestBodyOmitted: false,
      requestSequence: 0,
      auditSessionId,
      interactionType: 'agentic',
      requestClassification: classification,
    };
  }

  private async handleContinuation(
    params: { rawBody: Buffer; requestId: string },
    headersForAudit: Record<string, string | string[] | undefined>,
    auditSessionId: string,
    classification: RequestClassification,
  ): Promise<AuditInteractionResult> {
    const toolUseIds = this.extractToolUseIdsFromBody(params.rawBody);
    const parentInteraction =
      toolUseIds.length > 0 ? this.sessionStore.getInteractionByToolUseId(toolUseIds[0]) : null;

    if (!parentInteraction) {
      console.warn(
        '[audit] No se encontró turno padre para continuation (tool_use_ids:',
        toolUseIds,
        ') — creando interacción standalone',
      );
      const result = await this.handleFresh(params, headersForAudit, auditSessionId, {
        type: 'fresh',
      });
      // Marcar la interacción como orphan en state.json
      await this.auditWriter.writeInteractionState(result.auditInteractionDir, {
        state: 'in-progress',
        startedAt: new Date().toISOString(),
        interactionType: 'agentic',
        continuationOrphan: true,
      });
      return { ...result, requestClassification: classification };
    }

    // Limpiar flag de espera: la continuation esperada acaba de llegar.
    parentInteraction.awaitingContinuation = false;
    parentInteraction.awaitingSince = undefined;

    const stepCount = this.sessionStore.incrementStepCountByDir(parentInteraction.interactionDir);
    const stepDir = path.join(
      parentInteraction.interactionDir,
      DIR_STEPS,
      String(stepCount).padStart(PAD_STEP, '0'),
    );

    await this.auditWriter.writeStepRequest({
      stepDir,
      headers: headersForAudit,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
      context: {
        interactionType: parentInteraction.interactionType,
        stepIndex: stepCount,
      },
    });

    // Si la continuation trae tool_result_ids que correspondan a Agents que
    // quedaron como pending (caso ambiguo no resuelto en handleSubagent),
    // los consumimos aquí: la llegada del tool_result evidencia que el
    // subagente correspondiente ya completó su ciclo.
    for (const toolUseId of toolUseIds) {
      this.sessionStore.consumePendingAgentToolUse(parentInteraction.interactionDir, toolUseId);
    }

    return {
      auditInteractionDir: parentInteraction.interactionDir,
      requestBodyOmitted: parentInteraction.requestBodyOmitted,
      requestSequence: parentInteraction.requestSequence,
      auditSessionId,
      interactionType: parentInteraction.interactionType,
      requestClassification: classification,
    };
  }

  private async handlePreflightQuota(
    params: { rawBody: Buffer; requestId: string },
    headersForAudit: Record<string, string | string[] | undefined>,
    auditSessionId: string,
    classification: RequestClassification,
  ): Promise<AuditInteractionResult> {
    const seq = await this.sessionStore.nextSideInteractionSequence(auditSessionId);
    const folderName = this.sessionResolver.formatAuditInteractionDirName(seq);
    const interactionDir = path.join(
      this.sessionStore.getBaseDir(),
      auditSessionId,
      DIR_SIDE_INTERACTIONS,
      folderName,
    );

    await this.auditWriter.writeInteractionRequest({
      interactionDir,
      headers: headersForAudit,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
      skipTopLevelRequest: true,
    });

    const stepDir = path.join(interactionDir, DIR_STEPS, String(1).padStart(PAD_STEP, '0'));
    await this.auditWriter.writeStepRequest({
      stepDir,
      headers: headersForAudit,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
      context: { interactionType: 'client-preflight', stepIndex: 1 },
    });

    const startedAt = Date.now();

    await this.auditWriter.writeInteractionState(interactionDir, {
      state: 'in-progress',
      startedAt: new Date(startedAt).toISOString(),
      interactionType: 'client-preflight',
    });

    this.sessionStore.registerInteraction({
      interactionDir,
      interactionType: 'client-preflight',
      stepCount: 1,
      requestSequence: seq,
      startedAt,
      requestBodyOmitted: false,
      requestBodyBytes: params.rawBody.length,
      stepsMeta: [],
      sessionId: auditSessionId,
      pendingAgentToolUses: [],
      pendingWebSearchToolUses: [],
      modelId: extractModelFromRequestBody(params.rawBody) ?? undefined,
    });

    return {
      auditInteractionDir: interactionDir,
      requestBodyOmitted: false,
      requestSequence: seq,
      auditSessionId,
      interactionType: 'client-preflight',
      requestClassification: classification,
    };
  }

  private async handleSideRequest(
    params: { rawBody: Buffer; requestId: string },
    headersForAudit: Record<string, string | string[] | undefined>,
    auditSessionId: string,
    classification: RequestClassification,
  ): Promise<AuditInteractionResult> {
    const seq = await this.sessionStore.nextSideInteractionSequence(auditSessionId);
    const folderName = this.sessionResolver.formatAuditInteractionDirName(seq);
    const interactionDir = path.join(
      this.sessionStore.getBaseDir(),
      auditSessionId,
      DIR_SIDE_INTERACTIONS,
      folderName,
    );

    const wr = await this.auditWriter.writeInteractionRequest({
      interactionDir,
      headers: headersForAudit,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
      context: { interactionType: 'side-request', stepIndex: 1 },
    });

    // Escribir steps/01/request para simetría estructural
    const stepDir = path.join(interactionDir, DIR_STEPS, String(1).padStart(PAD_STEP, '0'));
    await this.auditWriter.writeStepRequest({
      stepDir,
      headers: headersForAudit,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
      context: { interactionType: 'side-request', stepIndex: 1 },
    });

    const startedAt = Date.now();

    await this.auditWriter.writeInteractionState(interactionDir, {
      state: 'in-progress',
      startedAt: new Date(startedAt).toISOString(),
      interactionType: 'side-request',
    });

    // Side-request con interactionType propio (no desplaza a ningún turno agentic)
    this.sessionStore.registerInteraction({
      interactionDir,
      interactionType: 'side-request',
      stepCount: 1,
      requestSequence: seq,
      startedAt,
      requestBodyOmitted: wr.requestBodyOmitted,
      requestBodyBytes: params.rawBody.length,
      stepsMeta: [],
      sessionId: auditSessionId,
      pendingAgentToolUses: [],
      pendingWebSearchToolUses: [],
      modelId: extractModelFromRequestBody(params.rawBody) ?? undefined,
    });

    return {
      auditInteractionDir: interactionDir,
      requestBodyOmitted: wr.requestBodyOmitted,
      requestSequence: seq,
      auditSessionId,
      interactionType: 'side-request',
      requestClassification: classification,
    };
  }

  private async handlePreflightWarmup(
    params: { rawBody: Buffer; requestId: string },
    headersForAudit: Record<string, string | string[] | undefined>,
    auditSessionId: string,
    classification: RequestClassification,
  ): Promise<AuditInteractionResult> {
    const seq = await this.sessionStore.nextSideInteractionSequence(auditSessionId);
    const folderName = this.sessionResolver.formatAuditInteractionDirName(seq);
    const interactionDir = path.join(
      this.sessionStore.getBaseDir(),
      auditSessionId,
      DIR_SIDE_INTERACTIONS,
      folderName,
    );

    await this.auditWriter.writeInteractionRequest({
      interactionDir,
      headers: headersForAudit,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
      skipTopLevelRequest: true,
    });

    const stepDir = path.join(interactionDir, DIR_STEPS, String(1).padStart(PAD_STEP, '0'));
    await this.auditWriter.writeStepRequest({
      stepDir,
      headers: headersForAudit,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
      context: { interactionType: 'client-preflight', stepIndex: 1 },
    });

    const startedAt = Date.now();

    await this.auditWriter.writeInteractionState(interactionDir, {
      state: 'in-progress',
      startedAt: new Date(startedAt).toISOString(),
      interactionType: 'client-preflight',
    });

    this.sessionStore.registerInteraction({
      interactionDir,
      interactionType: 'client-preflight',
      stepCount: 1,
      requestSequence: seq,
      startedAt,
      requestBodyOmitted: false,
      requestBodyBytes: params.rawBody.length,
      stepsMeta: [],
      sessionId: auditSessionId,
      pendingAgentToolUses: [],
      pendingWebSearchToolUses: [],
      modelId: extractModelFromRequestBody(params.rawBody) ?? undefined,
    });

    return {
      auditInteractionDir: interactionDir,
      requestBodyOmitted: false,
      requestSequence: seq,
      auditSessionId,
      interactionType: 'client-preflight',
      requestClassification: classification,
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
   * Cierra turnos orphan de la sesión: aquellos marcados como
   * `awaitingContinuation` cuyo tiempo de espera supera el umbral.
   * Se invoca antes de procesar una nueva fresh interaction.
   */
  private async closeOrphanInteractions(sessionId: string): Promise<void> {
    const stale = this.sessionStore.findStaleInteractionsAwaitingContinuation(
      sessionId,
      AuditInteractionHandler.ORPHAN_MAX_AGE_MS,
    );
    for (const interaction of stale) {
      await this.closeOrphanInteraction(interaction);
    }
  }

  /**
   * Cierra un turno orphan individual, escribiendo meta.json con
   * `outcome: 'orphaned'` e información forense, y eliminando state.json.
   */
  public async closeOrphanInteraction(interaction: ActiveInteraction): Promise<void> {
    const endedAt = Date.now();
    const sseRawBytesLimit = Number.isFinite(this.config.MAX_AUDIT_SSE_RAW_BYTES)
      ? this.config.MAX_AUDIT_SSE_RAW_BYTES
      : null;
    const sseRawBytesTotal = computeSseRawBytesTotal(interaction.stepsMeta);
    const sseRawTruncatedAny = interaction.stepsMeta.some((s) => s.sseRawTruncatedByLimit === true);
    const totals =
      interaction.interactionType !== 'client-preflight' ? computeTokenTotals(interaction.stepsMeta) : null;
    const lostPendings =
      interaction.pendingAgentToolUses.length > 0 ? interaction.pendingAgentToolUses : undefined;
    const lostPendingsWebSearch =
      interaction.pendingWebSearchToolUses.length > 0 ? interaction.pendingWebSearchToolUses : undefined;

    this.sessionStore.closeInteraction(interaction.interactionDir);

    await this.auditWriter.writeInteractionMeta(interaction.interactionDir, {
      interactionType: interaction.interactionType,
      ...(interaction.modelId ? { modelId: interaction.modelId } : {}),
      outcome: 'orphaned',
      stepCount: interaction.stepsMeta.length,
      startedAt: new Date(interaction.startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      durationMs: endedAt - interaction.startedAt,
      statusCode: null,
      sse: interaction.stepsMeta.some((s) => s.sse),
      steps: interaction.stepsMeta,
      totals,
      sseResponseBodyAttempted: false,
      sseResponseBodyWritten: false,
      sseResponseBodyError: null,
      sseResponseBodySource: null,
      errorMessage: null,
      errorCode: null,
      ...(interaction.parentContext ? { parentContext: interaction.parentContext } : {}),
      ...(lostPendings ? { lostPendingAgents: lostPendings } : {}),
      ...(lostPendingsWebSearch ? { lostPendingWebSearch: lostPendingsWebSearch } : {}),
      truncation: {
        requestBodyOmitted: interaction.requestBodyOmitted,
        responseBodyBytesTotal: null,
        responseBodyBytesAudited: null,
        responseTruncatedByProxyBuffer: false,
        responseTruncatedByAuditLimit: false,
        sseRawBytesAudited: sseRawBytesTotal || null,
        sseRawBytesLimit,
        sseRawTruncatedByLimit: sseRawTruncatedAny,
        sseRawWriteError: false,
      },
    });

    if (interaction.interactionType !== 'client-preflight' && interaction.modelId && totals) {
      const sessionDir = path.join(this.sessionStore.getBaseDir(), interaction.sessionId);
      await this.sessionStore.withSessionLock(interaction.sessionId, async () => {
        await this.auditWriter
          .updateSessionMetrics(sessionDir, interaction.modelId!, totals, interaction.stepsMeta.length)
          .catch(() => { /* error no crítico */ });
      });
    }

    await this.auditWriter.removeInteractionState(interaction.interactionDir);
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
