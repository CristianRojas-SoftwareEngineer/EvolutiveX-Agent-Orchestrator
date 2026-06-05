import { describe, it, expect, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { AuditSseResponseHandler } from '../../src/3-operations/audit-sse-response.handler.js';
import type { IWorkflowRepository } from '../../src/1-domain/repositories/IWorkflowRepository.js';
import type { IEventBus } from '../../src/1-domain/repositories/IEventBus.js';
import type { IWorkflow } from '../../src/1-domain/interfaces/gateway/IWorkflow.js';
import { StepAssemblerService } from '../../src/2-services/step-assembler.service.js';
import { WorkflowRepositoryService } from '../../src/2-services/workflow-repository.service.js';
import { AuditWorkflowContext } from '../../src/1-domain/types/audit.types.js';
import { makeTestConfig as makeConfig } from '../helpers/test-config.js';
import type { SessionMetricsService } from '../../src/2-services/session-metrics.service.js';

function makeSessionMetrics(): SessionMetricsService {
  return {
    updateFromStep: vi.fn().mockResolvedValue(undefined),
    finalizeWorkflowMetrics: vi.fn().mockResolvedValue(undefined),
  } as unknown as SessionMetricsService;
}

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

function makeSseHandler(
  _unused1?: unknown,
  _unused2?: unknown,
  repo: IWorkflowRepository = makeWorkflowRepo(),
  eventBus: IEventBus = makeEventBus(),
): AuditSseResponseHandler {
  return new AuditSseResponseHandler(
    makeConfig(),
    () => new StepAssemblerService(),
    repo,
    eventBus,
    '/tmp/sessions',
    makeSessionMetrics(),
  );
}

const SSE_END_TURN = [
  'event: message_start',
  'data: {"type":"message_start","message":{"usage":{"input_tokens":5,"output_tokens":0}}}',
  '',
  'event: message_delta',
  'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":10}}',
  '',
  'event: message_stop',
  'data: {"type":"message_stop"}',
  '',
].join('\n');

function wait(ms = 80) {
  return new Promise((r) => setTimeout(r, ms));
}

describe('AuditSseResponseHandler', () => {
  it('es no-op si no existe workflow para el workflowId del context', async () => {
    const publish = vi.fn();
    const repo = makeWorkflowRepo({ getWorkflow: vi.fn(() => undefined) });
    const handler = makeSseHandler(undefined, undefined, repo, makeEventBus({ publish }));

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), {});
    stream.write(Buffer.from(SSE_END_TURN));
    stream.end();
    await wait();

    const chunkCalls = (publish as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([e]) => e.type === 'stream_chunk',
    );
    expect(chunkCalls.length).toBe(0);
  });

  it('publica stream_chunk por cada línea SSE no vacía', async () => {
    const publish = vi.fn();
    const wf = stubWorkflow();
    const repo = makeWorkflowRepo({
      getWorkflowBySessionId: vi.fn(() => wf),
      getWorkflow: vi.fn(() => wf),
      closeStep: vi.fn(),
    });
    const handler = makeSseHandler(undefined, undefined, repo, makeEventBus({ publish }));

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), {});
    stream.write(Buffer.from(SSE_END_TURN));
    stream.end();
    await wait();

    const chunkCalls = (publish as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([e]) => e.type === 'stream_chunk',
    );
    expect(chunkCalls.length).toBeGreaterThan(0);
    const firstChunk = chunkCalls[0][0];
    expect(firstChunk.payload.chunk).toHaveProperty('line');
    expect(firstChunk.payload).toHaveProperty('stepIndex', 0);
  });


  it('registra wire step en correlador al final del stream', async () => {
    const registerStep = vi.fn();
    const wf = stubWorkflow();
    const repo = makeWorkflowRepo({
      getWorkflowBySessionId: vi.fn(() => wf),
      getWorkflow: vi.fn(() => wf),
      registerStep,
      closeStep: vi.fn(),
    });
    const handler = makeSseHandler(undefined, undefined, repo);

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), {});
    stream.write(Buffer.from(SSE_END_TURN));
    stream.end();
    await wait();

    expect(registerStep).toHaveBeenCalled();
  });

  it('emite step_response al finalizar con usage', async () => {
    const publish = vi.fn();
    const wf = stubWorkflow();
    const repo = makeWorkflowRepo({
      getWorkflowBySessionId: vi.fn(() => wf),
      getWorkflow: vi.fn(() => wf),
      closeStep: vi.fn(),
    });
    const handler = makeSseHandler(undefined, undefined, repo, makeEventBus({ publish }));

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), {});
    stream.write(Buffer.from(SSE_END_TURN));
    stream.end();
    await wait();

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'step_response',
        workflowId: 'session-1',
      }),
    );
  });

  it('registra pending tool use para herramienta Agent', async () => {
    const registerPendingToolUse = vi.fn();
    const wf = stubWorkflow();
    const repo = makeWorkflowRepo({
      getWorkflowBySessionId: vi.fn(() => wf),
      getWorkflow: vi.fn(() => wf),
      closeStep: vi.fn(),
      registerPendingToolUse,
    });
    const handler = makeSseHandler(undefined, undefined, repo);

    const sse = [
      'data: {"type":"message_start","message":{"usage":{"input_tokens":5,"output_tokens":0}}}',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tu_abc","name":"Agent","input":{}}}',
      'data: {"type":"content_block_stop","index":0}',
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":3}}',
      'data: {"type":"message_stop"}',
      '',
    ].join('\n');

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), {});
    stream.write(Buffer.from(sse));
    stream.end();
    await wait();

    expect(registerPendingToolUse).toHaveBeenCalled();
    const [, , toolUse] = (registerPendingToolUse as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(toolUse.id).toBe('tu_abc');
    expect(toolUse.name).toBe('Agent');
  });

  it('usa WorkflowRepositoryService real para integración básica', async () => {
    const repo = new WorkflowRepositoryService();
    repo.openWorkflow('session-1', { agentId: undefined, isSubagentRequest: false });
    const publish = vi.fn();
    const handler = makeSseHandler(undefined, undefined, repo, makeEventBus({ publish }));

    const stream = new PassThrough();
    handler.execute(stream, makeContext({ auditSessionId: 'session-1', workflowId: 'session-1' }), {});
    stream.write(Buffer.from(SSE_END_TURN));
    stream.end();
    await wait();

    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'step_response' }));
  });

  it('atribuye stream_chunks al workflowId del AuditWorkflowContext (no al main de sessionId)', async () => {
    const publish = vi.fn();
    const wireWf = stubWorkflow('session-1-wire-1');
    wireWf.sessionId = 'session-1';
    const repo = makeWorkflowRepo({
      getWorkflow: vi.fn((id: string) => id === 'session-1-wire-1' ? wireWf : undefined),
      closeStep: vi.fn(),
    });
    const handler = makeSseHandler(undefined, undefined, repo, makeEventBus({ publish }));

    const stream = new PassThrough();
    handler.execute(stream, makeContext({ auditSessionId: 'session-1', workflowId: 'session-1-wire-1' }), {});
    stream.write(Buffer.from(SSE_END_TURN));
    stream.end();
    await wait();

    const chunkCalls = (publish as ReturnType<typeof vi.fn>).mock.calls.filter(([e]) => e.type === 'stream_chunk');
    expect(chunkCalls.length).toBeGreaterThan(0);
    for (const [evt] of chunkCalls) {
      expect(evt.workflowId).toBe('session-1-wire-1');
    }
  });

  it('registra registerPendingToolUse contra el workflowId del context, no el main', async () => {
    const registerPendingToolUse = vi.fn();
    const wireWf = stubWorkflow('session-1-wire-1');
    wireWf.sessionId = 'session-1';
    const repo = makeWorkflowRepo({
      getWorkflow: vi.fn((id: string) => id === 'session-1-wire-1' ? wireWf : undefined),
      closeStep: vi.fn(),
      registerPendingToolUse,
    });
    const handler = makeSseHandler(undefined, undefined, repo);

    const sse = [
      'data: {"type":"message_start","message":{"usage":{"input_tokens":5,"output_tokens":0}}}',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tu_wire","name":"Agent","input":{}}}',
      'data: {"type":"content_block_stop","index":0}',
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":3}}',
      'data: {"type":"message_stop"}',
      '',
    ].join('\n');

    const stream = new PassThrough();
    handler.execute(stream, makeContext({ auditSessionId: 'session-1', workflowId: 'session-1-wire-1' }), {});
    stream.write(Buffer.from(sse));
    stream.end();
    await wait();

    expect(registerPendingToolUse).toHaveBeenCalled();
    const [wfId] = (registerPendingToolUse as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(wfId).toBe('session-1-wire-1');
  });

  it('stream.on("error") invoca clearToolUseIndexFor con el workflowId correcto', async () => {
    const clearToolUseIndexFor = vi.fn();
    const wf = stubWorkflow('session-1-wire-1');
    wf.sessionId = 'session-1';
    const repo = makeWorkflowRepo({
      getWorkflow: vi.fn(() => wf),
      clearToolUseIndexFor,
    });
    const handler = makeSseHandler(undefined, undefined, repo);

    const stream = new PassThrough();
    handler.execute(stream, makeContext({ workflowId: 'session-1-wire-1' }), {});
    stream.destroy(new Error('fallo de red'));
    await wait();

    expect(clearToolUseIndexFor).toHaveBeenCalledWith('session-1-wire-1');
  });
});
