import { describe, it, expect, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { AuditStandardResponseHandler } from '../../src/3-operations/audit-standard-response.handler.js';
import type { IEventBus } from '../../src/1-domain/repositories/IEventBus.js';
import type { IWorkflowRepository } from '../../src/1-domain/repositories/IWorkflowRepository.js';
import type { IWorkflow } from '../../src/1-domain/interfaces/gateway/IWorkflow.js';
import type { IStep } from '../../src/1-domain/interfaces/gateway/IStep.js';
import { AuditWorkflowContext } from '../../src/1-domain/types/audit.types.js';
import { makeTestConfig as makeConfig } from '../helpers/test-config.js';
import type { SessionMetricsService } from '../../src/2-services/session-metrics.service.js';

function makeSessionMetrics(): SessionMetricsService {
  return {
    updateFromStep: vi.fn().mockResolvedValue(undefined),
    finalizeWorkflowMetrics: vi.fn().mockResolvedValue(undefined),
  } as unknown as SessionMetricsService;
}

const AUDIT_BASE = '/tmp/sessions';

function makeEventBus(overrides: Partial<IEventBus> = {}): IEventBus {
  return {
    publish: vi.fn(),
    subscribe: vi.fn(() => ({ id: 'sub-1', pattern: '*' })),
    unsubscribe: vi.fn(),
    ...overrides,
  };
}

function makeWorkflowRepo(overrides: Partial<IWorkflowRepository> = {}): IWorkflowRepository {
  return {
    openSubagentFromWire: vi.fn(),
    getWorkflowByAgentId: vi.fn(),
    confirmSubagentFromHook: vi.fn(),
    openWorkflow: vi.fn(),
    openSubagentWorkflow: vi.fn(),
    getWorkflow: vi.fn(),
    registerStep: vi.fn(),
    closeStep: vi.fn(),
    registerToolUse: vi.fn(),
    readyToClose: vi.fn(),
    close: vi.fn(),
    setWorkflowModel: vi.fn(),
    completeToolUse: vi.fn(),
    getWorkflowBySessionId: vi.fn(),
    findWorkflowWithPendingToolUse: vi.fn(),
    registerPendingToolUse: vi.fn(),
    consumePendingToolUse: vi.fn(),
    findStaleWorkflows: vi.fn(() => []),
    findStaleWorkflowsAwaitingContinuation: vi.fn(() => []),
    getAllRunningWorkflows: vi.fn(() => []),
    findWorkflowWithPendingTools: vi.fn(),
    findWorkflowByToolUseId: vi.fn(),
    consumeFirstPendingToolUseByName: vi.fn(),
    getWireMeta: vi.fn(),
    patchWireMeta: vi.fn(),
    allocLayoutIndex: vi.fn(async () => 0),
    nextSequence: vi.fn(async () => 0),
    withSessionLock: vi.fn(async (_s, fn) => fn()),
    forceClose: vi.fn(),
    clearToolUseIndexFor: vi.fn(),
    ...overrides,
  };
}

function stubWorkflow(id = 'session-1'): IWorkflow {
  return { id, sessionId: id, kind: 'main', status: 'running', steps: [], startedAt: new Date() };
}

function stubWorkflowWithOpenStep(index: number, id = 'session-1'): IWorkflow {
  return {
    ...stubWorkflow(id),
    steps: [
      {
        id: 'step-uuid',
        workflowId: id,
        index,
        inferenceRequest: { model: 'claude-test', messages: [], max_tokens: 8192 },
        assistantMessage: { role: 'assistant', content: [] },
        toolUses: [],
        startedAt: new Date(),
      },
    ],
  };
}

function makeContext(overrides: Partial<AuditWorkflowContext> = {}): AuditWorkflowContext {
  return {
    requestId: 'req-1',
    requestSequence: 1,
    auditSessionId: 'session-1',
    workflowId: 'session-1',
    method: 'POST',
    url: '/v1/messages',
    upstream: 'https://api.anthropic.com',
    requestStartTime: Date.now(),
    requestBodyBytes: 100,
    requestBodyOmitted: false,
    auditWorkflowDir: '/tmp/sessions/session-1/interactions/000001_req-1',
    responseStatusCode: 200,
    workflowKind: 'agentic',
    assignedStepIndex: 1,
    ...overrides,
  };
}

const BODY_WITH_USAGE = JSON.stringify({
  id: 'msg_1',
  stop_reason: 'end_turn',
  usage: { input_tokens: 10, output_tokens: 5 },
  content: [],
});

function wait(ms = 50) {
  return new Promise((r) => setTimeout(r, ms));
}

describe('AuditStandardResponseHandler', () => {
  it('registra wire step y emite step_response cuando hay usage', async () => {
    const wf = stubWorkflow();
    const publish = vi.fn();
    const registerStep = vi.fn();
    const repo = makeWorkflowRepo({
      getWorkflow: vi.fn(() => wf),
      registerStep,
      closeStep: vi.fn(),
    });
    const handler = new AuditStandardResponseHandler(
      makeEventBus({ publish }),
      makeConfig(),
      repo,
      AUDIT_BASE,
      makeSessionMetrics(),
    );

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), 'application/json');
    stream.write(Buffer.from(BODY_WITH_USAGE));
    stream.end();
    await wait();

    expect(registerStep).toHaveBeenCalled();
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'step_response',
        workflowId: 'session-1',
        payload: expect.objectContaining({ workflowId: 'session-1', response: expect.any(Object) }),
      }),
    );
  });

  it('incluye headers en step_response cuando se proporcionan', async () => {
    const wf = stubWorkflow();
    const publish = vi.fn();
    const repo = makeWorkflowRepo({
      getWorkflow: vi.fn(() => wf),
      closeStep: vi.fn(),
    });
    const handler = new AuditStandardResponseHandler(
      makeEventBus({ publish }),
      makeConfig(),
      repo,
      AUDIT_BASE,
      makeSessionMetrics(),
    );

    const stream = new PassThrough();
    const headers = { 'x-request-id': 'abc' };
    handler.execute(stream, makeContext(), 'application/json', headers);
    stream.write(Buffer.from(BODY_WITH_USAGE));
    stream.end();
    await wait();

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ headers }),
      }),
    );
  });

  it('es no-op si no hay workflow para el workflowId del context', async () => {
    const publish = vi.fn();
    const registerStep = vi.fn();
    const repo = makeWorkflowRepo({
      getWorkflow: vi.fn(() => undefined),
      registerStep,
    });
    const handler = new AuditStandardResponseHandler(
      makeEventBus({ publish }),
      makeConfig(),
      repo,
      AUDIT_BASE,
      makeSessionMetrics(),
    );

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), 'application/json');
    stream.write(Buffer.from(BODY_WITH_USAGE));
    stream.end();
    await wait();

    expect(registerStep).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('emite step_response con stop_reason sin usage', async () => {
    const wf = stubWorkflowWithOpenStep(1);
    const publish = vi.fn();
    const closeStep = vi.fn();
    const repo = makeWorkflowRepo({
      getWorkflow: vi.fn(() => wf),
      closeStep,
    });
    const handler = new AuditStandardResponseHandler(
      makeEventBus({ publish }),
      makeConfig(),
      repo,
      AUDIT_BASE,
      makeSessionMetrics(),
    );

    const stream = new PassThrough();
    handler.execute(stream, makeContext({ assignedStepIndex: 1 }), 'application/json');
    stream.write(Buffer.from('{"id":"msg_1","stop_reason":"end_turn"}'));
    stream.end();
    await wait();

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'step_response',
        payload: expect.objectContaining({
          stepIndex: 1,
          response: { id: 'msg_1', stop_reason: 'end_turn' },
        }),
      }),
    );
    expect(closeStep).toHaveBeenCalled();
  });

  it('emite step_response para count_tokens sin usage', async () => {
    const wf = stubWorkflowWithOpenStep(5);
    const publish = vi.fn();
    const closeStep = vi.fn();
    const repo = makeWorkflowRepo({
      getWorkflow: vi.fn(() => wf),
      closeStep,
    });
    const handler = new AuditStandardResponseHandler(
      makeEventBus({ publish }),
      makeConfig(),
      repo,
      AUDIT_BASE,
      makeSessionMetrics(),
    );

    const stream = new PassThrough();
    handler.execute(
      stream,
      makeContext({ assignedStepIndex: 5, url: '/v1/messages/count_tokens' }),
      'application/json',
    );
    stream.write(Buffer.from('{"input_tokens": 42444}'));
    stream.end();
    await wait();

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'step_response',
        payload: expect.objectContaining({
          stepIndex: 5,
          response: { input_tokens: 42444 },
        }),
      }),
    );
    expect(closeStep).toHaveBeenCalled();
  });

  it('no invoca updateFromStep sin usage', async () => {
    const wf = stubWorkflowWithOpenStep(1);
    const publish = vi.fn();
    const sessionMetrics = makeSessionMetrics();
    const repo = makeWorkflowRepo({
      getWorkflow: vi.fn(() => wf),
      closeStep: vi.fn(),
    });
    const handler = new AuditStandardResponseHandler(
      makeEventBus({ publish }),
      makeConfig(),
      repo,
      AUDIT_BASE,
      sessionMetrics,
    );

    const stream = new PassThrough();
    handler.execute(stream, makeContext({ assignedStepIndex: 1 }), 'application/json');
    stream.write(Buffer.from('{"input_tokens": 100}'));
    stream.end();
    await wait();

    expect(publish).toHaveBeenCalled();
    expect(sessionMetrics.updateFromStep).not.toHaveBeenCalled();
  });

  it('respuesta sin usage en índice 5 no enriquece step abierto en índice 6', async () => {
    const id = 'session-1';
    const step5: IStep = {
      id: 'step-5',
      workflowId: id,
      index: 5,
      inferenceRequest: { model: 'claude-test', messages: [], max_tokens: 8192 },
      assistantMessage: { role: 'assistant', content: [] },
      toolUses: [],
      startedAt: new Date(),
    };
    const step6: IStep = {
      id: 'step-6',
      workflowId: id,
      index: 6,
      inferenceRequest: { model: 'claude-test', messages: [], max_tokens: 8192 },
      assistantMessage: { role: 'assistant', content: [] },
      toolUses: [],
      startedAt: new Date(),
    };
    const wf: IWorkflow = {
      ...stubWorkflow(id),
      steps: [step5, step6],
    };
    const closeStep = vi.fn();
    const publish = vi.fn();
    const repo = makeWorkflowRepo({
      getWorkflow: vi.fn(() => wf),
      closeStep,
    });
    const handler = new AuditStandardResponseHandler(
      makeEventBus({ publish }),
      makeConfig(),
      repo,
      AUDIT_BASE,
      makeSessionMetrics(),
    );

    const stream = new PassThrough();
    handler.execute(
      stream,
      makeContext({ assignedStepIndex: 5, url: '/v1/messages/count_tokens' }),
      'application/json',
    );
    stream.write(Buffer.from('{"input_tokens": 42444}'));
    stream.end();
    await wait();

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ stepIndex: 5 }),
      }),
    );
    expect(closeStep).toHaveBeenCalledWith(id, 'step-5');
    expect(closeStep).not.toHaveBeenCalledWith(id, 'step-6');
    expect(step6.closedAt).toBeUndefined();
  });

  it('trunca el buffer en memoria al superar MAX_RESPONSE_BUFFER_BYTES', async () => {
    const wf = stubWorkflow();
    const repo = makeWorkflowRepo({
      getWorkflow: vi.fn(() => wf),
      closeStep: vi.fn(),
    });
    const config = makeConfig({ MAX_RESPONSE_BUFFER_BYTES: 5 });
    const publish = vi.fn();
    const handler = new AuditStandardResponseHandler(
      makeEventBus({ publish }),
      config,
      repo,
      AUDIT_BASE,
      makeSessionMetrics(),
    );

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), 'application/json');
    // Después de 5 bytes el buffer deja de acumular
    stream.write(Buffer.from('{"us'));
    stream.write(Buffer.from('age":{"input_tokens":1,"output_tokens":2}}'));
    stream.end();
    await wait();

    // El body truncado no es JSON válido → sin step_response
    expect(publish).not.toHaveBeenCalled();
  });

  it('llama forceClose con api_error cuando el stream emite error', async () => {
    const wf = stubWorkflow();
    const forceClose = vi.fn();
    const repo = makeWorkflowRepo({
      getWorkflow: vi.fn(() => wf),
      forceClose,
    });
    const handler = new AuditStandardResponseHandler(
      makeEventBus(),
      makeConfig(),
      repo,
      AUDIT_BASE,
      makeSessionMetrics(),
    );

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), 'application/json');
    stream.destroy(new Error('stream broken'));
    await wait();

    expect(forceClose).toHaveBeenCalledWith('session-1', 'api_error');
  });
});
