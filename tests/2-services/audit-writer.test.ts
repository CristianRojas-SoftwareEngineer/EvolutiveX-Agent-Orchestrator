import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { AuditWriterService } from '../../src/2-services/audit-writer.service.js';
import { RedactService } from '../../src/1-domain/services/redact.service.js';
import { MarkdownRendererService } from '../../src/1-domain/services/markdown-renderer.service.js';

describe('AuditWriterService - appendSseRawChunk (orden preservado bajo ráfaga)', () => {
  let tempDir: string;
  let service: AuditWriterService;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `scp-test-sseraw-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    service = new AuditWriterService(new RedactService(), new MarkdownRendererService());
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('preserva el orden de múltiples chunks escritos consecutivamente (regresión: race sse.txt)', async () => {
    // Ráfaga de 200 chunks numerados. Con la implementación asíncrona previa
    // (fs.appendFile + fire-and-forget) este bucle producía un sse.txt
    // desordenado bajo carga. Con la implementación síncrona actual, el
    // orden debe ser exactamente el de emisión.
    const N = 200;
    const expected: string[] = [];
    for (let i = 0; i < N; i++) {
      const token = `chunk-${String(i).padStart(4, '0')}\n`;
      expected.push(token);
      service.appendSseRawChunk(tempDir, Buffer.from(token, 'utf8'));
    }
    const content = await fs.readFile(path.join(tempDir, 'response', 'sse.txt'), 'utf8');
    expect(content).toBe(expected.join(''));
  });

  it('es síncrono: los bytes están en disco al retornar (sin await)', async () => {
    service.appendSseRawChunk(tempDir, Buffer.from('immediately-visible', 'utf8'));
    // No hay await entre el append y la lectura: el contenido debe estar ya.
    const content = await fs.readFile(path.join(tempDir, 'response', 'sse.txt'), 'utf8');
    expect(content).toBe('immediately-visible');
  });
});

describe('AuditWriterService - appendSseLine (síncrono)', () => {
  let tempDir: string;
  let service: AuditWriterService;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `scp-test-sse-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    service = new AuditWriterService(new RedactService(), new MarkdownRendererService());
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('debería escribir líneas SSE de forma síncrona', async () => {
    service.appendSseLine(tempDir, { i: 1, ts: '2026-01-01T00:00:00Z', line: 'data: test1' });
    service.appendSseLine(tempDir, { i: 2, ts: '2026-01-01T00:00:01Z', line: 'data: test2' });

    const content = await fs.readFile(path.join(tempDir, 'response', 'sse.jsonl'), 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).line).toBe('data: test1');
    expect(JSON.parse(lines[1]).line).toBe('data: test2');
  });
});

describe('AuditWriterService - writeStepRequest', () => {
  let tempDir: string;
  let service: AuditWriterService;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `scp-test-step-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    service = new AuditWriterService(new RedactService(), new MarkdownRendererService());
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('debería crear directorios recursivamente y escribir headers + body', async () => {
    const stepDir = path.join(tempDir, 'interactions', '000001_req', 'steps', '001');
    const body = Buffer.from(JSON.stringify({ model: 'claude', messages: [] }));

    await service.writeStepRequest({
      stepDir,
      headers: { 'content-type': 'application/json' },
      bodyBuffer: body,
      maxAuditRequestBytes: 52428800,
    });

    const headersJson = await fs.readFile(path.join(stepDir, 'request', 'headers.json'), 'utf8');
    expect(JSON.parse(headersJson)['content-type']).toBe('application/json');

    const bodyBin = await fs.readFile(path.join(stepDir, 'request', 'body.bin'));
    expect(bodyBin).toEqual(body);
  });

  it('debería escribir body.omitted.txt si excede el límite', async () => {
    const stepDir = path.join(tempDir, 'interactions', '000001_req', 'steps', '002');
    const bigBody = Buffer.alloc(100);

    await service.writeStepRequest({
      stepDir,
      headers: {},
      bodyBuffer: bigBody,
      maxAuditRequestBytes: 10,
    });

    const omitted = await fs.readFile(path.join(stepDir, 'request', 'body.omitted.txt'), 'utf8');
    expect(omitted).toContain('Omitted');
  });
});

describe('AuditWriterService - writeFormattedAndMarkdown semántico', () => {
  let tempDir: string;
  let service: AuditWriterService;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `scp-test-md-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    service = new AuditWriterService(new RedactService(), new MarkdownRendererService());
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('debería generar markdown conversacional para petición sin mensaje de usuario', async () => {
    const parsed = {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'toolu_abc', name: 'read_file', input: { path: '/test.ts' } },
          ],
        },
      ],
    };
    const requestDir = path.join(tempDir, 'request');
    await fs.mkdir(requestDir, { recursive: true });
    await service.writeFormattedAndMarkdown(requestDir, 'body', parsed, 'request');

    const md = await fs.readFile(path.join(requestDir, 'body.parsed.md'), 'utf8');
    expect(md).toContain('# Prompt del Usuario');
    expect(md).toContain('_[No se detectó mensaje de usuario]_');
    expect(md).toContain('<!-- model: claude-3-5-sonnet-20241022, max_tokens: 1024 -->');
  });
});

describe('AuditWriterService - extractFinalTextFromJson', () => {
  let service: AuditWriterService;

  beforeEach(() => {
    service = new AuditWriterService(new RedactService(), new MarkdownRendererService());
  });

  it('debería extraer el último bloque text de un mensaje normal', () => {
    const parsed = {
      content: [
        { type: 'text', text: 'Texto 1' },
        { type: 'tool_use', id: 't1', name: 'bash', input: {} },
        { type: 'text', text: 'Texto final' },
      ],
    };
    const text = service.extractFinalTextFromJson(parsed);
    expect(text).toBe('Texto final');
  });

  it('debería extraer texto desde multi-step-response', () => {
    const parsed = {
      type: 'multi-step-response',
      steps: [
        { content: [{ type: 'text', text: 'Step 1' }] },
        { content: [{ type: 'text', text: 'Step 2 final' }] },
      ],
    };
    const text = service.extractFinalTextFromJson(parsed);
    expect(text).toBe('Step 2 final');
  });

  it('debería extraer texto desde coalesced-agent-step-response (continuation)', () => {
    const parsed = {
      type: 'coalesced-agent-step-response',
      delegation: { message: { content: [{ type: 'text', text: 'Delegación' }] } },
      continuation: {
        request: { body: null },
        response: {
          message: { content: [{ type: 'text', text: 'Respuesta final coalesced' }] },
        },
      },
      toolUseIds: [],
    };
    const text = service.extractFinalTextFromJson(parsed);
    expect(text).toBe('Respuesta final coalesced');
  });

  it('debería retornar null si no hay texto', () => {
    const parsed = { content: [{ type: 'tool_use', id: 't1', name: 'bash', input: {} }] };
    const text = service.extractFinalTextFromJson(parsed);
    expect(text).toBeNull();
  });

  it('debería retornar null para inputs no válidos', () => {
    expect(service.extractFinalTextFromJson(null)).toBeNull();
    expect(service.extractFinalTextFromJson('texto')).toBeNull();
    expect(service.extractFinalTextFromJson([])).toBeNull();
  });
});

describe('AuditWriterService - writeCoalescedAgentStepResponse (subagentes causal)', () => {
  let tempDir: string;
  let service: AuditWriterService;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `scp-test-coalesced-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    service = new AuditWriterService(new RedactService(), new MarkdownRendererService());
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('incluye subagents desde tools/*/sub-agent/workflow cuando no se pasa subagentsSummary', async () => {
    const stepDir = path.join(tempDir, 'workflows', '01', 'steps', '01');
    const subWorkflowDir = path.join(stepDir, 'tools', '01-Agent', 'sub-agent', 'workflow');
    await fs.mkdir(path.join(subWorkflowDir, 'output'), { recursive: true });
    await fs.writeFile(
      path.join(subWorkflowDir, 'meta.json'),
      JSON.stringify({
        workflowKind: 'subagent',
        parentToolUseId: 'toolu_agent_1',
        outcome: 'success',
        startedAt: '2026-01-01T00:00:00.000Z',
        completedAt: '2026-01-01T00:00:05.000Z',
      }),
      'utf8',
    );
    await fs.writeFile(
      path.join(subWorkflowDir, 'output', 'result.json'),
      JSON.stringify({
        outcome: 'success',
        stepCount: 1,
        finalText: 'Resultado del subagente causal',
        closedByEvent: 'SubagentStop',
        sessionId: 'sess-1',
      }),
      'utf8',
    );

    const initialMessage = {
      content: [
        {
          type: 'tool_use',
          id: 'toolu_agent_1',
          name: 'Agent',
          input: {
            description: 'Explorar repo',
            prompt: 'Lista archivos',
            subagent_type: 'Explore',
          },
        },
      ],
    };

    await service.writeCoalescedAgentStepResponse({
      stepDir,
      initialMessage,
      continuationRequest: null,
      finalMessage: { content: [{ type: 'text', text: 'Listo' }] },
      toolUseIds: ['toolu_agent_1'],
    });

    const body = JSON.parse(
      await fs.readFile(path.join(stepDir, 'response', 'body.json'), 'utf8'),
    );
    expect(body.subagents).toBeDefined();
    expect(body.subagents.count).toBe(1);
    expect(body.subagents.items[0].toolUseId).toBe('toolu_agent_1');
    expect(body.subagents.items[0].outcome).toBe('completed');
    expect(body.subagents.items[0].finalResponsePreview).toContain('Resultado del subagente');
  });
});
