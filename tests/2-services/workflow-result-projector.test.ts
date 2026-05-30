import { describe, it, expect } from 'vitest';
import {
  mapWorkflowOutcomeToInteraction,
  projectWorkflowResultToInteractionMetadata,
} from '../../src/2-services/workflow-result-projector.service.js';
import type { ActiveInteraction } from '../../src/1-domain/types/audit.types.js';
import type { IWorkflow } from '../../src/1-domain/interfaces/gateway/IWorkflow.js';
import type { ProxyEnvironmentConfig } from '../../src/1-domain/types/config.types.js';

const config = { MAX_AUDIT_BYTES: 1_000_000 } as ProxyEnvironmentConfig;

function makeTurn(overrides: Partial<ActiveInteraction> = {}): ActiveInteraction {
  return {
    interactionDir: '/tmp/i',
    interactionType: 'agentic',
    stepCount: 1,
    requestSequence: 1,
    startedAt: 1_000,
    requestBodyOmitted: false,
    requestBodyBytes: 100,
    stepsMeta: [{ stepIndex: 1, sse: true, statusCode: 200, inputTokens: 10, outputTokens: 5 }],
    sessionId: 'sess-1',
    pendingAgentToolUses: [],
    pendingWebSearchToolUses: [],
    pendingWebFetchToolUses: [],
    resolvedInternalTools: [],
    modelId: 'claude-sonnet',
    ...overrides,
  };
}

const workflow: IWorkflow = {
  id: 'sess-1',
  sessionId: 'sess-1',
  kind: 'main',
  status: 'completed',
  steps: [],
  startedAt: new Date(),
};

describe('mapWorkflowOutcomeToInteraction', () => {
  it('mapea success a completed', () => {
    expect(mapWorkflowOutcomeToInteraction('success')).toBe('completed');
  });

  it('mapea api_error a upstream-error', () => {
    expect(mapWorkflowOutcomeToInteraction('api_error')).toBe('upstream-error');
  });
});

describe('projectWorkflowResultToInteractionMetadata', () => {
  it('proyecta outcome, stepCount y totals desde WorkflowResult', () => {
    const meta = projectWorkflowResultToInteractionMetadata({
      result: {
        outcome: 'success',
        stepCount: 2,
        usage: { input_tokens: 100, output_tokens: 50 },
        closedByEvent: 'Stop',
        sessionId: 'sess-1',
      },
      workflow,
      turn: makeTurn(),
      config,
      sse: true,
    });

    expect(meta.outcome).toBe('completed');
    expect(meta.stepCount).toBe(2);
    expect(meta.totals?.inputTokens).toBe(100);
    expect(meta.totals?.outputTokens).toBe(50);
    expect(meta.sse).toBe(true);
  });
});
