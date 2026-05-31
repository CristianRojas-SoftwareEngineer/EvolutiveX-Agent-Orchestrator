import { describe, it, expect, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { AuditStandardResponseHandler } from '../../src/3-operations/audit-standard-response.handler.js';
import type { IEventBus } from '../../src/1-domain/repositories/IEventBus.js';
import type { IWorkflowRepository } from '../../src/1-domain/repositories/IWorkflowRepository.js';
import type { IWorkflow } from '../../src/1-domain/interfaces/gateway/IWorkflow.js';
import { AuditInteractionContext } from '../../src/1-domain/types/audit.types.js';
import { makeTestConfig as makeConfig } from '../helpers/test-config.js';

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
    nextSequence: vi.fn(async () => 0),
    withSessionLock: vi.fn(async (_s, fn) => fn()),
    forceClose: vi.fn(),
    ...overrides,
  };
}

function stubWorkflow(id = 'session-1'): IWorkflow {
  return { id, sessionId: id, kind: 'main', status: 'running', steps: [], startedAt: new Date() };
}

function makeContext(overrides: Partial<AuditInteractionContext> = {}): AuditInteractionContext {
  return {
    requestId: 'req-1',
    requestSequence: 1,
    auditSessionId: 'session-1',
    method: 'POST',
    url: '/v1/messages',
    upstream: 'https://api.anthropic.com',
    requestStartTime: Date.now(),
    requestBodyBytes: 100,
    requestBodyOmitted: false,
    auditInteractionDir: '/tmp/sessions/session-1/interactions/000001_req-1',
    responseStatusCode: 200,
    interactionType: 'agentic',
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
      getWorkflowBySessionId: vi.fn(() => wf),
      registerStep,
      getWorkflow: vi.fn(() => wf),
      closeStep: vi.fn(),
    });
    const handler = new AuditStandardResponseHandler(
      makeEventBus({ publish }),
      makeConfig(),
      repo,
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
      getWorkflowBySessionId: vi.fn(() => wf),
      getWorkflow: vi.fn(() => wf),
      closeStep: vi.fn(),
    });
    const handler = new AuditStandardResponseHandler(
      makeEventBus({ publish }),
      makeConfig(),
      repo,
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

  it('es no-op si no hay workflow para la sesión', async () => {
    const publish = vi.fn();
    const registerStep = vi.fn();
    const repo = makeWorkflowRepo({
      getWorkflowBySessionId: vi.fn(() => undefined),
      registerStep,
    });
    const handler = new AuditStandardResponseHandler(makeEventBus({ publish }), makeConfig(), repo);

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), 'application/json');
    stream.write(Buffer.from(BODY_WITH_USAGE));
    stream.end();
    await wait();

    expect(registerStep).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('no emite step_response si el body no tiene usage', async () => {
    const wf = stubWorkflow();
    const publish = vi.fn();
    const repo = makeWorkflowRepo({ getWorkflowBySessionId: vi.fn(() => wf) });
    const handler = new AuditStandardResponseHandler(makeEventBus({ publish }), makeConfig(), repo);

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), 'application/json');
    stream.write(Buffer.from('{"id":"msg_1","stop_reason":"end_turn"}'));
    stream.end();
    await wait();

    expect(publish).not.toHaveBeenCalled();
  });

  it('trunca el buffer en memoria al superar MAX_RESPONSE_BUFFER_BYTES', async () => {
    const wf = stubWorkflow();
    const repo = makeWorkflowRepo({
      getWorkflowBySessionId: vi.fn(() => wf),
      getWorkflow: vi.fn(() => wf),
      closeStep: vi.fn(),
    });
    const config = makeConfig({ MAX_RESPONSE_BUFFER_BYTES: 5 });
    const publish = vi.fn();
    const handler = new AuditStandardResponseHandler(makeEventBus({ publish }), config, repo);

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), 'application/json');
    // Después de 5 bytes el buffer deja de acumular
    stream.write(Buffer.from('{"us'));
    stream.write(Buffer.from('age":{"input_tokens":1,"output_tokens":2}}'));
    stream.end();
    await wait();

    // El body truncado no es JSON válido → sin usage → sin emit
    expect(publish).not.toHaveBeenCalled();
  });

  it('llama forceClose con api_error cuando el stream emite error', async () => {
    const wf = stubWorkflow();
    const forceClose = vi.fn();
    const repo = makeWorkflowRepo({
      getWorkflowBySessionId: vi.fn(() => wf),
      forceClose,
    });
    const handler = new AuditStandardResponseHandler(makeEventBus(), makeConfig(), repo);

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), 'application/json');
    stream.destroy(new Error('stream broken'));
    await wait();

    expect(forceClose).toHaveBeenCalledWith('session-1', 'api_error');
  });
});
