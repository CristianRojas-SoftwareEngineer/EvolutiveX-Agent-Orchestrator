import { describe, it, expect, vi } from 'vitest';
import { AuditHookEventHandler } from '../../src/3-operations/audit-hook-event.handler.js';
import type { IWorkflowRepository } from '../../src/1-domain/repositories/IWorkflowRepository.js';
import type { IWorkflow } from '../../src/1-domain/interfaces/gateway/IWorkflow.js';
import type { SessionMetricsService } from '../../src/2-services/session-metrics.service.js';

function makeRepo(overrides: Partial<IWorkflowRepository> = {}): IWorkflowRepository {
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
    completeToolUse: vi.fn(),
    getToolCompletionAuthority: vi.fn(),
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
  return {
    id,
    sessionId: id,
    kind: 'main',
    status: 'running',
    steps: [
      {
        id: 's1',
        workflowId: id,
        index: 0,
        inferenceRequest: { model: 'm', messages: [], max_tokens: 1 },
        assistantMessage: { role: 'assistant', content: [] },
        toolUses: [],
        usage: { input_tokens: 0, output_tokens: 0 },
        startedAt: new Date(),
        closedAt: new Date(),
      },
    ],
    startedAt: new Date(),
  };
}

function makeSessionMetrics(): SessionMetricsService {
  return {
    updateFromStep: vi.fn().mockResolvedValue(undefined),
    finalizeWorkflowMetrics: vi.fn().mockResolvedValue(undefined),
  } as unknown as SessionMetricsService;
}

function makeHandler(
  repo: IWorkflowRepository,
  sessionMetrics = makeSessionMetrics(),
): AuditHookEventHandler {
  return new AuditHookEventHandler(repo, '/tmp/sessions', sessionMetrics);
}

describe('AuditHookEventHandler', () => {
  it('SubagentStart → confirmSubagentFromHook llamado con agentId y toolUseId', () => {
    const repo = makeRepo();
    const handler = makeHandler(repo);

    handler.execute({
      eventName: 'SubagentStart',
      sessionId: 'session-1',
      agentId: 'agent-child',
      toolUseId: 'tu-abc',
    });

    expect(repo.confirmSubagentFromHook).toHaveBeenCalledOnce();
    expect(repo.confirmSubagentFromHook).toHaveBeenCalledWith('agent-child', 'tu-abc');
  });

  it('PreToolUse → completa sin excepción; close no llamado', () => {
    const repo = makeRepo();
    const handler = makeHandler(repo);

    expect(() =>
      handler.execute({ eventName: 'PreToolUse', sessionId: 'session-1', toolUseId: 'tu-xyz' }),
    ).not.toThrow();

    expect(repo.close).not.toHaveBeenCalled();
  });

  it('Stop con workflow activo y readyToClose:true → close y métricas de sesión', async () => {
    const readyToClose = vi.fn().mockReturnValue(true);
    const close = vi.fn().mockReturnValue({
      outcome: 'success',
      stepCount: 1,
      closedByEvent: 'Stop',
      sessionId: 'session-1',
    });
    const wf = stubWorkflow();
    const getWorkflowBySessionId = vi.fn().mockReturnValue(wf);
    const getWorkflow = vi.fn().mockReturnValue(wf);
    const repo = makeRepo({ getWorkflowBySessionId, getWorkflow, readyToClose, close });
    const sessionMetrics = makeSessionMetrics();
    const handler = makeHandler(repo, sessionMetrics);

    handler.execute({
      eventName: 'Stop',
      sessionId: 'session-1',
      stopHookActive: false,
      backgroundTasks: 0,
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(readyToClose).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ eventName: 'Stop' }),
    );
    expect(close).toHaveBeenCalledWith('session-1', expect.objectContaining({ eventName: 'Stop' }));
    expect(sessionMetrics.finalizeWorkflowMetrics).toHaveBeenCalled();
  });

  it('Stop con stopHookActive:true → readyToClose:false, close no invocado', () => {
    const readyToClose = vi.fn().mockReturnValue(false);
    const close = vi.fn();
    const getWorkflowBySessionId = vi.fn().mockReturnValue(stubWorkflow());
    const repo = makeRepo({ getWorkflowBySessionId, readyToClose, close });
    const handler = makeHandler(repo);

    handler.execute({ eventName: 'Stop', sessionId: 'session-1', stopHookActive: true });

    expect(readyToClose).toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('Stop sin workflow en repo → no lanza excepción, close no invocado', () => {
    const close = vi.fn();
    const getWorkflowBySessionId = vi.fn().mockReturnValue(undefined);
    const repo = makeRepo({ getWorkflowBySessionId, close });
    const handler = makeHandler(repo);

    expect(() => handler.execute({ eventName: 'Stop', sessionId: 'session-1' })).not.toThrow();

    expect(close).not.toHaveBeenCalled();
  });

  it('StopFailure → close directo sin readyToClose', async () => {
    const readyToClose = vi.fn();
    const close = vi.fn().mockReturnValue({
      outcome: 'api_error',
      stepCount: 0,
      closedByEvent: 'StopFailure',
      sessionId: 'session-1',
    });
    const wf = stubWorkflow();
    const getWorkflowBySessionId = vi.fn().mockReturnValue(wf);
    const getWorkflow = vi.fn().mockReturnValue(wf);
    const repo = makeRepo({ getWorkflowBySessionId, getWorkflow, readyToClose, close });
    const sessionMetrics = makeSessionMetrics();
    const handler = makeHandler(repo, sessionMetrics);

    handler.execute({ eventName: 'StopFailure', sessionId: 'session-1' });

    await new Promise((r) => setTimeout(r, 50));

    expect(readyToClose).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ eventName: 'StopFailure' }),
    );
    expect(sessionMetrics.finalizeWorkflowMetrics).toHaveBeenCalled();
  });

  it('UserPromptSubmit → NO crea workflow (lo crea ensureTurnWorkflow con la request real)', () => {
    const openWorkflow = vi.fn();
    const repo = makeRepo({ openWorkflow });
    const handler = makeHandler(repo);

    handler.execute({
      eventName: 'UserPromptSubmit',
      sessionId: 'session-1',
      agentId: 'agent-root',
    });

    expect(openWorkflow).not.toHaveBeenCalled();
  });

  it('PostToolUse con autoridad hook → completeToolUse con isError false', () => {
    const wf = stubWorkflow();
    const completeToolUse = vi.fn();
    const findWorkflowByToolUseId = vi.fn().mockReturnValue(wf);
    const getToolCompletionAuthority = vi.fn().mockReturnValue('hook');
    const repo = makeRepo({ findWorkflowByToolUseId, getToolCompletionAuthority, completeToolUse });
    const handler = makeHandler(repo);

    handler.execute({
      eventName: 'PostToolUse',
      sessionId: 'session-1',
      toolUseId: 'tu-1',
      lastAssistantMessage: 'ok',
    });

    expect(completeToolUse).toHaveBeenCalledWith('session-1', 'tu-1', {
      isError: false,
      result: 'ok',
    });
  });

  it('PostToolUse con autoridad continuation (Bash) → no completa', () => {
    const wf = stubWorkflow();
    const completeToolUse = vi.fn();
    const findWorkflowByToolUseId = vi.fn().mockReturnValue(wf);
    const getToolCompletionAuthority = vi.fn().mockReturnValue('continuation');
    const repo = makeRepo({ findWorkflowByToolUseId, getToolCompletionAuthority, completeToolUse });
    const handler = makeHandler(repo);

    handler.execute({
      eventName: 'PostToolUse',
      sessionId: 'session-1',
      toolUseId: 'tu-bash',
    });

    expect(completeToolUse).not.toHaveBeenCalled();
  });

  it('PostToolUseFailure con autoridad hook (WebFetch) → completeToolUse con isError true', () => {
    const wf = stubWorkflow();
    const completeToolUse = vi.fn();
    const findWorkflowWithPendingToolUse = vi
      .fn()
      .mockReturnValue({ workflow: wf, toolUse: { id: 'tu-1' } });
    const getToolCompletionAuthority = vi.fn().mockReturnValue('hook');
    const repo = makeRepo({
      findWorkflowWithPendingToolUse,
      getToolCompletionAuthority,
      completeToolUse,
    });
    const handler = makeHandler(repo);

    handler.execute({
      eventName: 'PostToolUseFailure',
      sessionId: 'session-1',
      toolUseId: 'tu-1',
      lastAssistantMessage: 'falló',
    });

    expect(completeToolUse).toHaveBeenCalledWith('session-1', 'tu-1', {
      isError: true,
      result: 'falló',
    });
  });

  it('SubagentStop con agentId conocido cierra y finaliza métricas (G16′)', async () => {
    const wf = { ...stubWorkflow('agent-child'), kind: 'subagent' as const };
    const readyToClose = vi.fn().mockReturnValue(true);
    const close = vi
      .fn()
      .mockReturnValue({ outcome: 'success', stepCount: 1, sessionId: 'session-1' });
    const getWorkflowByAgentId = vi
      .fn()
      .mockReturnValue({ sessionId: 'session-1', agentId: 'agent-child' });
    const getWorkflow = vi.fn().mockReturnValue(wf);
    const repo = makeRepo({ getWorkflowByAgentId, getWorkflow, readyToClose, close });
    const sessionMetrics = makeSessionMetrics();
    const handler = makeHandler(repo, sessionMetrics);

    handler.execute({ eventName: 'SubagentStop', sessionId: 'session-1', agentId: 'agent-child' });
    await new Promise((r) => setTimeout(r, 50));

    expect(getWorkflowByAgentId).toHaveBeenCalledWith('agent-child');
    expect(getWorkflow).toHaveBeenCalledWith('agent-child');
    expect(close).toHaveBeenCalledWith(
      'agent-child',
      expect.objectContaining({ eventName: 'SubagentStop' }),
    );
    expect(sessionMetrics.finalizeWorkflowMetrics).toHaveBeenCalled();
  });

  it('SubagentStop con agentId desconocido no lanza excepción y no invoca close', async () => {
    const close = vi.fn();
    const getWorkflowByAgentId = vi.fn().mockReturnValue(undefined);
    const repo = makeRepo({ getWorkflowByAgentId, close });
    const handler = makeHandler(repo);

    expect(() =>
      handler.execute({
        eventName: 'SubagentStop',
        sessionId: 'session-1',
        agentId: 'agent-unknown',
      }),
    ).not.toThrow();

    await new Promise((r) => setTimeout(r, 50));
    expect(close).not.toHaveBeenCalled();
  });

  it('Stop con notifier inyectado → notify llamado con title Stop y message no vacío', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const notifier = { notify };
    const tts = { speak: vi.fn().mockResolvedValue(undefined), initialize: vi.fn() };
    const wf = stubWorkflow();
    const getWorkflowBySessionId = vi.fn().mockReturnValue(wf);
    const readyToClose = vi.fn().mockReturnValue(false);
    const repo = makeRepo({ getWorkflowBySessionId, readyToClose });
    const handler = new AuditHookEventHandler(
      repo,
      '/tmp/sessions',
      makeSessionMetrics(),
      undefined,
      tts,
      undefined,
      3,
      notifier,
    );
    handler.execute({
      eventName: 'Stop',
      sessionId: 'session-1',
      transcriptPath: '/tmp/fake-transcript.jsonl',
    });
    await new Promise((r) => setTimeout(r, 100));

    expect(notify).toHaveBeenCalledOnce();
    const call = notify.mock.calls[0][0] as { title: string; message: string };
    expect(call.title).toBe('Stop');
    expect(call.message.length).toBeGreaterThan(0);
  });

  it('Stop no lanza si notifier.notify rechaza y TTS sigue invocándose', async () => {
    const notify = vi.fn().mockRejectedValue(new Error('toast fail'));
    const notifier = { notify };
    const speak = vi.fn().mockResolvedValue(undefined);
    const tts = { speak, initialize: vi.fn() };
    const wf = stubWorkflow();
    const getWorkflowBySessionId = vi.fn().mockReturnValue(wf);
    const readyToClose = vi.fn().mockReturnValue(false);
    const repo = makeRepo({ getWorkflowBySessionId, readyToClose });
    const handler = new AuditHookEventHandler(
      repo,
      '/tmp/sessions',
      makeSessionMetrics(),
      undefined,
      tts,
      undefined,
      3,
      notifier,
    );

    handler.execute({ eventName: 'Stop', sessionId: 'session-1' });
    await new Promise((r) => setTimeout(r, 100));

    expect(speak).toHaveBeenCalledOnce();
  });
});

describe('AuditHookEventHandler UserPromptSubmit con TTS', () => {
  it('UserPromptSubmit con transcript previo envía al LLM la tríada user/assistant/user', async () => {
    // Mockear fetch global para capturar la petición a OpenRouter
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'Voy a refactorizar' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const speak = vi.fn().mockResolvedValue(undefined);
    const tts = { speak, initialize: vi.fn() };
    const extractUserPromptSubmitContext = vi.fn().mockResolvedValue({
      previousUserMessage: 'petición anterior del usuario',
      lastAssistantResponse: 'respuesta del turno previo',
      currentPrompt: 'prompt actual',
    });
    const contextExtractor = { extractUserPromptSubmitContext, extractLastNMessages: vi.fn() };
    const repo = makeRepo();
    const handler = new AuditHookEventHandler(
      repo,
      '/tmp/sessions',
      makeSessionMetrics(),
      undefined,
      tts,
      contextExtractor,
      3,
      undefined,
      undefined,
      'fake-openrouter-key',
    );

    handler.execute({
      eventName: 'UserPromptSubmit',
      sessionId: 'session-1',
      agentId: 'agent-root',
      transcriptPath: '/tmp/transcript.jsonl',
      prompt: 'prompt actual',
    });

    await new Promise((r) => setTimeout(r, 100));

    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toEqual([
      { role: 'user', content: 'petición anterior del usuario' },
      { role: 'assistant', content: 'respuesta del turno previo' },
      { role: 'user', content: 'prompt actual' },
    ]);
    expect(body.system).toContain('Responde SOLO a la nueva petición');
    expect(body.model).toBe('poolside/laguna-xs.2:free');
    expect(speak).toHaveBeenCalledWith('Voy a refactorizar');

    vi.unstubAllGlobals();
  });

  it('UserPromptSubmit sin contexto previo envía al LLM solo el prompt actual', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'Entendido, voy a investigar' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const speak = vi.fn().mockResolvedValue(undefined);
    const tts = { speak, initialize: vi.fn() };
    const extractUserPromptSubmitContext = vi.fn().mockResolvedValue({
      previousUserMessage: undefined,
      lastAssistantResponse: undefined,
      currentPrompt: 'primer mensaje',
    });
    const contextExtractor = { extractUserPromptSubmitContext, extractLastNMessages: vi.fn() };
    const repo = makeRepo();
    const handler = new AuditHookEventHandler(
      repo,
      '/tmp/sessions',
      makeSessionMetrics(),
      undefined,
      tts,
      contextExtractor,
      3,
      undefined,
      undefined,
      'fake-openrouter-key',
    );

    handler.execute({
      eventName: 'UserPromptSubmit',
      sessionId: 'session-1',
      agentId: 'agent-root',
      transcriptPath: '/tmp/transcript.jsonl',
      prompt: 'primer mensaje',
    });

    await new Promise((r) => setTimeout(r, 100));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toEqual([{ role: 'user', content: 'primer mensaje' }]);
    expect(body.system).toContain('Responde SOLO a la nueva petición');
    expect(speak).toHaveBeenCalledWith('Entendido, voy a investigar');

    vi.unstubAllGlobals();
  });

  it('UserPromptSubmit sin clave OpenRouter reproduce fallback sin llamar a fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const speak = vi.fn().mockResolvedValue(undefined);
    const tts = { speak, initialize: vi.fn() };
    const contextExtractor = {
      extractUserPromptSubmitContext: vi.fn(),
      extractLastNMessages: vi.fn(),
    };
    const repo = makeRepo();
    const handler = new AuditHookEventHandler(
      repo,
      '/tmp/sessions',
      makeSessionMetrics(),
      undefined,
      tts,
      contextExtractor,
      3,
      undefined,
      undefined,
      undefined, // sin API key
    );

    handler.execute({
      eventName: 'UserPromptSubmit',
      sessionId: 'session-1',
      agentId: 'agent-root',
      prompt: 'hola',
    });

    await new Promise((r) => setTimeout(r, 100));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(speak).toHaveBeenCalledWith('Solicitud recibida. Procesando con Claude.');

    vi.unstubAllGlobals();
  });
});
