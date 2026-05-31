import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { STRIP_AUDIT_SESSION_HEADER } from '../1-domain/constants/session-headers.js';
import { SessionResolverService } from '../1-domain/services/session-resolver.service.js';
import { resolveAgentContext } from '../1-domain/services/resolve-agent-context.service.js';
import type { IWorkflowRepository } from '../1-domain/repositories/IWorkflowRepository.js';
import type { IEventBus } from '../1-domain/repositories/IEventBus.js';
import type { IWorkflow } from '../1-domain/interfaces/gateway/IWorkflow.js';
import type { IStep } from '../1-domain/interfaces/gateway/IStep.js';
import type { IToolUse } from '../1-domain/interfaces/gateway/IToolUse.js';
import {
  classifyRequestBody,
  extractModelFromRequestBody,
  isWebFetchImplementationRequestBody,
} from '../1-domain/services/request-classifier.service.js';
import {
  AgentContext,
  CorrelationMethod,
  InteractionType,
  ParentContext,
  RequestClassification,
} from '../1-domain/types/audit.types.js';
import { joinToolUseToSubagent } from '../1-domain/services/join-tool-use-to-subagent.service.js';
import type { JsonValue } from '../1-domain/types/json.types.js';
import type { AnthropicRequest } from '../1-domain/types/anthropic.types.js';
import { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';
import type { Logger } from '../1-domain/types/logger.types.js';
import { PAD_STEP } from '../1-domain/constants/audit-paths.js';

export interface AuditInteractionResult {
  /** Ruta absoluta al directorio base del workflow (`sessions/<id>/workflows/NN`). */
  auditInteractionDir: string;
  workflowId: string;
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
 * Clasifica el request, abre workflows en el correlador y emite eventos al bus.
 */
export class AuditInteractionHandler {
  /** Umbral de antigüedad (ms) para considerar un workflow awaiting como orphan. */
  static readonly ORPHAN_MAX_AGE_MS = 60_000;

  constructor(
    private sessionResolver: SessionResolverService,
    private auditBaseDir: string,
    private workflowRepo: IWorkflowRepository,
    private eventBus: IEventBus,
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

    if (auditSessionId === '_unknown') {
      return null;
    }

    const headersForAudit = { ...params.headers };

    if (STRIP_AUDIT_SESSION_HEADER && auditSession.stripHeaderName) {
      this.sessionResolver.stripAuditHeaderInPlace(params.headers, auditSession.stripHeaderName);
    }

    const classification = classifyRequestBody(params.rawBody);

    if (isWebFetchImplementationRequestBody(params.rawBody)) {
      const webFetchPending = this.findPendingWebFetch(auditSessionId);
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
      }
    }

    if (classification.type === 'side-request') {
      return this.handleSideRequest(params, headersForAudit, auditSessionId, classification);
    }

    if (classification.type === 'fresh') {
      await this.closeOrphanInteractions(auditSessionId);

      const webSearchPending = this.findPendingWebSearch(auditSessionId);
      if (webSearchPending) {
        return this.handleWebSearchStep(
          params,
          headersForAudit,
          auditSessionId,
          classification,
          webSearchPending,
        );
      }

      const webFetchPending = this.findPendingWebFetch(auditSessionId);
      if (webFetchPending) {
        return this.handleWebFetchStep(
          params,
          headersForAudit,
          auditSessionId,
          classification,
          webFetchPending,
        );
      }

      const pendingMatch = this.findPendingAgents(auditSessionId);
      if (pendingMatch) {
        const agentCtx = resolveAgentContext(headersForAudit);
        return this.handleSubagent(
          params,
          headersForAudit,
          auditSessionId,
          classification,
          pendingMatch,
          agentCtx,
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

    return this.handleFresh(params, headersForAudit, auditSessionId, { type: 'fresh' });
  }

  private workflowDirAbs(sessionId: string, layoutIndex: number): string {
    const nn = String(layoutIndex + 1).padStart(2, '0');
    return path.join(this.auditBaseDir, sessionId, 'workflows', nn);
  }

  private parseRequestPayload(rawBody: Buffer): { parsed: JsonValue | null; omitted: boolean } {
    if (rawBody.length > this.config.MAX_AUDIT_BYTES) {
      return { parsed: null, omitted: true };
    }
    try {
      return {
        parsed: rawBody.length ? (JSON.parse(rawBody.toString('utf8')) as JsonValue) : null,
        omitted: false,
      };
    } catch {
      return { parsed: null, omitted: false };
    }
  }

  private buildInferenceRequest(rawBody: Buffer): AnthropicRequest {
    const model = extractModelFromRequestBody(rawBody) ?? 'unknown';
    return {
      model,
      messages: [],
      max_tokens: 8192,
    };
  }

  private registerWireStepRequest(
    workflow: IWorkflow,
    stepIndex: number,
    headersForAudit: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
    _interactionType: InteractionType,
  ): { step: IStep; omitted: boolean } {
    const { parsed, omitted } = this.parseRequestPayload(rawBody);
    const step: IStep = {
      id: randomUUID(),
      workflowId: workflow.id,
      index: workflow.steps.length,
      inferenceRequest: this.buildInferenceRequest(rawBody),
      assistantMessage: { role: 'assistant', content: [] },
      toolUses: [],
      startedAt: new Date(),
    };
    this.workflowRepo.registerStep(workflow.id, step);
    this.eventBus.publish({
      type: 'step_request',
      sessionId: workflow.sessionId,
      workflowId: workflow.id,
      timestamp: new Date().toISOString(),
      payload: {
        workflowId: workflow.id,
        stepIndex: workflow.steps.length,
        step,
        request: parsed ?? undefined,
        headers: headersForAudit,
      },
    });
    return { step, omitted };
  }

  private async openWireWorkflow(
    auditSessionId: string,
    interactionType: InteractionType,
    rawBody: Buffer,
    headersForAudit: Record<string, string | string[] | undefined>,
    options: {
      skipWorkflowRequest?: boolean;
      sideRequestKind?: 'session-naming' | 'generic';
    } = {},
  ): Promise<{ workflow: IWorkflow; layoutIndex: number; seq: number; omitted: boolean }> {
    const seq = await this.workflowRepo.nextSequence(auditSessionId);
    const layoutIndex = await this.workflowRepo.allocLayoutIndex(auditSessionId);
    const { parsed, omitted } = this.parseRequestPayload(rawBody);
    const agentCtx: AgentContext = { agentId: undefined, isSubagentRequest: false };

    const workflow = this.workflowRepo.openWorkflow(auditSessionId, agentCtx, {
      forceNew: true,
      layoutIndex,
      interactionType,
      request: options.skipWorkflowRequest ? undefined : (parsed ?? undefined),
      skipWorkflowRequest: options.skipWorkflowRequest,
      ...(options.sideRequestKind ? { sideRequestKind: options.sideRequestKind } : {}),
    });

    this.workflowRepo.patchWireMeta(workflow.id, {
      layoutIndex,
      requestSequence: seq,
      requestBodyOmitted: omitted,
      requestBodyBytes: rawBody.length,
      interactionType,
      modelId: extractModelFromRequestBody(rawBody) ?? undefined,
      ...(options.sideRequestKind ? { sideRequestKind: options.sideRequestKind } : {}),
    });

    const stepResult = this.registerWireStepRequest(
      workflow,
      1,
      headersForAudit,
      rawBody,
      interactionType,
    );

    return {
      workflow,
      layoutIndex,
      seq,
      omitted: stepResult.omitted || omitted,
    };
  }

  private resultFromWorkflow(
    workflow: IWorkflow,
    layoutIndex: number,
    seq: number,
    omitted: boolean,
    classification: RequestClassification,
    interactionType: InteractionType,
    assignedStepIndex: number,
    extras: Partial<AuditInteractionResult> = {},
  ): AuditInteractionResult {
    return {
      auditInteractionDir: this.workflowDirAbs(workflow.sessionId, layoutIndex),
      workflowId: workflow.id,
      requestBodyOmitted: omitted,
      requestSequence: seq,
      auditSessionId: workflow.sessionId,
      interactionType,
      requestClassification: classification,
      assignedStepIndex,
      ...extras,
    };
  }

  private async handleFresh(
    params: { rawBody: Buffer; requestId: string },
    headersForAudit: Record<string, string | string[] | undefined>,
    auditSessionId: string,
    classification: RequestClassification,
  ): Promise<AuditInteractionResult> {
    const { workflow, layoutIndex, seq, omitted } = await this.openWireWorkflow(
      auditSessionId,
      'agentic',
      params.rawBody,
      headersForAudit,
    );
    return this.resultFromWorkflow(
      workflow,
      layoutIndex,
      seq,
      omitted,
      classification,
      'agentic',
      1,
    );
  }

  private extractSubagentPrompt(rawBody: Buffer): string | null {
    try {
      const body = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
      if (!Array.isArray(body.messages)) return null;

      for (let i = body.messages.length - 1; i >= 0; i--) {
        const msg = body.messages[i] as Record<string, unknown>;
        if (msg.role === 'user' && Array.isArray(msg.content)) {
          for (let j = msg.content.length - 1; j >= 0; j--) {
            const block = msg.content[j] as Record<string, unknown>;
            if (block.type === 'text' && typeof block.text === 'string') {
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

  private findPendingAgents(sessionId: string) {
    return this.workflowRepo.findWorkflowWithPendingTools(
      sessionId,
      (t) => t.name === 'Agent' || t.name.toLowerCase() === 'agent',
      { excludeSubagents: true },
    );
  }

  private findPendingWebSearch(sessionId: string) {
    return this.workflowRepo.findWorkflowWithPendingTools(sessionId, (t) => {
      const n = t.name.toLowerCase().replace(/_/g, '');
      return n === 'websearch';
    });
  }

  private findPendingWebFetch(sessionId: string) {
    return this.workflowRepo.findWorkflowWithPendingTools(sessionId, (t) => {
      const n = t.name.toLowerCase().replace(/_/g, '');
      return n === 'webfetch';
    });
  }

  private async handleSubagent(
    params: { rawBody: Buffer; requestId: string },
    headersForAudit: Record<string, string | string[] | undefined>,
    auditSessionId: string,
    classification: RequestClassification,
    match: { workflow: IWorkflow; pendings: IToolUse[] },
    agentCtx?: AgentContext,
  ): Promise<AuditInteractionResult> {
    return this.workflowRepo.withSessionLock(auditSessionId, async () => {
      const parentWorkflow = match.workflow;
      const parentMeta = this.workflowRepo.getWireMeta(parentWorkflow.id);
      const parentLayoutIndex = parentMeta?.layoutIndex ?? 0;
      const parentInteractionDir = this.workflowDirAbs(auditSessionId, parentLayoutIndex);

      const parentStepIndex = match.pendings.reduce(
        (min, p) => Math.min(min, this.stepIndexForToolUse(parentWorkflow, p)),
        this.stepIndexForToolUse(parentWorkflow, match.pendings[0]),
      );

      let wireAgentId: string | undefined;
      let wireParentAgentId: string | undefined;

      const subagentPrompt = this.extractSubagentPrompt(params.rawBody);
      const legacyPendings = match.pendings.map((p) => ({
        stepIndex: this.stepIndexForToolUse(parentWorkflow, p),
        toolUseId: p.id,
        subagentType: this.readSubagentType(p),
      }));
      const join = joinToolUseToSubagent(legacyPendings, agentCtx, subagentPrompt);

      if (agentCtx?.isSubagentRequest) {
        this.workflowRepo.openSubagentFromWire(auditSessionId, agentCtx);
        wireAgentId = agentCtx.agentId;
        wireParentAgentId = agentCtx.parentAgentId;
      }

      const triggeringToolUseId = join.toolUseId;
      const subagentType = join.subagentType;
      const correlationStatus = join.correlationStatus;
      const correlationMethod: CorrelationMethod = join.correlationMethod;

      if (triggeringToolUseId) {
        this.workflowRepo.consumePendingToolUse(parentWorkflow.id, triggeringToolUseId);
      }

      const subSeq = await this.workflowRepo.nextSequence(auditSessionId);
      const { parsed, omitted } = this.parseRequestPayload(params.rawBody);

      const parentContext: ParentContext = {
        parentInteractionDir,
        parentStepIndex,
        triggeringToolUseId,
        correlationStatus,
        correlationMethod,
        ...(subagentType ? { subagentType } : {}),
        ...(wireAgentId ? { wireAgentId } : {}),
        ...(wireParentAgentId ? { wireParentAgentId } : {}),
      };

      const subWorkflow = this.workflowRepo.openSubagentWorkflow(
        auditSessionId,
        {
          agentId: wireAgentId,
          parentAgentId: wireParentAgentId,
          isSubagentRequest: true,
        },
        parentWorkflow.id,
        triggeringToolUseId ?? '',
        {
          request: parsed ?? undefined,
          parentContext,
        },
      );

      const subLayoutIndex = this.workflowRepo.getWireMeta(subWorkflow.id)?.layoutIndex ?? 0;
      this.workflowRepo.patchWireMeta(subWorkflow.id, {
        layoutIndex: subLayoutIndex,
        requestSequence: subSeq,
        requestBodyOmitted: omitted,
        requestBodyBytes: params.rawBody.length,
        interactionType: 'agentic',
        parentContext,
        modelId: extractModelFromRequestBody(params.rawBody) ?? undefined,
      });

      this.registerWireStepRequest(subWorkflow, 1, headersForAudit, params.rawBody, 'agentic');

      const subDir = path.join(
        parentInteractionDir,
        'steps',
        String(parentStepIndex).padStart(PAD_STEP, '0'),
        `sub-agent-${String(subSeq).padStart(2, '0')}`,
      );

      return {
        auditInteractionDir: subDir,
        workflowId: subWorkflow.id,
        requestBodyOmitted: omitted,
        requestSequence: subSeq,
        auditSessionId,
        interactionType: 'agentic',
        requestClassification: classification,
        assignedStepIndex: 1,
      };
    });
  }

  private stepIndexForToolUse(workflow: IWorkflow, toolUse: IToolUse): number {
    const step = workflow.steps.find((s) => s.id === toolUse.stepId);
    return (step?.index ?? 0) + 1;
  }

  private readSubagentType(toolUse: IToolUse): string | undefined {
    const input = toolUse.arguments as Record<string, unknown> | undefined;
    if (input && typeof input.subagent_type === 'string') return input.subagent_type;
    return undefined;
  }

  private async handleInternalToolStep(params: {
    rawBody: Buffer;
    headersForAudit: Record<string, string | string[] | undefined>;
    auditSessionId: string;
    classification: RequestClassification;
    parentWorkflow: IWorkflow;
    consumePending: () => IToolUse | undefined;
    onConsumed?: (toolUse: IToolUse, stepIndex: number) => void;
  }): Promise<AuditInteractionResult> {
    return this.workflowRepo.withSessionLock(params.auditSessionId, async () => {
      const pending = params.consumePending();
      const parentMeta = this.workflowRepo.getWireMeta(params.parentWorkflow.id);
      const layoutIndex = parentMeta?.layoutIndex ?? 0;
      const stepIndex = params.parentWorkflow.steps.length + 1;

      this.registerWireStepRequest(
        params.parentWorkflow,
        stepIndex,
        params.headersForAudit,
        params.rawBody,
        'agentic',
      );

      if (pending && params.onConsumed) {
        params.onConsumed(pending, stepIndex);
      }

      return this.resultFromWorkflow(
        params.parentWorkflow,
        layoutIndex,
        parentMeta?.requestSequence ?? 0,
        false,
        params.classification,
        'agentic',
        stepIndex,
        { isInternalToolStep: true },
      );
    });
  }

  private async tryHandleInternalToolStep(params: {
    rawBody: Buffer;
    headersForAudit: Record<string, string | string[] | undefined>;
    auditSessionId: string;
    classification: RequestClassification;
    parentWorkflow: IWorkflow;
    consumePending: () => IToolUse | undefined;
    onConsumed?: (toolUse: IToolUse, stepIndex: number) => void;
  }): Promise<AuditInteractionResult | null> {
    return this.workflowRepo.withSessionLock(params.auditSessionId, async () => {
      const pending = params.consumePending();
      if (!pending) {
        return null;
      }
      const parentMeta = this.workflowRepo.getWireMeta(params.parentWorkflow.id);
      const layoutIndex = parentMeta?.layoutIndex ?? 0;
      const stepIndex = params.parentWorkflow.steps.length + 1;

      this.registerWireStepRequest(
        params.parentWorkflow,
        stepIndex,
        params.headersForAudit,
        params.rawBody,
        'agentic',
      );

      if (params.onConsumed) {
        params.onConsumed(pending, stepIndex);
      }

      return this.resultFromWorkflow(
        params.parentWorkflow,
        layoutIndex,
        parentMeta?.requestSequence ?? 0,
        false,
        params.classification,
        'agentic',
        stepIndex,
        { isInternalToolStep: true },
      );
    });
  }

  private async handleWebSearchStep(
    params: { rawBody: Buffer; requestId: string },
    headersForAudit: Record<string, string | string[] | undefined>,
    auditSessionId: string,
    classification: RequestClassification,
    match: { workflow: IWorkflow; pendings: IToolUse[] },
  ): Promise<AuditInteractionResult> {
    return this.handleInternalToolStep({
      rawBody: params.rawBody,
      headersForAudit,
      auditSessionId,
      classification,
      parentWorkflow: match.workflow,
      consumePending: () =>
        this.workflowRepo.consumeFirstPendingToolUseByName(match.workflow.id, 'web_search'),
    });
  }

  private async handleWebFetchStep(
    params: { rawBody: Buffer; requestId: string },
    headersForAudit: Record<string, string | string[] | undefined>,
    auditSessionId: string,
    classification: RequestClassification,
    match: { workflow: IWorkflow; pendings: IToolUse[] },
  ): Promise<AuditInteractionResult | null> {
    return this.tryHandleInternalToolStep({
      rawBody: params.rawBody,
      headersForAudit,
      auditSessionId,
      classification,
      parentWorkflow: match.workflow,
      consumePending: () =>
        this.workflowRepo.consumeFirstPendingToolUseByName(match.workflow.id, 'web_fetch'),
    });
  }

  private async handleContinuation(
    params: { rawBody: Buffer; requestId: string },
    headersForAudit: Record<string, string | string[] | undefined>,
    auditSessionId: string,
    classification: RequestClassification,
  ): Promise<AuditInteractionResult> {
    const toolUseIds = this.extractToolUseIdsFromBody(params.rawBody);
    const parentWorkflow = toolUseIds.length
      ? this.workflowRepo.findWorkflowByToolUseId(auditSessionId, toolUseIds[0])
      : undefined;

    if (!parentWorkflow) {
      this.logger?.warn(
        { toolUseIds },
        '[audit] No se encontró workflow padre para continuation — creando workflow standalone',
      );
      const { workflow, layoutIndex, seq, omitted } = await this.openWireWorkflow(
        auditSessionId,
        'agentic',
        params.rawBody,
        headersForAudit,
      );
      this.workflowRepo.forceClose(workflow.id, 'orphaned', { continuationOrphan: true });
      return this.resultFromWorkflow(
        workflow,
        layoutIndex,
        seq,
        omitted,
        classification,
        'agentic',
        1,
      );
    }

    const parentMeta = this.workflowRepo.getWireMeta(parentWorkflow.id);
    const layoutIndex = parentMeta?.layoutIndex ?? 0;

    this.workflowRepo.patchWireMeta(parentWorkflow.id, {
      awaitingContinuation: false,
      awaitingSince: undefined,
    });

    const agentContinuationTarget = this.resolveAgentContinuationTarget(parentWorkflow, toolUseIds);
    if (agentContinuationTarget) {
      const body = params.rawBody ?? Buffer.alloc(0);
      let continuationRequest: JsonValue | null;
      if (body.length > this.config.MAX_AUDIT_BYTES) {
        continuationRequest = null;
      } else {
        try {
          continuationRequest = body.length
            ? (JSON.parse(body.toString('utf8')) as JsonValue)
            : null;
        } catch {
          continuationRequest = null;
        }
      }

      this.workflowRepo.patchWireMeta(parentWorkflow.id, {
        coalescedAgentContinuation: {
          ...agentContinuationTarget,
          continuationRequest,
          continuationHeaders: headersForAudit,
        },
      });

      for (const toolUseId of toolUseIds) {
        this.workflowRepo.consumePendingToolUse(parentWorkflow.id, toolUseId);
      }

      return this.resultFromWorkflow(
        parentWorkflow,
        layoutIndex,
        parentMeta?.requestSequence ?? 0,
        parentMeta?.requestBodyOmitted ?? false,
        classification,
        parentMeta?.interactionType ?? 'agentic',
        agentContinuationTarget.targetStepIndex,
        { coalescedAgentContinuation: agentContinuationTarget },
      );
    }

    const stepIndex = parentWorkflow.steps.length + 1;
    this.registerWireStepRequest(
      parentWorkflow,
      stepIndex,
      headersForAudit,
      params.rawBody,
      parentMeta?.interactionType ?? 'agentic',
    );

    for (const toolUseId of toolUseIds) {
      this.workflowRepo.consumePendingToolUse(parentWorkflow.id, toolUseId);
    }

    return this.resultFromWorkflow(
      parentWorkflow,
      layoutIndex,
      parentMeta?.requestSequence ?? 0,
      parentMeta?.requestBodyOmitted ?? false,
      classification,
      parentMeta?.interactionType ?? 'agentic',
      stepIndex,
    );
  }

  private resolveAgentContinuationTarget(
    parentWorkflow: IWorkflow,
    toolUseIds: string[],
  ): { targetStepIndex: number; toolUseIds: string[] } | null {
    if (toolUseIds.length === 0) return null;

    const pendings = this.workflowRepo.findWorkflowWithPendingTools(
      parentWorkflow.sessionId,
      (t) => toolUseIds.includes(t.id),
    );
    if (!pendings || pendings.workflow.id !== parentWorkflow.id) return null;

    const matching = pendings.pendings;
    if (matching.length === 0) return null;

    const targetStepIndex = matching.reduce(
      (min, pending) => Math.min(min, this.stepIndexForToolUse(parentWorkflow, pending)),
      this.stepIndexForToolUse(parentWorkflow, matching[0]),
    );

    return {
      targetStepIndex,
      toolUseIds: matching.map((p) => p.id),
    };
  }

  private async handlePreflightQuota(
    params: { rawBody: Buffer; requestId: string },
    headersForAudit: Record<string, string | string[] | undefined>,
    auditSessionId: string,
    classification: RequestClassification,
  ): Promise<AuditInteractionResult> {
    const { workflow, layoutIndex, seq, omitted } = await this.openWireWorkflow(
      auditSessionId,
      'client-preflight',
      params.rawBody,
      headersForAudit,
      { skipWorkflowRequest: true },
    );
    return this.resultFromWorkflow(
      workflow,
      layoutIndex,
      seq,
      omitted,
      classification,
      'client-preflight',
      1,
    );
  }

  private async handleSideRequest(
    params: { rawBody: Buffer; requestId: string },
    headersForAudit: Record<string, string | string[] | undefined>,
    auditSessionId: string,
    classification: RequestClassification,
  ): Promise<AuditInteractionResult> {
    const isSessionNaming = await this.detectSessionNamingSideRequest(auditSessionId, params.rawBody);
    const { workflow, layoutIndex, seq, omitted } = await this.openWireWorkflow(
      auditSessionId,
      'side-request',
      params.rawBody,
      headersForAudit,
      { sideRequestKind: isSessionNaming ? 'session-naming' : 'generic' },
    );
    return this.resultFromWorkflow(
      workflow,
      layoutIndex,
      seq,
      omitted,
      classification,
      'side-request',
      1,
    );
  }

  private async detectSessionNamingSideRequest(
    _auditSessionId: string,
    rawBody: Buffer,
  ): Promise<boolean> {
    try {
      const body = JSON.parse(rawBody.toString('utf8'));
      if (
        body.output_config?.format?.type === 'json_schema' &&
        body.output_config.format.schema?.properties?.title
      ) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private async handlePreflightWarmup(
    params: { rawBody: Buffer; requestId: string },
    headersForAudit: Record<string, string | string[] | undefined>,
    auditSessionId: string,
    classification: RequestClassification,
  ): Promise<AuditInteractionResult> {
    const { workflow, layoutIndex, seq, omitted } = await this.openWireWorkflow(
      auditSessionId,
      'client-preflight',
      params.rawBody,
      headersForAudit,
      { skipWorkflowRequest: true },
    );
    return this.resultFromWorkflow(
      workflow,
      layoutIndex,
      seq,
      omitted,
      classification,
      'client-preflight',
      1,
    );
  }

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

  private async closeOrphanInteractions(sessionId: string): Promise<void> {
    const stale = this.workflowRepo.findStaleWorkflowsAwaitingContinuation(
      sessionId,
      AuditInteractionHandler.ORPHAN_MAX_AGE_MS,
    );
    for (const workflow of stale) {
      await this.closeOrphanInteraction(workflow);
    }
  }

  /**
   * Cierra un workflow orphan: emite `workflow_complete` con outcome `orphaned`
   * para que SessionPersistence actualice meta.json.
   */
  /** Workflows en ejecución para cierre en graceful shutdown. */
  public getOpenWorkflowsForShutdown(): IWorkflow[] {
    return this.workflowRepo.getAllRunningWorkflows();
  }

  public async closeOrphanInteraction(workflow: IWorkflow): Promise<void> {
    const meta = this.workflowRepo.getWireMeta(workflow.id);
    const lostPendings = this.collectLostAgentPendings(workflow.id);
    const lostWebSearch = this.collectLostPendingsByName(workflow.id, 'web_search');
    const lostWebFetch = this.collectLostPendingsByName(workflow.id, 'web_fetch');

    this.workflowRepo.forceClose(workflow.id, 'orphaned', {
      lostPendingAgents: lostPendings.length > 0 ? lostPendings : undefined,
      lostPendingWebSearch: lostWebSearch.length > 0 ? lostWebSearch : undefined,
      lostPendingWebFetch: lostWebFetch.length > 0 ? lostWebFetch : undefined,
      stepCount: workflow.steps.length,
      ...(meta?.modelId ? { modelId: meta.modelId } : {}),
    });
  }

  private collectLostAgentPendings(workflowId: string): Array<{ stepIndex: number; toolUseId: string }> {
    const wf = this.workflowRepo.getWorkflow(workflowId);
    if (!wf) return [];
    const match = this.workflowRepo.findWorkflowWithPendingTools(
      wf.sessionId,
      (t) => t.name === 'Agent' || t.name.toLowerCase() === 'agent',
    );
    if (!match || match.workflow.id !== workflowId) return [];
    return match.pendings.map((p) => ({
      stepIndex: this.stepIndexForToolUse(match.workflow, p),
      toolUseId: p.id,
    }));
  }

  private collectLostPendingsByName(
    workflowId: string,
    toolName: string,
  ): Array<{ stepIndex: number; toolUseId: string }> {
    const wf = this.workflowRepo.getWorkflow(workflowId);
    if (!wf) return [];
    const match = this.workflowRepo.findWorkflowWithPendingTools(wf.sessionId, (t) => {
      const n = t.name.toLowerCase().replace(/_/g, '');
      const target = toolName.toLowerCase().replace(/_/g, '');
      return n === target;
    });
    if (!match || match.workflow.id !== workflowId) return [];
    return match.pendings.map((p) => ({
      stepIndex: this.stepIndexForToolUse(wf, p),
      toolUseId: p.id,
    }));
  }
}
