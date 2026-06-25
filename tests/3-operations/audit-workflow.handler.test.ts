import { describe, it, expect, vi } from 'vitest';
import { AuditHookEventHandler } from '../../src/3-operations/audit-hook-event.handler.js';
import { AuditWorkflowHandler } from '../../src/3-operations/audit-workflow.handler.js';
import type { SessionMetricsService } from '../../src/2-services/session-metrics.service.js';
import { SessionResolverService } from '../../src/1-domain/services/session-resolver.service.js';
import { WorkflowRepositoryService } from '../../src/2-services/workflow-repository.service.js';
import type { IEventBus } from '../../src/1-domain/repositories/IEventBus.js';
import type { IToolUse } from '../../src/1-domain/interfaces/gateway/IToolUse.js';
import type { IWorkflow } from '../../src/1-domain/interfaces/gateway/IWorkflow.js';
import type { TelemetryEvent } from '../../src/1-domain/types/telemetry.types.js';
import type { AgentContext, ParentContext } from '../../src/1-domain/types/audit.types.js';
import { makeTestConfig as makeConfig } from '../helpers/test-config.js';

const AUDIT_BASE = '/tmp/sessions';

class TestEventBus implements IEventBus {
  public readonly events: TelemetryEvent[] = [];
  publish(event: TelemetryEvent): void {
    this.events.push(event);
  }
  subscribe(): { id: string; pattern: string } {
    return { id: 'sub-1', pattern: '*' };
  }
  unsubscribe(): void {
    /* no-op */
  }
}

function createTestStack(
  init?: (repo: WorkflowRepositoryService) => void,
  logger?: import('../../src/1-domain/types/logger.types.js').Logger,
) {
  const eventBus = new TestEventBus();
  const workflowRepo = new WorkflowRepositoryService(eventBus);
  init?.(workflowRepo);
  const config = makeConfig();
  const handler = new AuditWorkflowHandler(
    new SessionResolverService(),
    AUDIT_BASE,
    workflowRepo,
    eventBus,
    config,
    logger,
  );
  return { handler, workflowRepo, eventBus, config };
}

function seedParentWithAgentPending(
  repo: WorkflowRepositoryService,
  sessionId: string,
  toolUseId: string,
  parentStepIndex = 1,
  subagentType?: string,
): { workflow: IWorkflow; parentDir: string } {
  const wf = repo.openWorkflow(
    sessionId,
    { isSubagentRequest: false, agentId: undefined },
    { forceNew: true, layoutIndex: 1, workflowKind: 'agentic' },
  );
  let stepId = 'step-parent-1';
  for (let i = 0; i < parentStepIndex; i++) {
    stepId = `step-parent-${i + 1}`;
    wf.steps.push({
      id: stepId,
      workflowId: wf.id,
      index: i + 1,
      inferenceRequest: { model: 'claude-3-5-sonnet', messages: [], max_tokens: 4096 },
      assistantMessage: { role: 'assistant', content: [] },
      toolUses: [],
      startedAt: new Date(),
    });
  }
  repo.patchWireMeta(wf.id, {
    layoutIndex: 1,
    requestSequence: 1,
    requestBodyOmitted: false,
    requestBodyBytes: 100,
    workflowKind: 'agentic',
  });
  const toolUse: IToolUse = {
    id: toolUseId,
    stepId,
    name: 'Agent',
    arguments: subagentType ? { subagent_type: subagentType } : {},
    status: 'running',
    toolUseBlock: {
      type: 'tool_use',
      id: toolUseId,
      name: 'Agent',
      input: subagentType ? { subagent_type: subagentType } : {},
    } as never,
  };
  repo.registerPendingToolUse(wf.id, stepId, toolUse);
  return { workflow: wf, parentDir: `${AUDIT_BASE}/${sessionId}/workflows/01` };
}

function makeSessionMetrics(): SessionMetricsService {
  return {
    updateFromStep: vi.fn().mockResolvedValue(undefined),
    finalizeWorkflowMetrics: vi.fn().mockResolvedValue(undefined),
  } as unknown as SessionMetricsService;
}

function seedClientSideTool(
  repo: WorkflowRepositoryService,
  sessionId: string,
  toolUseId: string,
  toolName: string,
): IWorkflow {
  const wf = repo.openWorkflow(
    sessionId,
    { isSubagentRequest: false, agentId: undefined },
    { forceNew: true, layoutIndex: 1, workflowKind: 'agentic' },
  );
  const stepId = 'step-parent-1';
  wf.steps.push({
    id: stepId,
    workflowId: wf.id,
    index: 1,
    inferenceRequest: { model: 'claude-3-5-sonnet', messages: [], max_tokens: 4096 },
    assistantMessage: { role: 'assistant', content: [] },
    toolUses: [],
    startedAt: new Date(),
  });
  repo.patchWireMeta(wf.id, {
    layoutIndex: 1,
    requestSequence: 1,
    requestBodyOmitted: false,
    requestBodyBytes: 100,
    workflowKind: 'agentic',
  });
  repo.registerToolUse(wf.id, {
    id: toolUseId,
    stepId,
    name: toolName,
    arguments: {},
    status: 'running',
    toolUseBlock: { type: 'tool_use', id: toolUseId, name: toolName, input: {} } as never,
  });
  return wf;
}

function continuationBody(toolUseId: string, content: string, isError = false): Buffer {
  return Buffer.from(
    JSON.stringify({
      model: 'claude-3-5-sonnet',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUseId,
              content,
              ...(isError ? { is_error: true } : {}),
            },
          ],
        },
      ],
      max_tokens: 4096,
    }),
  );
}

function lastSubWorkflowMeta(repo: WorkflowRepositoryService): ParentContext | undefined {
  const sub = repo.getAllRunningWorkflows().find((w) => w.kind === 'subagent');
  return sub ? repo.getWireMeta(sub.id)?.parentContext : undefined;
}

// Body con tools = fresh
const FRESH_BODY = Buffer.from(
  JSON.stringify({
    model: 'claude-3-5-sonnet',
    messages: [{ role: 'user', content: 'hola' }],
    tools: [{ name: 'Read', description: 'lee', input_schema: { type: 'object', properties: {} } }],
    max_tokens: 4096,
  }),
);

const CONTINUATION_BODY = Buffer.from(
  JSON.stringify({
    messages: [
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool-x', content: 'ok' }] },
    ],
    max_tokens: 4096,
  }),
);

const QUOTA_BODY = Buffer.from(
  '{"model":"claude","messages":[{"role":"user","content":"quota"}],"max_tokens":1}',
);

const SIDE_REQUEST_BODY = Buffer.from(
  JSON.stringify({
    model: 'claude-3-5-sonnet',
    messages: [{ role: 'user', content: 'titulo' }],
    tools: [],
    max_tokens: 256,
  }),
);

describe('AuditWorkflowHandler', () => {
  it('debería clasificar fresh: abrir workflow y registrar step', async () => {
    const { handler, workflowRepo, eventBus } = createTestStack();
    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 'my-session' },
      rawBody: FRESH_BODY,
      requestId: 'req-1',
    });
    expect(result).not.toBeNull();
    expect(result!.workflowKind).toBe('agentic');
    expect(result!.requestClassification).toEqual({ type: 'fresh' });
    expect(result!.auditWorkflowDir).toContain('workflows');
    expect(result!.workflowId).toBe('my-session');
    expect(workflowRepo.getWorkflow(result!.workflowId)?.steps.length).toBe(1);
    expect(eventBus.events.some((e) => e.type === 'workflow_start')).toBe(true);
    expect(eventBus.events.some((e) => e.type === 'step_request')).toBe(true);
  });

  it('dos fresh concurrentes bajo el mismo turno comparten workflow', async () => {
    const { handler, workflowRepo } = createTestStack();
    const [r1, r2] = await Promise.all([
      handler.execute({
        headers: { 'x-cc-audit-session': 's' },
        rawBody: FRESH_BODY,
        requestId: 'req-1',
      }),
      handler.execute({
        headers: { 'x-cc-audit-session': 's' },
        rawBody: FRESH_BODY,
        requestId: 'req-2',
      }),
    ]);
    expect(r1!.workflowId).toBe(r2!.workflowId);
    expect(r1!.auditWorkflowDir).toBe(r2!.auditWorkflowDir);
    const turn = workflowRepo.getWorkflowBySessionId('s');
    expect(turn?.steps.length).toBe(2);
  });

  it('debería clasificar continuation: routear al workflow padre por tool_use_id', async () => {
    const { handler, eventBus } = createTestStack((repo) => {
      const { workflow } = seedParentWithAgentPending(repo, 'test-session', 'tool-x');
      // Consumir pending para evitar rama coalesced; el índice tool_use_id permanece.
      repo.consumePendingToolUse(workflow.id, 'tool-x');
    });
    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 'test-session' },
      rawBody: CONTINUATION_BODY,
      requestId: 'req-2',
    });
    expect(result).not.toBeNull();
    expect(result!.workflowKind).toBe('agentic');
    expect(result!.requestClassification).toEqual({ type: 'continuation' });
    expect(result!.auditWorkflowDir.replace(/\\/g, '/')).toContain('workflows/01');
    expect(eventBus.events.filter((e) => e.type === 'step_request').length).toBeGreaterThanOrEqual(
      1,
    );
  });

  // Caso genuino de orphan: el SSE del response anterior no llegó o falló (error upstream),
  // por lo que no hay tool_use_id registrado en el índice cuando llega la continuation.
  // I3: el workflow degradado queda ABIERTO (acumula sus steps) y cierra por reaper/shutdown.
  it('continuation sin tool_use_id registrado crea workflow abierto marcado continuationOrphan', async () => {
    const { handler, workflowRepo } = createTestStack();
    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 'test-session' },
      rawBody: CONTINUATION_BODY,
      requestId: 'req-1',
    });
    expect(result).not.toBeNull();
    const wf = workflowRepo.getWorkflow(result!.workflowId)!;
    expect(wf.result == null).toBe(true);
    expect(workflowRepo.getWireMeta(wf.id)?.continuationOrphan).toBe(true);

    // Si queda awaiting continuation y envejece, el reaper lo cosecha como orphaned.
    workflowRepo.patchWireMeta(wf.id, {
      awaitingContinuation: true,
      awaitingSince: Date.now() - 2 * AuditWorkflowHandler.ORPHAN_MAX_AGE_MS,
    });
    const stale = workflowRepo.findStaleWorkflowsAwaitingContinuation(
      'test-session',
      AuditWorkflowHandler.ORPHAN_MAX_AGE_MS,
    );
    expect(stale.map((w) => w.id)).toContain(wf.id);
    await handler.closeOrphanWorkflow(stale[0]);
    expect(workflowRepo.getWorkflow(wf.id)?.result?.outcome).toBe('orphaned');
  });

  it('continuation de ExitPlanMode correlaciona con el padre turn-N tras side-request', async () => {
    const sessionId = 'plan-session';
    const { handler, workflowRepo } = createTestStack((repo) => {
      // Turno N≥2 (id -turn-3) con tool cliente ExitPlanMode pendiente de continuation.
      const wf = repo.openWorkflow(
        sessionId,
        { isSubagentRequest: false, agentId: undefined },
        { layoutIndex: 3, workflowKind: 'agentic' },
      );
      const stepId = 'step-plan-1';
      wf.steps.push({
        id: stepId,
        workflowId: wf.id,
        index: 1,
        stepKind: 'agentic',
        inferenceRequest: { model: 'claude-opus', messages: [], max_tokens: 4096 },
        assistantMessage: { role: 'assistant', content: [] },
        toolUses: [],
        startedAt: new Date(),
        closedAt: new Date(),
      });
      repo.registerToolUse(wf.id, {
        id: 'tool-x',
        stepId,
        name: 'ExitPlanMode',
        arguments: {},
        status: 'running',
        toolUseBlock: { type: 'tool_use', id: 'tool-x', name: 'ExitPlanMode', input: {} } as never,
      });
      repo.patchWireMeta(wf.id, { awaitingContinuation: true, awaitingSince: Date.now() });
      // Side-request (haiku) ya cerrado con end_turn en el mismo workflow.
      wf.steps.push({
        id: 'step-side',
        workflowId: wf.id,
        index: 2,
        stepKind: 'side-request',
        inferenceRequest: { model: 'claude-haiku', messages: [], max_tokens: 256 },
        assistantMessage: { role: 'assistant', content: [{ type: 'text', text: 'título' }] },
        toolUses: [],
        stopReason: 'end_turn',
        startedAt: new Date(),
        closedAt: new Date(),
      });
    });

    const result = await handler.execute({
      headers: { 'x-cc-audit-session': sessionId },
      rawBody: CONTINUATION_BODY,
      requestId: 'req-cont',
    });

    expect(result).not.toBeNull();
    expect(result!.requestClassification).toEqual({ type: 'continuation' });
    expect(result!.workflowId).toBe(`${sessionId}-turn-3`);
    // No se creó workflow huérfano wire-N.
    const wireOrphans = workflowRepo
      .getAllRunningWorkflows()
      .filter((w) => w.id.includes('-wire-'));
    expect(wireOrphans).toHaveLength(0);
    expect(workflowRepo.getWireMeta(result!.workflowId)?.awaitingContinuation).toBe(false);
  });

  // Tool client-side (Read/Edit/…): el SSE previo lo registró vía registerToolUse,
  // poblando toolUseIdToWorkflowId. La continuation con su tool_result debe enlazarse
  // como step nuevo del padre, sin orphan ni warning.
  it('continuation con tool_result client-side registrado enlaza step sin orphan ni warning', async () => {
    const warn = vi.fn();
    const logger = {
      info: vi.fn(),
      warn,
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as import('../../src/1-domain/types/logger.types.js').Logger;
    const { handler, workflowRepo, eventBus } = createTestStack((repo) => {
      const wf = repo.openWorkflow(
        'test-session',
        { isSubagentRequest: false, agentId: undefined },
        { forceNew: true, layoutIndex: 1, workflowKind: 'agentic' },
      );
      const stepId = 'step-parent-1';
      wf.steps.push({
        id: stepId,
        workflowId: wf.id,
        index: 1,
        inferenceRequest: { model: 'claude-3-5-sonnet', messages: [], max_tokens: 4096 },
        assistantMessage: { role: 'assistant', content: [] },
        toolUses: [],
        startedAt: new Date(),
      });
      repo.patchWireMeta(wf.id, {
        layoutIndex: 1,
        requestSequence: 1,
        requestBodyOmitted: false,
        requestBodyBytes: 100,
        workflowKind: 'agentic',
      });
      // Tool client-side registrado (puebla toolUseIdToWorkflowId, NO pendingToolUses).
      repo.registerToolUse(wf.id, {
        id: 'tool-x',
        stepId,
        name: 'Read',
        arguments: { file_path: 'a.ts' },
        status: 'running',
        toolUseBlock: { type: 'tool_use', id: 'tool-x', name: 'Read', input: {} } as never,
      });
    }, logger);

    const parentBefore = workflowRepo.findWorkflowByToolUseId('test-session', 'tool-x');
    expect(parentBefore).toBeDefined();
    const stepsBefore = parentBefore!.steps.length;

    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 'test-session' },
      rawBody: CONTINUATION_BODY,
      requestId: 'req-2',
    });

    expect(result).not.toBeNull();
    expect(result!.requestClassification).toEqual({ type: 'continuation' });
    // Enlazado al padre: mismo workflow, sin orphan.
    expect(result!.workflowId).toBe(parentBefore!.id);
    const wf = workflowRepo.getWorkflow(result!.workflowId);
    expect(wf?.result?.outcome).not.toBe('orphaned');
    // Step nuevo encadenado.
    expect(result!.assignedStepIndex).toBe(stepsBefore + 1);
    // Sin warning de orphan.
    expect(warn).not.toHaveBeenCalled();
    expect(eventBus.events.filter((e) => e.type === 'step_request').length).toBeGreaterThanOrEqual(
      1,
    );
    // Vía canónica: continuation completa el tool desde tool_result en body.
    const toolResults = eventBus.events.filter((e) => e.type === 'tool_result');
    expect(toolResults.length).toBeGreaterThanOrEqual(1);
    const closedTool = wf!.steps.flatMap((s) => s.toolUses).find((t) => t.id === 'tool-x');
    expect(closedTool?.status).toBe('completed');
    expect(closedTool?.result).toEqual(expect.objectContaining({ isError: false, result: 'ok' }));
  });

  it('debería ignorar preflight-quota sin proyección causal', async () => {
    const { handler, eventBus } = createTestStack();
    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 'test-session' },
      rawBody: QUOTA_BODY,
      requestId: 'req-1',
    });
    expect(result).toBeNull();
    expect(eventBus.events.some((e) => e.type === 'workflow_start')).toBe(false);
  });

  it('debería eliminar la cabecera de sesión antes de reenviar al upstream', async () => {
    const { handler } = createTestStack();
    const headers: Record<string, string | string[] | undefined> = {
      'x-cc-audit-session': 'my-session',
      'content-type': 'application/json',
    };
    await handler.execute({ headers, rawBody: FRESH_BODY, requestId: 'req-2' });
    expect(headers['x-cc-audit-session']).toBeUndefined();
    expect(headers['content-type']).toBe('application/json');
  });

  it('debería emitir step_request para fresh con stepIndex base 1', async () => {
    const { handler, eventBus } = createTestStack();
    await handler.execute({
      headers: { 'x-cc-audit-session': 'test' },
      rawBody: FRESH_BODY,
      requestId: 'req-1',
    });
    const stepReqs = eventBus.events.filter((e) => e.type === 'step_request');
    expect(stepReqs).toHaveLength(1);
    const lastStep = stepReqs[stepReqs.length - 1]!.payload as {
      stepIndex: number;
      stepKind?: string;
    };
    expect(lastStep.stepIndex).toBe(1);
    expect(lastStep.stepKind).toBe('agentic');
  });

  it('debería registrar side-request como step bajo turno agentic', async () => {
    const { handler, workflowRepo, eventBus } = createTestStack();
    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 'test' },
      rawBody: SIDE_REQUEST_BODY,
      requestId: 'req-side',
    });
    expect(result!.workflowKind).toBe('agentic');
    expect(workflowRepo.getWireMeta(result!.workflowId)?.workflowKind).toBe('agentic');
    const stepReq = eventBus.events.find((e) => e.type === 'step_request');
    expect((stepReq?.payload as { stepKind?: string }).stepKind).toBe('side-request');
  });

  it('fresh con pending Agent único → unique-pending y consume pending', async () => {
    const { handler, workflowRepo } = createTestStack((repo) => {
      seedParentWithAgentPending(repo, 's', 'toolu_unique', 2, 'general-purpose');
    });
    const result = await handler.execute({
      headers: { 'x-cc-audit-session': 's' },
      rawBody: FRESH_BODY,
      requestId: 'sub-req-1',
    });
    expect(result).not.toBeNull();
    expect(result!.auditWorkflowDir.replace(/\\/g, '/')).toMatch(/workflows\/\d{2}$/);
    const parentCtx = lastSubWorkflowMeta(workflowRepo);
    expect(parentCtx).toMatchObject({
      triggeringToolUseId: 'toolu_unique',
      subagentType: 'general-purpose',
      correlationStatus: 'resolved',
      correlationMethod: 'unique-pending',
    });
  });

  it('sin cabeceras + >1 pending → fifo-pending', async () => {
    const { handler, workflowRepo } = createTestStack((repo) => {
      const { workflow } = seedParentWithAgentPending(repo, 's', 'toolu_a', 1, 'Explore');
      const stepId = workflow.steps[0]!.id;
      const toolB: IToolUse = {
        id: 'toolu_b',
        stepId,
        name: 'Agent',
        arguments: { subagent_type: 'Plan' },
        status: 'running',
        toolUseBlock: { type: 'tool_use', id: 'toolu_b', name: 'Agent', input: {} } as never,
      };
      repo.registerPendingToolUse(workflow.id, stepId, toolB);
    });
    await handler.execute({
      headers: { 'x-cc-audit-session': 's' },
      rawBody: FRESH_BODY,
      requestId: 'sub-req-fifo',
    });
    const parentCtx = lastSubWorkflowMeta(workflowRepo);
    expect(parentCtx?.correlationMethod).toBe('fifo-pending');
    expect(parentCtx?.triggeringToolUseId).toBe('toolu_a');
  });

  it('closeOrphanInteraction invoca forceClose orphaned', async () => {
    const { handler, workflowRepo } = createTestStack((repo) => {
      const { workflow } = seedParentWithAgentPending(repo, 's', 'toolu_orphan');
      repo.patchWireMeta(workflow.id, {
        awaitingContinuation: true,
        awaitingSince: Date.now() - 120_000,
      });
    });
    const stale = workflowRepo.findStaleWorkflowsAwaitingContinuation(
      's',
      AuditWorkflowHandler.ORPHAN_MAX_AGE_MS,
    );
    expect(stale.length).toBe(1);
    await handler.closeOrphanWorkflow(stale[0]);
    expect(workflowRepo.getWorkflow(stale[0].id)?.result?.outcome).toBe('orphaned');
  });

  it('fresh cierra workflows stale awaiting de la misma sesión', async () => {
    const { handler, workflowRepo } = createTestStack((repo) => {
      const { workflow } = seedParentWithAgentPending(repo, 'test-session', 'toolu_orphan');
      repo.patchWireMeta(workflow.id, {
        awaitingContinuation: true,
        awaitingSince: Date.now() - 120_000,
      });
    });
    await handler.execute({
      headers: { 'x-cc-audit-session': 'test-session' },
      rawBody: FRESH_BODY,
      requestId: 'req-new',
    });
    const stale = workflowRepo.findStaleWorkflowsAwaitingContinuation(
      'test-session',
      AuditWorkflowHandler.ORPHAN_MAX_AGE_MS,
    );
    expect(stale.length).toBe(0);
  });

  it('fresh con cabeceras agente + pending → agent-headers y openSubagentFromWire', async () => {
    const calls: AgentContext[] = [];
    const { handler, workflowRepo } = createTestStack();
    const openWire = vi
      .spyOn(workflowRepo, 'openSubagentFromWire')
      .mockImplementation((sid, ctx) => {
        calls.push(ctx);
        return { sessionId: sid, agentId: ctx.agentId ?? '' };
      });
    seedParentWithAgentPending(workflowRepo, 's', 'toolu_abc', 1, 'Explore');
    await handler.execute({
      headers: {
        'x-cc-audit-session': 's',
        'X-Claude-Code-Agent-Id': 'agent-child',
        'X-Claude-Code-Parent-Agent-Id': 'agent-parent',
      },
      rawBody: FRESH_BODY,
      requestId: 'sub-wire-1',
    });
    expect(openWire).toHaveBeenCalled();
    expect(calls[0]?.parentAgentId).toBe('agent-parent');
    const parentCtx = lastSubWorkflowMeta(workflowRepo);
    expect(parentCtx?.correlationMethod).toBe('agent-headers');
    expect(parentCtx?.wireAgentId).toBe('agent-child');
  });

  it('retorna null para sesión _unknown', async () => {
    const { handler } = createTestStack();
    const result = await handler.execute({
      headers: {},
      rawBody: FRESH_BODY,
      requestId: 'req-unknown',
    });
    expect(result).toBeNull();
  });

  it('carrera: PostToolUse ignorado + continuation Bash → un solo tool_result con stdout real', async () => {
    const sessionId = 'race-session';
    const toolUseId = 'tool-bash-race';
    const { handler, workflowRepo, eventBus } = createTestStack((repo) => {
      seedClientSideTool(repo, sessionId, toolUseId, 'Bash');
    });

    const hookHandler = new AuditHookEventHandler(workflowRepo, AUDIT_BASE, makeSessionMetrics());
    hookHandler.execute({
      eventName: 'PostToolUse',
      sessionId,
      toolUseId,
    });

    const wfBefore = workflowRepo.getWorkflowBySessionId(sessionId)!;
    const toolBefore = wfBefore.steps.flatMap((s) => s.toolUses).find((t) => t.id === toolUseId);
    expect(toolBefore?.status).toBe('running');
    expect(eventBus.events.filter((e) => e.type === 'tool_result')).toHaveLength(0);

    await handler.execute({
      headers: { 'x-cc-audit-session': sessionId },
      rawBody: continuationBody(toolUseId, 'stdout real del harness'),
      requestId: 'req-race',
    });

    const toolResults = eventBus.events.filter((e) => e.type === 'tool_result');
    expect(toolResults).toHaveLength(1);
    expect((toolResults[0].payload as { result: { result: string } }).result).toEqual({
      isError: false,
      result: 'stdout real del harness',
    });
    const toolAfter = workflowRepo
      .getWorkflow(wfBefore.id)!
      .steps.flatMap((s) => s.toolUses)
      .find((t) => t.id === toolUseId);
    expect(toolAfter?.status).toBe('completed');
    expect(toolAfter?.result?.result).toBe('stdout real del harness');
  });
});

describe('fixture golden sesión 8c440211 — Bash continuation', () => {
  const GOLDEN_CASES = [
    {
      toolUseId: 'call_13b871734f694ea9a07ef3f5',
      content:
        'commit 0585d9196ecbb73ef4dcdc5d17f70b37dcfce9a7\nAuthor: Example User <user@example.com>\nDate',
      isError: false,
    },
    {
      toolUseId: 'call_1a6edc0673034ef08fef6277',
      content: 'Exit code 128\nfatal: unrecognized argument: --no-stat',
      isError: true,
    },
    {
      toolUseId: 'call_f106cf20b4fc476c8bfb6bc1',
      content:
        'refactor(session-metrics)!: alinear Tabla 2 con ejecuciones agénticas\n\nPropósito\nLa Tabla 2 del statusline debía refleja',
      isError: false,
    },
  ] as const;

  for (const tc of GOLDEN_CASES) {
    it(`continuation ${tc.toolUseId} → result.json con contenido real (no null ni PostToolUseFailure)`, async () => {
      const sessionId = `golden-${tc.toolUseId}`;
      const { handler, workflowRepo, eventBus } = createTestStack((repo) => {
        seedClientSideTool(repo, sessionId, tc.toolUseId, 'Bash');
      });

      const hookHandler = new AuditHookEventHandler(workflowRepo, AUDIT_BASE, makeSessionMetrics());
      hookHandler.execute({
        eventName: tc.isError ? 'PostToolUseFailure' : 'PostToolUse',
        sessionId,
        toolUseId: tc.toolUseId,
      });
      expect(eventBus.events.filter((e) => e.type === 'tool_result')).toHaveLength(0);

      await handler.execute({
        headers: { 'x-cc-audit-session': sessionId },
        rawBody: continuationBody(tc.toolUseId, tc.content, tc.isError),
        requestId: `req-${tc.toolUseId}`,
      });

      const tool = workflowRepo
        .getWorkflowBySessionId(sessionId)!
        .steps.flatMap((s) => s.toolUses)
        .find((t) => t.id === tc.toolUseId);
      expect(tool?.result?.result).toBe(tc.content);
      expect(tool?.result?.isError).toBe(tc.isError);
      expect(tool?.result?.result).not.toBeNull();
      if (tc.isError) {
        expect(tool?.result?.result).not.toEqual({ error: 'PostToolUseFailure' });
      }
      expect(eventBus.events.filter((e) => e.type === 'tool_result')).toHaveLength(1);
    });
  }
});
