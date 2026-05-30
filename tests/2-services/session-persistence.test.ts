import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { EventBus } from '../../src/2-services/event-bus.service.js';
import { SessionPersistence } from '../../src/2-services/session-persistence.service.js';
import type { TelemetryEvent } from '../../src/1-domain/types/telemetry.types.js';

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
