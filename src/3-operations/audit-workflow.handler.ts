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
  extractToolResultBlocksFromRequestBody,
  isWebFetchImplementationRequestBody,
} from '../1-domain/services/request-classifier.service.js';
import {
  AgentContext,
  CorrelationMethod,
  StepKind,
  WorkflowRequestKind,
  ParentContext,
  RequestClassification,
} from '../1-domain/types/audit.types.js';
import { joinToolUseToSubagent } from '../1-domain/services/join-tool-use-to-subagent.service.js';
import type { JsonValue } from '../1-domain/types/json.types.js';
import type { AnthropicRequest } from '../1-domain/types/anthropic.types.js';
import { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';
import type { Logger } from '../1-domain/types/logger.types.js';
export interface AuditWorkflowResult {
  /** Ruta absoluta al directorio base del workflow (`sessions/<id>/workflows/NN`). */
  auditWorkflowDir: string;
  workflowId: string;
  requestBodyOmitted: boolean;
  requestSequence: number;
  auditSessionId: string;
  workflowKind: WorkflowRequestKind;
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
export class AuditWorkflowHandler {
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
  }): Promise<AuditWorkflowResult | null> {
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

    if (classification.type === 'preflight-quota' || classification.type === 'preflight-warmup') {
      return null;
    }

    return this.workflowRepo.withSessionLock(auditSessionId, async () => {
      if (classification.type === 'side-request') {
        return this.handleSideRequest(params, headersForAudit, auditSessionId, classification);
      }

      if (classification.type === 'fresh') {
        await this.closeOrphanWorkflows(auditSessionId);

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

      return this.handleFresh(params, headersForAudit, auditSessionId, { type: 'fresh' });
    });
  }

  private workflowDirAbs(sessionId: string, layoutIndex: number): string {
    const nn = String(layoutIndex).padStart(2, '0');
    return path.join(this.auditBaseDir, sessionId, 'workflows', nn);
  }

  private nextStepIndex(workflow: IWorkflow): number {
    return workflow.steps.length + 1;
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
    headersForAudit: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
    stepKind: StepKind,
    options: { workflowRequest?: JsonValue } = {},
  ): { step: IStep; omitted: boolean; stepIndex: number } {
    const { parsed, omitted } = this.parseRequestPayload(rawBody);
    const stepIndex = this.nextStepIndex(workflow);
    const step: IStep = {
      id: randomUUID(),
      workflowId: workflow.id,
      index: stepIndex,
      stepKind,
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
        stepIndex,
        stepKind,
        step,
        request: parsed ?? undefined,
        headers: headersForAudit,
        ...(options.workflowRequest !== undefined
          ? { workflowRequest: options.workflowRequest }
          : {}),
      },
    });
    return { step, omitted, stepIndex };
  }

  private async ensureTurnWorkflow(
    auditSessionId: string,
    rawBody: Buffer,
    options: { request?: JsonValue; skipWorkflowRequest?: boolean } = {},
  ): Promise<{ workflow: IWorkflow; layoutIndex: number; isNew: boolean; omitted: boolean }> {
    const existing = this.workflowRepo.getWorkflowBySessionId(auditSessionId);
    if (existing) {
      const meta = this.workflowRepo.getWireMeta(existing.id);
      return {
        workflow: existing,
        layoutIndex: meta?.layoutIndex ?? 1,
        isNew: false,
        omitted: false,
      };
    }

    const layoutIndex = await this.workflowRepo.allocLayoutIndex(auditSessionId);
    const { parsed, omitted } = this.parseRequestPayload(rawBody);
    const agentCtx: AgentContext = { agentId: undefined, isSubagentRequest: false };

    const workflow = this.workflowRepo.openWorkflow(auditSessionId, agentCtx, {
      layoutIndex,
      workflowKind: 'agentic',
      request: options.skipWorkflowRequest ? undefined : (options.request ?? parsed ?? undefined),
      skipWorkflowRequest: options.skipWorkflowRequest,
    });

    const seq = await this.workflowRepo.nextSequence(auditSessionId);
    this.workflowRepo.patchWireMeta(workflow.id, {
      layoutIndex,
      requestSequence: seq,
      requestBodyOmitted: omitted,
      requestBodyBytes: rawBody.length,
      workflowKind: 'agentic',
      modelId: extractModelFromRequestBody(rawBody) ?? undefined,
    });

    return { workflow, layoutIndex, isNew: true, omitted };
  }

  private async openWireWorkflow(
    auditSessionId: string,
    workflowKind: WorkflowRequestKind,
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
      workflowKind,
      request: options.skipWorkflowRequest ? undefined : (parsed ?? undefined),
      skipWorkflowRequest: options.skipWorkflowRequest,
      ...(options.sideRequestKind ? { sideRequestKind: options.sideRequestKind } : {}),
    });

    this.workflowRepo.patchWireMeta(workflow.id, {
      layoutIndex,
      requestSequence: seq,
      requestBodyOmitted: omitted,
      requestBodyBytes: rawBody.length,
      workflowKind,
      modelId: extractModelFromRequestBody(rawBody) ?? undefined,
      ...(options.sideRequestKind ? { sideRequestKind: options.sideRequestKind } : {}),
    });

    const stepResult = this.registerWireStepRequest(
      workflow,
      headersForAudit,
      rawBody,
      workflowKind === 'side-request' ? 'side-request' : 'agentic',
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
    workflowKind: WorkflowRequestKind,
    assignedStepIndex: number,
    extras: Partial<AuditWorkflowResult> = {},
  ): AuditWorkflowResult {
    return {
      auditWorkflowDir: this.workflowDirAbs(workflow.sessionId, layoutIndex),
      workflowId: workflow.id,
      requestBodyOmitted: omitted,
      requestSequence: seq,
      auditSessionId: workflow.sessionId,
      workflowKind: workflowKind,
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
  ): Promise<AuditWorkflowResult> {
    const { parsed } = this.parseRequestPayload(params.rawBody);
    const {
      workflow,
      layoutIndex,
      isNew,
      omitted: wfOmitted,
    } = await this.ensureTurnWorkflow(auditSessionId, params.rawBody, {
      request: parsed ?? undefined,
    });
    const meta = this.workflowRepo.getWireMeta(workflow.id);
    const seq = meta?.requestSequence ?? (await this.workflowRepo.nextSequence(auditSessionId));
    const materializeWorkflowRequest =
      !isNew && workflow.steps.length === 0 ? (parsed ?? undefined) : undefined;
    const { stepIndex, omitted: stepOmitted } = this.registerWireStepRequest(
      workflow,
      headersForAudit,
      params.rawBody,
      'agentic',
      { workflowRequest: materializeWorkflowRequest },
    );
    return this.resultFromWorkflow(
      workflow,
      layoutIndex,
      seq,
      wfOmitted || stepOmitted,
      classification,
      'agentic',
      stepIndex,
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
  ): Promise<AuditWorkflowResult> {
    const parentWorkflow = match.workflow;
    const parentMeta = this.workflowRepo.getWireMeta(parentWorkflow.id);
    const parentLayoutIndex = parentMeta?.layoutIndex ?? 1;
    const parentWorkflowDir = this.workflowDirAbs(auditSessionId, parentLayoutIndex);

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
      parentWorkflowDir,
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

    const subLayoutIndex = this.workflowRepo.getWireMeta(subWorkflow.id)?.layoutIndex ?? 1;
    this.workflowRepo.patchWireMeta(subWorkflow.id, {
      layoutIndex: subLayoutIndex,
      requestSequence: subSeq,
      requestBodyOmitted: omitted,
      requestBodyBytes: params.rawBody.length,
      workflowKind: 'agentic',
      parentContext,
      modelId: extractModelFromRequestBody(params.rawBody) ?? undefined,
    });

    this.registerWireStepRequest(subWorkflow, headersForAudit, params.rawBody, 'agentic');

    return {
      auditWorkflowDir: this.workflowDirAbs(auditSessionId, subLayoutIndex),
      workflowId: subWorkflow.id,
      requestBodyOmitted: omitted,
      requestSequence: subSeq,
      auditSessionId,
      workflowKind: 'agentic',
      requestClassification: classification,
      assignedStepIndex: 1,
    };
  }

  private stepIndexForToolUse(workflow: IWorkflow, toolUse: IToolUse): number {
    const step = workflow.steps.find((s) => s.id === toolUse.stepId);
    return step?.index ?? 1;
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
  }): Promise<AuditWorkflowResult> {
    const pending = params.consumePending();
    const parentMeta = this.workflowRepo.getWireMeta(params.parentWorkflow.id);
    const layoutIndex = parentMeta?.layoutIndex ?? 1;

    const { stepIndex } = this.registerWireStepRequest(
      params.parentWorkflow,
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
  }

  private async tryHandleInternalToolStep(params: {
    rawBody: Buffer;
    headersForAudit: Record<string, string | string[] | undefined>;
    auditSessionId: string;
    classification: RequestClassification;
    parentWorkflow: IWorkflow;
    consumePending: () => IToolUse | undefined;
    onConsumed?: (toolUse: IToolUse, stepIndex: number) => void;
  }): Promise<AuditWorkflowResult | null> {
    const pending = params.consumePending();
    if (!pending) {
      return null;
    }
    const parentMeta = this.workflowRepo.getWireMeta(params.parentWorkflow.id);
    const layoutIndex = parentMeta?.layoutIndex ?? 1;

    const { stepIndex } = this.registerWireStepRequest(
      params.parentWorkflow,
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
  }

  private async handleWebSearchStep(
    params: { rawBody: Buffer; requestId: string },
    headersForAudit: Record<string, string | string[] | undefined>,
    auditSessionId: string,
    classification: RequestClassification,
    match: { workflow: IWorkflow; pendings: IToolUse[] },
  ): Promise<AuditWorkflowResult> {
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
  ): Promise<AuditWorkflowResult | null> {
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
  ): Promise<AuditWorkflowResult> {
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
      // I3: no cerrar prematuramente — el workflow degradado queda abierto y cierra
      // por reaper o shutdown con sus steps reales.
      this.workflowRepo.patchWireMeta(workflow.id, { continuationOrphan: true });
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
    const layoutIndex = parentMeta?.layoutIndex ?? 1;

    this.workflowRepo.patchWireMeta(parentWorkflow.id, {
      awaitingContinuation: false,
      awaitingSince: undefined,
    });

    this.completeClientToolResultsFromContinuation(auditSessionId, parentWorkflow, params.rawBody);

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
        parentMeta?.workflowKind ?? 'agentic',
        agentContinuationTarget.targetStepIndex,
        { coalescedAgentContinuation: agentContinuationTarget },
      );
    }

    const { stepIndex } = this.registerWireStepRequest(
      parentWorkflow,
      headersForAudit,
      params.rawBody,
      'agentic',
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
      parentMeta?.workflowKind ?? 'agentic',
      stepIndex,
    );
  }

  private resolveAgentContinuationTarget(
    parentWorkflow: IWorkflow,
    toolUseIds: string[],
  ): { targetStepIndex: number; toolUseIds: string[] } | null {
    if (toolUseIds.length === 0) return null;

    const pendings = this.workflowRepo.findWorkflowWithPendingTools(parentWorkflow.sessionId, (t) =>
      toolUseIds.includes(t.id),
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

  private async handleSideRequest(
    params: { rawBody: Buffer; requestId: string },
    headersForAudit: Record<string, string | string[] | undefined>,
    auditSessionId: string,
    classification: RequestClassification,
  ): Promise<AuditWorkflowResult> {
    const isSessionNaming = await this.detectSessionNamingSideRequest(
      auditSessionId,
      params.rawBody,
    );
    const {
      workflow,
      layoutIndex,
      omitted: wfOmitted,
    } = await this.ensureTurnWorkflow(auditSessionId, params.rawBody, {
      skipWorkflowRequest: true,
    });
    if (isSessionNaming) {
      this.workflowRepo.patchWireMeta(workflow.id, { sideRequestKind: 'session-naming' });
    }
    const meta = this.workflowRepo.getWireMeta(workflow.id);
    const seq = meta?.requestSequence ?? (await this.workflowRepo.nextSequence(auditSessionId));
    const { stepIndex, omitted: stepOmitted } = this.registerWireStepRequest(
      workflow,
      headersForAudit,
      params.rawBody,
      'side-request',
    );
    return this.resultFromWorkflow(
      workflow,
      layoutIndex,
      seq,
      wfOmitted || stepOmitted,
      classification,
      'agentic',
      stepIndex,
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

  /**
   * Completa tools client-side (Bash/Read/…) desde bloques `tool_result` del body HTTP
   * cuando el hook PostToolUse no llegó al proxy (p. ej. settings sin relay instalado).
   */
  /** Vía canónica de completación para tools con autoridad `continuation`. */
  private completeClientToolResultsFromContinuation(
    sessionId: string,
    parentWorkflow: IWorkflow,
    rawBody: Buffer,
  ): void {
    const blocks = extractToolResultBlocksFromRequestBody(rawBody);
    for (const block of blocks) {
      const workflow =
        this.workflowRepo.findWorkflowByToolUseId(sessionId, block.toolUseId) ?? parentWorkflow;
      this.workflowRepo.completeToolUse(workflow.id, block.toolUseId, {
        isError: block.isError,
        result: block.content,
      });
    }
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

  private async closeOrphanWorkflows(sessionId: string): Promise<void> {
    const stale = this.workflowRepo.findStaleWorkflowsAwaitingContinuation(
      sessionId,
      AuditWorkflowHandler.ORPHAN_MAX_AGE_MS,
    );
    for (const workflow of stale) {
      await this.closeOrphanWorkflow(workflow);
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

  public async closeOrphanWorkflow(workflow: IWorkflow): Promise<void> {
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

  private collectLostAgentPendings(
    workflowId: string,
  ): Array<{ stepIndex: number; toolUseId: string }> {
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
