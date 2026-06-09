import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { EventBus } from '../../src/2-services/event-bus.service.js';
import { SessionPersistence } from '../../src/2-services/session-persistence.service.js';
import type { TelemetryEvent } from '../../src/1-domain/types/telemetry.types.js';
import type { ISseReconstructor } from '../../src/2-services/ports/sse-reconstructor.port.js';
import type { SsePhase } from '../../src/1-domain/types/audit.types.js';
import { MarkdownRendererService } from '../../src/1-domain/services/markdown-renderer.service.js';

let rootDir: string;
let bus: EventBus;
let persistence: SessionPersistence;

beforeEach(async () => {
  rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scp-persist-'));
  bus = new EventBus();
  persistence = new SessionPersistence(bus, { rootDir });
});

afterEach(async () => {
  await fs.rm(rootDir, { recursive: true, force: true });
});

function emit(type: string, sessionId: string, payload: unknown): void {
  const event: TelemetryEvent = { type, sessionId, timestamp: '2026-05-30T00:00:00.000Z', payload };
  bus.publish(event);
}

async function readJson(rel: string): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(path.join(rootDir, rel), 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

async function exists(rel: string): Promise<boolean> {
  try {
    await fs.access(path.join(rootDir, rel));
    return true;
  } catch {
    return false;
  }
}

describe('SessionPersistence', () => {
  it('workflow_start con session-shell persiste interactionType session-shell', async () => {
    emit('workflow_start', 'sess-1', {
      workflowId: 'sess-1',
      kind: 'main',
      workflowKind: 'session-shell',
    });
    await persistence.flush();
    const meta = await readJson('sessions/sess-1/workflows/00/meta.json');
    expect(meta.interactionType).toBe('session-shell');
    expect(meta.workflowKind).toBe('main');
  });

  it('workflow_start crea directorio y meta.json inicial', async () => {
    emit('workflow_start', 'sess-1', { workflowId: 'wf-1', kind: 'main' });
    await persistence.flush();
    const meta = await readJson('sessions/sess-1/workflows/00/meta.json');
    expect(meta.status).toBe('running');
    expect(meta.workflowKind).toBe('main');
    expect(meta.layoutVersion).toBe('causal-workflows-v1');
  });

  it('workflow_start con request escribe request/body.json', async () => {
    emit('workflow_start', 'sess-1', {
      workflowId: 'wf-1',
      kind: 'main',
      request: { model: 'claude-sonnet-4-6', messages: [] },
    });
    await persistence.flush();
    const body = await readJson('sessions/sess-1/workflows/00/request/body.json');
    expect(body.model).toBe('claude-sonnet-4-6');
  });

  it('step_request crea directorio y request/body.json', async () => {
    emit('workflow_start', 'sess-1', { workflowId: 'wf-1', kind: 'main' });
    emit('step_request', 'sess-1', {
      workflowId: 'wf-1',
      stepIndex: 0,
      request: { model: 'claude-sonnet-4-6', messages: [] },
    });
    await persistence.flush();
    const body = await readJson('sessions/sess-1/workflows/00/steps/00/request/body.json');
    expect(body.model).toBe('claude-sonnet-4-6');
  });

  it('step_response escribe contenido de respuesta según campos presentes', async () => {
    emit('workflow_start', 'sess-1', { workflowId: 'wf-1', kind: 'main' });
    emit('step_response', 'sess-1', {
      workflowId: 'wf-1',
      stepIndex: 0,
      response: { body: { ok: true } },
      headers: { 'content-type': 'application/json' },
      markdown: '# respuesta',
    });
    await persistence.flush();
    expect(await exists('sessions/sess-1/workflows/00/steps/00/response/body.json')).toBe(true);
    expect(await exists('sessions/sess-1/workflows/00/steps/00/response/headers.json')).toBe(true);
    const md = await fs.readFile(
      path.join(rootDir, 'sessions/sess-1/workflows/00/steps/00/response/parsed.md'),
      'utf8',
    );
    expect(md).toContain('# respuesta');
  });

  it('tool_call crea directorio con slug y archivos input/meta', async () => {
    emit('workflow_start', 'sess-1', { workflowId: 'wf-1', kind: 'main' });
    emit('tool_call', 'sess-1', {
      workflowId: 'wf-1',
      stepIndex: 0,
      toolUseId: 'tu-1',
      toolName: 'Read',
      input: { file_path: '/tmp/a.ts' },
    });
    await persistence.flush();
    const dir = 'sessions/sess-1/workflows/00/steps/00/tools/00-Read';
    const input = await readJson(`${dir}/input.json`);
    expect(input.file_path).toBe('/tmp/a.ts');
    const meta = await readJson(`${dir}/meta.json`);
    expect(meta.toolUseId).toBe('tu-1');
    expect(meta.toolName).toBe('Read');
    expect(meta.status).toBe('running');
  });

  it('tool_result escribe result.json y actualiza meta.json a completed', async () => {
    emit('workflow_start', 'sess-1', { workflowId: 'wf-1', kind: 'main' });
    emit('tool_call', 'sess-1', {
      workflowId: 'wf-1',
      stepIndex: 0,
      toolUseId: 'tu-1',
      toolName: 'Read',
      input: {},
    });
    emit('tool_result', 'sess-1', {
      workflowId: 'wf-1',
      toolUseId: 'tu-1',
      result: { isError: false, result: 'contenido' },
    });
    await persistence.flush();
    const dir = 'sessions/sess-1/workflows/00/steps/00/tools/00-Read';
    const result = await readJson(`${dir}/result.json`);
    expect(result.result).toBe('contenido');
    const meta = await readJson(`${dir}/meta.json`);
    expect(meta.status).toBe('completed');
  });

  it('workflow_complete escribe output/result.json y actualiza meta.json', async () => {
    emit('workflow_start', 'sess-1', { workflowId: 'wf-1', kind: 'main' });
    emit('workflow_complete', 'sess-1', {
      workflowId: 'wf-1',
      result: { outcome: 'success', finalText: 'Listo', stepCount: 1 },
    });
    await persistence.flush();
    const meta = await readJson('sessions/sess-1/workflows/00/meta.json');
    expect(meta.status).toBe('completed');
    expect(meta.completedAt).toBeDefined();
    const result = await readJson('sessions/sess-1/workflows/00/output/result.json');
    expect(result.outcome).toBe('success');
    expect(await exists('sessions/sess-1/workflows/00/output/result.parsed.md')).toBe(true);
  });

  it('workflow_cancel actualiza meta.json con status cancelled', async () => {
    emit('workflow_start', 'sess-1', { workflowId: 'wf-1', kind: 'main' });
    emit('workflow_cancel', 'sess-1', { workflowId: 'wf-1', cancellationReason: 'user_abort' });
    await persistence.flush();
    const meta = await readJson('sessions/sess-1/workflows/00/meta.json');
    expect(meta.status).toBe('cancelled');
    expect(meta.cancellationReason).toBe('user_abort');
  });

  it('step sin tools no crea directorio tools/', async () => {
    emit('workflow_start', 'sess-1', { workflowId: 'wf-1', kind: 'main' });
    emit('step_request', 'sess-1', {
      workflowId: 'wf-1',
      stepIndex: 0,
      request: { model: 'm', messages: [] },
    });
    await persistence.flush();
    expect(await exists('sessions/sess-1/workflows/00/steps/00/request')).toBe(true);
    expect(await exists('sessions/sess-1/workflows/00/steps/00/tools')).toBe(false);
  });

  it('sub-agente se anida bajo el tool invocador', async () => {
    emit('workflow_start', 'sess-1', { workflowId: 'wf-main', kind: 'main' });
    emit('tool_call', 'sess-1', {
      workflowId: 'wf-main',
      stepIndex: 0,
      toolUseId: 'tu-task',
      toolName: 'Task',
      input: {},
    });
    emit('workflow_spawn', 'sess-1', {
      workflowId: 'wf-sub',
      parentWorkflowId: 'wf-main',
      parentToolUseId: 'tu-task',
    });
    await persistence.flush();
    const meta = await readJson(
      'sessions/sess-1/workflows/00/steps/00/tools/00-Task/sub-agent/workflow/meta.json',
    );
    expect(meta.workflowKind).toBe('subagent');
  });
});

// ── P2-b: stream_chunk → streaming/NNNN-chunk.ndjson ─────────────────────────

describe('SessionPersistence — P2-b stream_chunk', () => {
  it('§37b #13: ping no genera archivo en streaming/', async () => {
    emit('workflow_start', 'sess-1', { workflowId: 'wf-1', kind: 'main' });
    emit('stream_chunk', 'sess-1', {
      seq: 1,
      stepIndex: 0,
      workflowId: 'wf-1',
      chunk: {
        i: 1,
        ts: '2026-01-01T00:00:00Z',
        line: 'data: {"type":"ping"}',
        phase: 'delegation',
      },
    });
    await persistence.flush();
    expect(await exists('sessions/sess-1/workflows/00/steps/00/response/streaming')).toBe(false);
  });

  it('línea SSE real se persiste como NNNN-chunk.ndjson', async () => {
    emit('workflow_start', 'sess-1', { workflowId: 'wf-1', kind: 'main' });
    emit('stream_chunk', 'sess-1', {
      seq: 1,
      stepIndex: 0,
      workflowId: 'wf-1',
      chunk: {
        i: 1,
        ts: '2026-01-01T00:00:00Z',
        line: 'data: {"type":"message_start"}',
        phase: 'delegation',
      },
    });
    await persistence.flush();
    const chunkPath = 'sessions/sess-1/workflows/00/steps/00/response/streaming/0001-chunk.ndjson';
    expect(await exists(chunkPath)).toBe(true);
    const raw = await fs.readFile(path.join(rootDir, chunkPath), 'utf8');
    const parsed = JSON.parse(raw.trim()) as Record<string, unknown>;
    expect(parsed.line).toBe('data: {"type":"message_start"}');
    expect(parsed.phase).toBe('delegation');
  });

  it('tope MAX_STREAMING_CHUNKS: seq 10001 no genera archivo', async () => {
    emit('workflow_start', 'sess-1', { workflowId: 'wf-1', kind: 'main' });
    emit('stream_chunk', 'sess-1', {
      seq: 10001,
      stepIndex: 0,
      workflowId: 'wf-1',
      chunk: {
        i: 10001,
        ts: '2026-01-01T00:00:00Z',
        line: 'data: {"type":"content_block_delta"}',
        phase: 'delegation',
      },
    });
    await persistence.flush();
    expect(await exists('sessions/sess-1/workflows/00/steps/00/response/streaming')).toBe(false);
  });
});

// ── P2-d: events.ndjson ───────────────────────────────────────────────────────

describe('SessionPersistence — P2-d events.ndjson', () => {
  it('§37b #1: workflow_start aparece como línea en events.ndjson', async () => {
    emit('workflow_start', 'sess-1', { workflowId: 'wf-1', kind: 'main' });
    await persistence.flush();
    const raw = await fs.readFile(path.join(rootDir, 'sessions/sess-1/events.ndjson'), 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const first = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(first.type).toBe('workflow_start');
    expect(first.sessionId).toBe('sess-1');
  });

  it('múltiples eventos se acumulan como líneas separadas', async () => {
    emit('workflow_start', 'sess-1', { workflowId: 'wf-1', kind: 'main' });
    emit('workflow_complete', 'sess-1', {
      workflowId: 'wf-1',
      result: { outcome: 'success' },
    });
    await persistence.flush();
    const raw = await fs.readFile(path.join(rootDir, 'sessions/sess-1/events.ndjson'), 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const types = lines.map((l) => (JSON.parse(l) as Record<string, unknown>).type);
    expect(types).toContain('workflow_start');
    expect(types).toContain('workflow_complete');
  });
});

// ── P2-e: workflow-sequence.json ──────────────────────────────────────────────

describe('SessionPersistence — P2-e workflow-sequence.json', () => {
  it('workflow_start crea entrada running en workflow-sequence.json', async () => {
    emit('workflow_start', 'sess-1', { workflowId: 'wf-1', kind: 'main' });
    await persistence.flush();
    const seq = (await readJson(
      'sessions/sess-1/workflows/workflow-sequence.json',
    )) as unknown as Array<Record<string, unknown>>;
    expect(Array.isArray(seq)).toBe(true);
    expect(seq[0].workflowId).toBe('wf-1');
    expect(seq[0].status).toBe('running');
  });

  it('§37b #15: workflow_complete actualiza status a completed', async () => {
    emit('workflow_start', 'sess-1', { workflowId: 'wf-1', kind: 'main' });
    emit('workflow_complete', 'sess-1', {
      workflowId: 'wf-1',
      result: { outcome: 'success' },
    });
    await persistence.flush();
    const seq = (await readJson(
      'sessions/sess-1/workflows/workflow-sequence.json',
    )) as unknown as Array<Record<string, unknown>>;
    expect(seq[0].status).toBe('completed');
    expect(seq[0].completedAt).toBeDefined();
  });

  it('subagente no aparece en workflow-sequence.json', async () => {
    emit('workflow_start', 'sess-1', { workflowId: 'wf-main', kind: 'main' });
    emit('workflow_spawn', 'sess-1', {
      workflowId: 'wf-sub',
      parentWorkflowId: 'wf-main',
      parentToolUseId: 'tu-1',
    });
    await persistence.flush();
    const seq = (await readJson(
      'sessions/sess-1/workflows/workflow-sequence.json',
    )) as unknown as Array<Record<string, unknown>>;
    expect(seq.every((e) => e.workflowId !== 'wf-sub')).toBe(true);
  });
});

// ── P2-g: vistas coalesced ────────────────────────────────────────────────────

function makeAnthropicMessage(id: string, stopReason: string) {
  return {
    id,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'test' }],
    model: 'claude',
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 5, output_tokens: 3 },
  };
}

describe('SessionPersistence — P2-g vistas coalesced', () => {
  it('§37b #18: step_response con coalescedDelegationStepIndex genera body.coalesced.json y no hay sse.jsonl', async () => {
    const delegMsg = makeAnthropicMessage('msg_deleg', 'tool_use');
    const contMsg = makeAnthropicMessage('msg_cont', 'end_turn');

    const mockReconstruct: ISseReconstructor = {
      reconstructStepMessage: vi.fn(),
      reconstructSseJsonlFile: vi.fn(),
      reconstructSseJsonlPhaseMessage: vi.fn(),
      reconstructStepPhaseMessage: vi
        .fn()
        .mockImplementation((_stepDir: string, phase: SsePhase) =>
          Promise.resolve(phase === 'delegation' ? delegMsg : contMsg),
        ),
      runReconstruction: vi.fn(),
    };

    const persistenceWithCoalesced = new SessionPersistence(bus, {
      rootDir,
      sseReconstruct: mockReconstruct,
      markdownRenderer: new MarkdownRendererService(),
    });

    emit('workflow_start', 'sess-1', { workflowId: 'wf-1', kind: 'main' });
    // Delegation step (index 0): step_response sin coalescedDelegationStepIndex
    bus.publish({
      type: 'step_response',
      sessionId: 'sess-1',
      timestamp: '2026-01-01T00:00:00Z',
      payload: {
        workflowId: 'wf-1',
        stepIndex: 0,
        response: delegMsg,
      },
    });
    // Continuation step (index 1): step_response con coalescedDelegationStepIndex = 0
    bus.publish({
      type: 'step_response',
      sessionId: 'sess-1',
      timestamp: '2026-01-01T00:00:01Z',
      payload: {
        workflowId: 'wf-1',
        stepIndex: 1,
        response: contMsg,
        coalescedDelegationStepIndex: 0,
      },
    });

    await persistenceWithCoalesced.flush();

    // body.coalesced.json debe existir en el step de continuación
    const coalescedPath = 'sessions/sess-1/workflows/00/steps/01/response/body.coalesced.json';
    expect(await exists(coalescedPath)).toBe(true);
    const body = await readJson(coalescedPath);
    expect(body.type).toBe('coalesced-agent-step-response');

    // sse.jsonl NO debe existir (fue reemplazado por streaming/)
    expect(await exists('sessions/sess-1/workflows/00/steps/01/response/sse.jsonl')).toBe(false);
    expect(await exists('sessions/sess-1/workflows/00/steps/00/response/sse.jsonl')).toBe(false);
  });
});
