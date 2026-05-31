import { describe, it, expect, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { AuditSseResponseHandler } from '../../src/3-operations/audit-sse-response.handler.js';
import type { IAuditWriter } from '../../src/2-services/ports/audit-writer.port.js';
import type { ISseReconstructor } from '../../src/2-services/ports/sse-reconstructor.port.js';
import type { IWorkflowRepository } from '../../src/1-domain/repositories/IWorkflowRepository.js';
import type { IEventBus } from '../../src/1-domain/repositories/IEventBus.js';
import type { IWorkflow } from '../../src/1-domain/interfaces/gateway/IWorkflow.js';
import { StepAssemblerService } from '../../src/2-services/step-assembler.service.js';
import { WorkflowRepositoryService } from '../../src/2-services/workflow-repository.service.js';
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

function makeAuditWriter(overrides: Partial<IAuditWriter> = {}): IAuditWriter {
  return {
    writeFileAtomic: async () => {},
    writeJsonAtomic: async () => {},
    writeFormattedAndMarkdown: async () => {},
    writeInteractionRequest: async () => ({ dir: '', requestBodyOmitted: false }),
    writeSubInteractionRequest: async () => ({ dir: '', requestBodyOmitted: false }),
    nextSubInteractionSequence: async () => 1,
    writeStepRequest: async () => {},
    finalizeNonSseResponseAudit: async () => ({
      responseBodyBytesAudited: 0,
      responseTruncatedByProxyBuffer: false,
      responseTruncatedByAuditLimit: false,
    }),
    finalizeNonSseResponseAuditOnStreamError: async () => ({
      responseBodyBytesAudited: 0,
      responseTruncatedByProxyBuffer: false,
      responseTruncatedByAuditLimit: false,
    }),
    writeResponseHeadersAudit: async () => {},
    writeTopLevelResponseHeaders: async () => {},
    writeInteractionMeta: async () => {},
    appendSseLine: vi.fn(),
    appendSseRawChunk: vi.fn(),
    writeInteractionState: async () => {},
    removeInteractionState: async () => {},
    writeStepResponseMarkdown: async () => {},
    writeCoalescedAgentStepResponse: async () => {},
    writeStepThought: async () => {},
    writeTopLevelMultiStepResponse: async () => ({ written: true }),
    ...overrides,
  };
}

function makeSseReconstructor(overrides: Partial<ISseReconstructor> = {}): ISseReconstructor {
  return {
    reconstructStepMessage: async () => ({}) as never,
    reconstructSseJsonlFile: async () => ({}) as never,
    reconstructSseJsonlPhaseMessage: async () => ({}) as never,
    runReconstruction: async () => ({
      sseResponseBodyAttempted: false,
      sseResponseBodyWritten: false,
    }),
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

function makeSseHandler(
  auditWriter: IAuditWriter = makeAuditWriter(),
  sseReconstruct: ISseReconstructor = makeSseReconstructor(),
  repo: IWorkflowRepository = makeWorkflowRepo(),
  eventBus: IEventBus = makeEventBus(),
): AuditSseResponseHandler {
  return new AuditSseResponseHandler(
    auditWriter,
    sseReconstruct,
    makeConfig(),
    () => new StepAssemblerService(),
    repo,
    eventBus,
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
  it('es no-op si no existe workflow para la sesión', async () => {
    const appendSseLine = vi.fn();
    const repo = makeWorkflowRepo({ getWorkflowBySessionId: vi.fn(() => undefined) });
    const handler = makeSseHandler(makeAuditWriter({ appendSseLine }), undefined, repo);

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), {});
    stream.write(Buffer.from(SSE_END_TURN));
    stream.end();
    await wait();

    expect(appendSseLine).not.toHaveBeenCalled();
  });

  it('captura líneas SSE vía appendSseLine cuando existe workflow', async () => {
    const appendSseLine = vi.fn();
    const wf = stubWorkflow();
    const repo = makeWorkflowRepo({
      getWorkflowBySessionId: vi.fn(() => wf),
      getWorkflow: vi.fn(() => wf),
      closeStep: vi.fn(),
    });
    const handler = makeSseHandler(makeAuditWriter({ appendSseLine }), undefined, repo);

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), {});
    stream.write(Buffer.from(SSE_END_TURN));
    stream.end();
    await wait();

    expect(appendSseLine).toHaveBeenCalled();
    const firstCall = (appendSseLine as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(firstCall).toHaveProperty('line');
  });

  it('captura chunks SSE raw vía appendSseRawChunk', async () => {
    const appendSseRawChunk = vi.fn();
    const wf = stubWorkflow();
    const repo = makeWorkflowRepo({
      getWorkflowBySessionId: vi.fn(() => wf),
      getWorkflow: vi.fn(() => wf),
      closeStep: vi.fn(),
    });
    const handler = makeSseHandler(makeAuditWriter({ appendSseRawChunk }), undefined, repo);

    const stream = new PassThrough();
    handler.execute(stream, makeContext(), {});
    stream.write(Buffer.from('data: test\n\n'));
    stream.end();
    await wait();

    expect(appendSseRawChunk).toHaveBeenCalled();
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
    handler.execute(stream, makeContext({ auditSessionId: 'session-1' }), {});
    stream.write(Buffer.from(SSE_END_TURN));
    stream.end();
    await wait();

    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'step_response' }));
  });
});
