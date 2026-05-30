import type { IWorkflow } from '../1-domain/interfaces/gateway/IWorkflow.js';
import type { IWorkflowResult } from '../1-domain/interfaces/gateway/IWorkflowResult.js';
import type { WorkflowOutcome } from '../1-domain/types/gateway/workflow.types.js';
import {
  type ActiveInteraction,
  type AuditInteractionContext,
  type InteractionMetadata,
  type InteractionOutcome,
  type SseReconstructResult,
  computeSseRawBytesTotal,
  computeTokenTotals,
} from '../1-domain/types/audit.types.js';
import type { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';

/** Mapea el outcome del dominio gateway al DTO legacy de meta.json. */
export function mapWorkflowOutcomeToInteraction(outcome: WorkflowOutcome): InteractionOutcome {
  switch (outcome) {
    case 'success':
      return 'completed';
    case 'api_error':
      return 'upstream-error';
    case 'aborted':
      return 'orphaned';
    default:
      return 'completed';
  }
}

export interface ProjectInteractionMetaInput {
  result: IWorkflowResult;
  workflow: IWorkflow;
  turn: ActiveInteraction;
  context?: AuditInteractionContext;
  config: ProxyEnvironmentConfig;
  sse?: boolean;
  streamError?: boolean;
  sseResult?: SseReconstructResult;
  sseErrorMessage?: string | null;
  sseErrorType?: string | null;
  /** Override del outcome wire (truncated, upstream-error por stream). */
  wireOutcome?: InteractionOutcome;
}

/**
 * Proyecta `IWorkflowResult` + contexto de interacción al shape legacy de `meta.json`.
 */
export function projectWorkflowResultToInteractionMetadata(
  input: ProjectInteractionMetaInput,
): InteractionMetadata {
  const { result, turn, context, config, sse = false, streamError = false } = input;
  const endedAt = Date.now();
  const sseRawBytesLimit = config.MAX_AUDIT_BYTES;
  const sseRawBytesTotal = computeSseRawBytesTotal(turn.stepsMeta);
  const sseRawTruncatedAny = turn.stepsMeta.some((s) => s.sseRawTruncatedByLimit === true);

  const totals =
    turn.interactionType !== 'client-preflight'
      ? usageToTotals(result.usage) ?? computeTokenTotals(turn.stepsMeta)
      : null;

  const outcome =
    input.wireOutcome ?? mapWorkflowOutcomeToInteraction(result.outcome);

  const lostPendings =
    turn.pendingAgentToolUses.length > 0 ? turn.pendingAgentToolUses : undefined;
  const lostPendingsWebSearch =
    turn.pendingWebSearchToolUses.length > 0 ? turn.pendingWebSearchToolUses : undefined;
  const lostPendingsWebFetch =
    turn.pendingWebFetchToolUses.length > 0 ? turn.pendingWebFetchToolUses : undefined;

  return {
    interactionType: turn.interactionType,
    ...(turn.modelId ? { modelId: turn.modelId } : {}),
    outcome,
    stepCount: result.stepCount > 0 ? result.stepCount : turn.stepsMeta.length,
    startedAt: new Date(turn.startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    durationMs: endedAt - turn.startedAt,
    statusCode: context?.responseStatusCode ?? null,
    sse,
    steps: turn.stepsMeta,
    totals,
    sseResponseBodyAttempted: input.sseResult?.sseResponseBodyAttempted ?? false,
    sseResponseBodyWritten: input.sseResult?.sseResponseBodyWritten ?? false,
    sseResponseBodyError: input.sseResult?.sseResponseBodyError ?? null,
    sseResponseBodySource: input.sseResult?.sseResponseBodySource ?? null,
    errorMessage: input.sseErrorMessage ?? null,
    errorCode: input.sseErrorType ?? null,
    ...(turn.parentContext ? { parentContext: turn.parentContext } : {}),
    ...(turn.sideRequestKind ? { sideRequestKind: turn.sideRequestKind } : {}),
    ...(lostPendings ? { lostPendingAgents: lostPendings } : {}),
    ...(lostPendingsWebSearch ? { lostPendingWebSearch: lostPendingsWebSearch } : {}),
    ...(lostPendingsWebFetch ? { lostPendingWebFetch: lostPendingsWebFetch } : {}),
    ...(turn.resolvedInternalTools.length > 0
      ? { resolvedInternalTools: turn.resolvedInternalTools }
      : {}),
    truncation: {
      requestBodyOmitted: turn.requestBodyOmitted,
      responseBodyBytesTotal: null,
      responseBodyBytesAudited: null,
      responseTruncatedByProxyBuffer: false,
      responseTruncatedByAuditLimit: false,
      sseRawBytesAudited: sseRawBytesTotal || null,
      sseRawBytesLimit,
      sseRawTruncatedByLimit: sseRawTruncatedAny,
      sseRawWriteError: streamError,
    },
  };
}

function usageToTotals(usage: IWorkflowResult['usage']): InteractionMetadata['totals'] {
  if (!usage) return null;
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
  };
}
