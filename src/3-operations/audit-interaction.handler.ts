import * as path from 'node:path';
import { STRIP_AUDIT_SESSION_HEADER } from '../1-domain/constants/session-headers.js';
import { SessionResolverService } from '../1-domain/services/session-resolver.service.js';
import type { ISessionStore } from '../2-services/ports/session-store.port.js';
import type { IAuditWriter } from '../2-services/ports/audit-writer.port.js';
import {
  classifyRequestBody,
  extractModelFromRequestBody,
  isWebFetchImplementationRequestBody,
} from '../1-domain/services/request-classifier.service.js';
import {
  ActiveInteraction,
  InteractionType,
  MarkdownRenderContext,
  ParentContext,
  PendingAgentToolUse,
  PendingWebFetchToolUse,
  PendingWebSearchToolUse,
  RequestClassification,
  computeTokenTotals,
  computeSseRawBytesTotal,
} from '../1-domain/types/audit.types.js';
import type { JsonValue } from '../1-domain/types/json.types.js';
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
  /** Índice del step asignado durante request audit, inmutable hasta response audit. */
  assignedStepIndex: number;
  isInternalToolStep?: boolean;
  coalescedAgentContinuation?: {
    targetStepIndex: number;
    toolUseIds: string[];
  };
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

    // Requests sin sesión identificada están fuera del diseño de observabilidad.
    // Claude Code envía requests pre-sesión (HEAD /, GET /v1/models) que resuelven
    // a '_unknown' y no deben crear directorios ni side-interactions.
    if (auditSessionId === '_unknown') {
      return null;
    }

    // Capturar headers ANTES del strip para preservar cabeceras de sesión en auditoría
    const headersForAudit = { ...params.headers };

    if (STRIP_AUDIT_SESSION_HEADER && auditSession.stripHeaderName) {
      this.sessionResolver.stripAuditHeaderInPlace(params.headers, auditSession.stripHeaderName);
    }

    const classification = classifyRequestBody(params.rawBody);

    // Verificar si es una llamada de implementación WebFetch interna antes de side-request.
    // Las implementaciones WebFetch reales llegan como tools: [] con contenido de página.
    // Si hay un pending WebFetch, correlacionar como step interno del padre.
    if (isWebFetchImplementationRequestBody(params.rawBody)) {
      const webFetchPending = this.sessionStore.findInteractionWithPendingWebFetch(auditSessionId);
      if (webFetchPending) {
        const result = await this.handleWebFetchStep(
          params,
          headersForAudit,
          auditSessionId,
          classification,
          webFetchPending,
        );
        if (result) {
          return result;
        }
        // Si handleWebFetchStep retorna null, el pending se consumió por otro thread; continuar flujo normal
      }
      // Si no hay pending o fue consumido, continuar al flujo normal side-request
    }

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
      const webSearchPending =
        this.sessionStore.findInteractionWithPendingWebSearch(auditSessionId);
      if (webSearchPending) {
        return this.handleWebSearchStep(
          params,
          headersForAudit,
          auditSessionId,
          classification,
          webSearchPending,
        );
      }

      // Verificar si es una llamada de implementación de web_fetch: el harness
      // ejecuta WebFetch haciendo una llamada interna a la API que el proxy
      // captura como fresh. Si hay un pending web_fetch, redirigir como step
      // adicional del padre en lugar de crear un sub-agente.
      const webFetchPending = this.sessionStore.findInteractionWithPendingWebFetch(auditSessionId);
      if (webFetchPending) {
        return this.handleWebFetchStep(
          params,
          headersForAudit,
          auditSessionId,
          classification,
          webFetchPending,
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
      maxAuditRequestBytes: this.config.MAX_AUDIT_BYTES,
      context: { interactionType: 'agentic', stepIndex: 1 },
    });

    // Escribir steps/01/request para simetría estructural (todos los steps tienen request/)
    const stepDir = path.join(interactionDir, DIR_STEPS, String(1).padStart(PAD_STEP, '0'));
    await this.auditWriter.writeStepRequest({
      stepDir,
      headers: headersForAudit,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_BYTES,
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
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
      modelId: extractModelFromRequestBody(params.rawBody) ?? undefined,
    });

    return {
      auditInteractionDir: interactionDir,
      requestBodyOmitted: wr.requestBodyOmitted,
      requestSequence: seq,
      auditSessionId,
      interactionType: 'agentic',
      requestClassification: classification,
      assignedStepIndex: 1,
    };
  }

  /**
   * Extrae el prompt principal del request de un subagente desde el rawBody.
   * Parsea el request JSON y busca el último bloque `text` de usuario que
   * corresponde al prompt del agente. Normaliza espacios/saltos de línea
   * de forma determinista para matching exacto.
   */
  private extractSubagentPrompt(rawBody: Buffer): string | null {
    try {
      const body = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
      if (!Array.isArray(body.messages)) return null;

      // Buscar el último mensaje de tipo 'user'
      for (let i = body.messages.length - 1; i >= 0; i--) {
        const msg = body.messages[i] as Record<string, unknown>;
        if (msg.role === 'user' && Array.isArray(msg.content)) {
          // Buscar el último bloque de texto en el contenido
          for (let j = msg.content.length - 1; j >= 0; j--) {
            const block = msg.content[j] as Record<string, unknown>;
            if (block.type === 'text' && typeof block.text === 'string') {
              // Normalizar: trim y normalizar espacios múltiples
              return block.text.trim().replace(/\s+/g, ' ');
            }
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Resuelve el pending Agent correspondiente al request del subagente
   * comparando el prompt del request con los prompts de los pendings.
   * Devuelve el pending resuelto o null si no hay match determinístico.
   */
  private resolvePendingByPrompt(
    pendings: PendingAgentToolUse[],
    subagentPrompt: string | null,
  ): { pending: PendingAgentToolUse; method: 'prompt' | 'unique-pending' } | null {
    if (pendings.length === 0) return null;

    // Si hay un solo pending y el subagente no tiene prompt, usar pending único
    if (pendings.length === 1 && !subagentPrompt) {
      return { pending: pendings[0], method: 'unique-pending' };
    }

    // Si el subagente tiene prompt, buscar match exacto en pendings
    if (subagentPrompt) {
      const matches = pendings.filter((p) => p.prompt === subagentPrompt);
      if (matches.length === 1) {
        return { pending: matches[0], method: 'prompt' };
      }
    }

    // Si hay un solo pending, usarlo como fallback
    if (pendings.length === 1) {
      return { pending: pendings[0], method: 'unique-pending' };
    }

    return null;
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

      // Correlación tool_use ↔ subagente por contenido determinístico.
      // Extraer el prompt del request del subagente y buscar match en pendings.
      const subagentPrompt = this.extractSubagentPrompt(params.rawBody);
      const resolution = this.resolvePendingByPrompt(match.pendings, subagentPrompt);

      let triggeringToolUseId: string | null;
      let subagentType: string | undefined;
      let correlationStatus: 'resolved' | 'unresolved';
      let correlationMethod: 'prompt' | 'unique-pending' | 'none' | undefined;

      if (resolution) {
        triggeringToolUseId = resolution.pending.toolUseId;
        subagentType = resolution.pending.subagentType;
        correlationStatus = 'resolved';
        correlationMethod = resolution.method;
      } else {
        triggeringToolUseId = null;
        subagentType = undefined;
        correlationStatus = 'unresolved';
        correlationMethod = 'none';
      }

      const subSeq = await this.auditWriter.nextSubInteractionSequence(
        parentInteractionDir,
        parentStepIndex,
      );
      const folderName = `${PREFIX_SUB_AGENT}-${String(subSeq).padStart(PAD_SUB_AGENT, '0')}`;

      const subagentContext: MarkdownRenderContext = {
        interactionType: 'agentic',
        subagentType,
        stepIndex: 1,
      };

      const wr = await this.auditWriter.writeSubInteractionRequest({
        parentInteractionDir,
        parentStepIndex,
        folderName,
        headers: headersForAudit,
        bodyBuffer: params.rawBody,
        maxAuditRequestBytes: this.config.MAX_AUDIT_BYTES,
        context: subagentContext,
      });

      // Escribir steps/01/request del subagente para mantener simetría estructural.
      const stepDir = path.join(wr.dir, DIR_STEPS, String(1).padStart(PAD_STEP, '0'));
      await this.auditWriter.writeStepRequest({
        stepDir,
        headers: headersForAudit,
        bodyBuffer: params.rawBody,
        maxAuditRequestBytes: this.config.MAX_AUDIT_BYTES,
        context: subagentContext,
      });

      const startedAt = Date.now();
      const parentContext: ParentContext = {
        parentInteractionDir,
        parentStepIndex,
        triggeringToolUseId,
        correlationStatus,
        correlationMethod,
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
        pendingWebFetchToolUses: [],
        resolvedInternalTools: [],
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
        assignedStepIndex: 1,
      };
    });
  }

  /**
   * Helper común para registrar llamadas de implementación de tools internos
   * (WebSearch/WebFetch) como steps adicionales del padre. Ejecuta la sección
   * crítica (consumir pending, incrementar stepCount, escribir request) dentro
   * de withSessionLock para evitar colisiones en concurrencia.
   */
  private async handleInternalToolStep(params: {
    rawBody: Buffer;
    headersForAudit: Record<string, string | string[] | undefined>;
    auditSessionId: string;
    classification: RequestClassification;
    parentInteractionDir: string;
    consumePending: (interactionDir: string) => unknown;
    registerResolution?: (parentInteractionDir: string, stepCount: number) => void;
  }): Promise<AuditInteractionResult> {
    return this.sessionStore.withSessionLock(params.auditSessionId, async () => {
      const pending = params.consumePending(params.parentInteractionDir);

      const stepCount = this.sessionStore.incrementStepCountByDir(params.parentInteractionDir);
      const stepDir = path.join(
        params.parentInteractionDir,
        DIR_STEPS,
        String(stepCount).padStart(PAD_STEP, '0'),
      );

      await this.auditWriter.writeStepRequest({
        stepDir,
        headers: params.headersForAudit,
        bodyBuffer: params.rawBody,
        maxAuditRequestBytes: this.config.MAX_AUDIT_BYTES,
        context: {
          interactionType: 'agentic',
          stepIndex: stepCount,
        },
      });

      // Registrar la resolución si se proporcionó un callback
      if (params.registerResolution && pending) {
        params.registerResolution(params.parentInteractionDir, stepCount);
      }

      return {
        auditInteractionDir: params.parentInteractionDir,
        requestBodyOmitted: false,
        requestSequence: 0,
        auditSessionId: params.auditSessionId,
        interactionType: 'agentic',
        requestClassification: params.classification,
        assignedStepIndex: stepCount,
        isInternalToolStep: true,
      };
    });
  }

  /**
   * Helper seguro para intentar registrar llamadas de implementación de tools internos.
   * A diferencia de handleInternalToolStep, este verifica si consumePending devuelve null
   * dentro del lock (indicando que ya no hay pending disponible al entrar a la sección crítica).
   * Si no hay pending, retorna null para que el caller pueda continuar con el flujo normal.
   */
  private async tryHandleInternalToolStep(params: {
    rawBody: Buffer;
    headersForAudit: Record<string, string | string[] | undefined>;
    auditSessionId: string;
    classification: RequestClassification;
    parentInteractionDir: string;
    consumePending: (interactionDir: string) => unknown;
    registerResolution?: (parentInteractionDir: string, stepCount: number) => void;
  }): Promise<AuditInteractionResult | null> {
    return this.sessionStore.withSessionLock(params.auditSessionId, async () => {
      const pending = params.consumePending(params.parentInteractionDir);
      if (pending === null || pending === undefined) {
        // No hay pending disponible al entrar al lock; retornar null para continuar flujo normal
        return null;
      }

      const stepCount = this.sessionStore.incrementStepCountByDir(params.parentInteractionDir);
      const stepDir = path.join(
        params.parentInteractionDir,
        DIR_STEPS,
        String(stepCount).padStart(PAD_STEP, '0'),
      );

      await this.auditWriter.writeStepRequest({
        stepDir,
        headers: params.headersForAudit,
        bodyBuffer: params.rawBody,
        maxAuditRequestBytes: this.config.MAX_AUDIT_BYTES,
        context: {
          interactionType: 'agentic',
          stepIndex: stepCount,
        },
      });

      // Registrar la resolución si se proporcionó un callback
      if (params.registerResolution) {
        params.registerResolution(params.parentInteractionDir, stepCount);
      }

      return {
        auditInteractionDir: params.parentInteractionDir,
        requestBodyOmitted: false,
        requestSequence: 0,
        auditSessionId: params.auditSessionId,
        interactionType: 'agentic',
        requestClassification: params.classification,
        assignedStepIndex: stepCount,
        isInternalToolStep: true,
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
    return this.handleInternalToolStep({
      rawBody: params.rawBody,
      headersForAudit,
      auditSessionId,
      classification,
      parentInteractionDir,
      consumePending: (dir: string) => this.sessionStore.consumeWebSearchPending(dir),
      registerResolution: (dir: string, _stepCount: number) => {
        const pending = match.pendings[0]; // FIFO
        if (pending) {
          this.sessionStore.registerResolvedInternalTool(dir, {
            toolUseId: pending.toolUseId,
            toolName: 'WebSearch',
            originalStepIndex: pending.stepIndex,
            resolutionMode: 'internal_request',
          });
        }
      },
    });
  }

  /**
   * Registra la llamada de implementación de WebFetch como un step adicional
   * dentro de la interacción padre que emitió el tool_use `web_fetch`. No crea
   * una interacción independiente — el request/response del harness se escriben
   * en `steps/NN/` del padre, igual que cualquier otro step de ejecución de tool.
   */
  private async handleWebFetchStep(
    params: { rawBody: Buffer; requestId: string },
    headersForAudit: Record<string, string | string[] | undefined>,
    auditSessionId: string,
    classification: RequestClassification,
    match: {
      interaction: { interactionDir: string; pendingWebFetchToolUses: PendingWebFetchToolUse[] };
      pendings: PendingWebFetchToolUse[];
    },
  ): Promise<AuditInteractionResult | null> {
    const parentInteractionDir = match.interaction.interactionDir;
    const result = await this.tryHandleInternalToolStep({
      rawBody: params.rawBody,
      headersForAudit,
      auditSessionId,
      classification,
      parentInteractionDir,
      consumePending: (dir: string) => this.sessionStore.consumeWebFetchPending(dir),
      registerResolution: (dir: string, _stepCount: number) => {
        const pending = match.pendings[0]; // FIFO
        if (pending) {
          this.sessionStore.registerResolvedInternalTool(dir, {
            toolUseId: pending.toolUseId,
            toolName: 'WebFetch',
            originalStepIndex: pending.stepIndex,
            resolutionMode: 'internal_request',
          });
        }
      },
    });
    return result;
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

    const agentContinuationTarget = this.resolveAgentContinuationTarget(
      parentInteraction,
      toolUseIds,
    );
    if (agentContinuationTarget) {
      // Parsear la request de continuation en memoria para evitar crear archivos temporales
      const continuationHeaders = headersForAudit;
      const body = params.rawBody ?? Buffer.alloc(0);
      let continuationRequest: JsonValue | null;

      if (body.length > this.config.MAX_AUDIT_BYTES) {
        continuationRequest = null; // Body omitido por tamaño
      } else {
        try {
          continuationRequest = body.length
            ? (JSON.parse(body.toString('utf8')) as JsonValue)
            : null;
        } catch {
          continuationRequest = null; // Body inválido
        }
      }

      // Adjuntar la request de continuation al contexto coalesced
      parentInteraction.coalescedAgentContinuation = {
        ...agentContinuationTarget,
        continuationRequest,
        continuationHeaders,
      };

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
        assignedStepIndex: agentContinuationTarget.targetStepIndex,
        coalescedAgentContinuation: agentContinuationTarget,
      };
    }

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
      maxAuditRequestBytes: this.config.MAX_AUDIT_BYTES,
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

    // Reconciliar pendings WebSearch/WebFetch resueltos por tool_result en continuation.
    // Si un tool_result corresponde a un pending de built-in tool, consumirlo y
    // registrar la resolución como 'tool_result_in_continuation'.
    for (const toolUseId of toolUseIds) {
      const webSearchPending = this.sessionStore.consumeWebSearchPendingByToolUseId(
        parentInteraction.interactionDir,
        toolUseId,
      );
      if (webSearchPending) {
        this.sessionStore.registerResolvedInternalTool(parentInteraction.interactionDir, {
          toolUseId,
          toolName: 'WebSearch',
          originalStepIndex: webSearchPending.stepIndex,
          resolutionMode: 'tool_result_in_continuation',
          resolvedInStepIndex: stepCount,
        });
      }

      const webFetchPending = this.sessionStore.consumeWebFetchPendingByToolUseId(
        parentInteraction.interactionDir,
        toolUseId,
      );
      if (webFetchPending) {
        this.sessionStore.registerResolvedInternalTool(parentInteraction.interactionDir, {
          toolUseId,
          toolName: 'WebFetch',
          originalStepIndex: webFetchPending.stepIndex,
          resolutionMode: 'tool_result_in_continuation',
          resolvedInStepIndex: stepCount,
        });
      }
    }

    return {
      auditInteractionDir: parentInteraction.interactionDir,
      requestBodyOmitted: parentInteraction.requestBodyOmitted,
      requestSequence: parentInteraction.requestSequence,
      auditSessionId,
      interactionType: parentInteraction.interactionType,
      requestClassification: classification,
      assignedStepIndex: stepCount,
    };
  }

  private resolveAgentContinuationTarget(
    parentInteraction: ActiveInteraction,
    toolUseIds: string[],
  ): { targetStepIndex: number; toolUseIds: string[] } | null {
    if (toolUseIds.length === 0 || parentInteraction.pendingAgentToolUses.length === 0) {
      return null;
    }

    const matchingPendings = parentInteraction.pendingAgentToolUses.filter((pending) =>
      toolUseIds.includes(pending.toolUseId),
    );
    if (matchingPendings.length === 0) {
      return null;
    }

    const targetStepIndex = matchingPendings.reduce(
      (min, pending) => Math.min(min, pending.stepIndex),
      matchingPendings[0].stepIndex,
    );

    return {
      targetStepIndex,
      toolUseIds: matchingPendings.map((pending) => pending.toolUseId),
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
      maxAuditRequestBytes: this.config.MAX_AUDIT_BYTES,
      skipTopLevelRequest: true,
    });

    const stepDir = path.join(interactionDir, DIR_STEPS, String(1).padStart(PAD_STEP, '0'));
    await this.auditWriter.writeStepRequest({
      stepDir,
      headers: headersForAudit,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_BYTES,
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
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
      modelId: extractModelFromRequestBody(params.rawBody) ?? undefined,
    });

    return {
      auditInteractionDir: interactionDir,
      requestBodyOmitted: false,
      requestSequence: seq,
      auditSessionId,
      interactionType: 'client-preflight',
      requestClassification: classification,
      assignedStepIndex: 1,
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
      maxAuditRequestBytes: this.config.MAX_AUDIT_BYTES,
      context: { interactionType: 'side-request', stepIndex: 1 },
    });

    // Escribir steps/01/request para simetría estructural
    const stepDir = path.join(interactionDir, DIR_STEPS, String(1).padStart(PAD_STEP, '0'));
    await this.auditWriter.writeStepRequest({
      stepDir,
      headers: headersForAudit,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_BYTES,
      context: { interactionType: 'side-request', stepIndex: 1 },
    });

    const startedAt = Date.now();

    // Detector de side-request de naming:
    // - tools: [] (ya clasificado como side-request)
    // - No es implementación WebFetch interna (ya filtrado antes de este handler)
    // - output_config con JSON schema que requiere campo "title" (detectado por el método)
    const isSessionNaming = await this.detectSessionNamingSideRequest(
      auditSessionId,
      params.rawBody,
    );

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
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
      modelId: extractModelFromRequestBody(params.rawBody) ?? undefined,
      sideRequestKind: isSessionNaming ? 'session-naming' : 'generic',
    });

    return {
      auditInteractionDir: interactionDir,
      requestBodyOmitted: wr.requestBodyOmitted,
      requestSequence: seq,
      auditSessionId,
      interactionType: 'side-request',
      requestClassification: classification,
      assignedStepIndex: 1,
    };
  }

  /**
   * Detector de side-request de naming de sesión.
   * Un side-request se clasifica como 'session-naming' si:
   * - El output_config requiere un campo "title" mediante JSON schema (patrón 1)
   *
   * Nota: El detector no depende del orden de las interacciones (primer side-request,
   * sin turnos agentic previos) porque la side-interaction de naming puede ocurrir
   * en cualquier momento de la sesión. El patrón de output_config es suficientemente
   * distintivo para identificar side-requests de naming.
   */
  private async detectSessionNamingSideRequest(
    _auditSessionId: string,
    rawBody: Buffer,
  ): Promise<boolean> {
    try {
      // Patrón 1: Analizar output_config para detectar JSON schema con campo "title"
      const bodyText = rawBody.toString('utf8');
      const body = JSON.parse(bodyText);

      // Verificar si output_config tiene formato JSON schema con propiedad "title"
      if (
        body.output_config?.format?.type === 'json_schema' &&
        body.output_config.format.schema?.properties?.title
      ) {
        return true;
      }

      // Si no se detecta el patrón de output_config, clasificar como generic
      return false;
    } catch {
      // Si falla el parsing del body, ser conservador → clasificar como generic
      return false;
    }
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
      maxAuditRequestBytes: this.config.MAX_AUDIT_BYTES,
      skipTopLevelRequest: true,
    });

    const stepDir = path.join(interactionDir, DIR_STEPS, String(1).padStart(PAD_STEP, '0'));
    await this.auditWriter.writeStepRequest({
      stepDir,
      headers: headersForAudit,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_BYTES,
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
      pendingWebFetchToolUses: [],
      resolvedInternalTools: [],
      modelId: extractModelFromRequestBody(params.rawBody) ?? undefined,
    });

    return {
      auditInteractionDir: interactionDir,
      requestBodyOmitted: false,
      requestSequence: seq,
      auditSessionId,
      interactionType: 'client-preflight',
      requestClassification: classification,
      assignedStepIndex: 1,
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
    const sseRawBytesLimit = this.config.MAX_AUDIT_BYTES;
    const sseRawBytesTotal = computeSseRawBytesTotal(interaction.stepsMeta);
    const sseRawTruncatedAny = interaction.stepsMeta.some((s) => s.sseRawTruncatedByLimit === true);
    const totals =
      interaction.interactionType !== 'client-preflight'
        ? computeTokenTotals(interaction.stepsMeta)
        : null;
    const lostPendings =
      interaction.pendingAgentToolUses.length > 0 ? interaction.pendingAgentToolUses : undefined;
    const lostPendingsWebSearch =
      interaction.pendingWebSearchToolUses.length > 0
        ? interaction.pendingWebSearchToolUses
        : undefined;
    const lostPendingsWebFetch =
      interaction.pendingWebFetchToolUses.length > 0
        ? interaction.pendingWebFetchToolUses
        : undefined;

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
      ...(lostPendingsWebFetch ? { lostPendingWebFetch: lostPendingsWebFetch } : {}),
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
          .updateSessionMetrics(
            sessionDir,
            interaction.modelId!,
            totals,
            interaction.stepsMeta.length,
          )
          .catch(() => {
            /* error no crítico */
          });
      });
    }

    await this.auditWriter.removeInteractionState(interaction.interactionDir);
  }
}
