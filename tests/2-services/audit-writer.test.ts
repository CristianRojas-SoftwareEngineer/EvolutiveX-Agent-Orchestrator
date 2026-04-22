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

describe('AuditWriterService - writeTurnMeta', () => {
  let tempDir: string;
  let service: AuditWriterService;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `scp-test-turn-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    service = new AuditWriterService(new RedactService(), new MarkdownRendererService());
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('debería escribir meta.json con TurnMetadata', async () => {
    const interactionDir = path.join(tempDir, 'interactions', '000001_req');
    await fs.mkdir(interactionDir, { recursive: true });

    await service.writeTurnMeta(interactionDir, {
      interactionType: 'agentic-turn',
      turnOutcome: 'completed',
      stepCount: 2,
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T00:00:10.000Z',
      durationMs: 10000,
      statusCode: 200,
      sse: true,
      steps: [
        { stepIndex: 1, sse: true, statusCode: 200, stopReason: 'tool_use', toolCalls: ['Read'] },
        { stepIndex: 2, sse: true, statusCode: 200, stopReason: 'end_turn' },
      ],
      totals: { cacheCreationInputTokens: 100, cacheReadInputTokens: 200, inputTokens: 10, outputTokens: 50 },
      sseResponseBodyAttempted: true,
      sseResponseBodyWritten: true,
      sseResponseBodyError: null,
      sseResponseBodySource: 'file',
      errorMessage: null,
      errorCode: null,
      truncation: {
        requestBodyOmitted: false,
        responseBodyBytesTotal: null,
        responseBodyBytesAudited: null,
        responseTruncatedByProxyBuffer: false,
        responseTruncatedByAuditLimit: false,
        sseRawBytesAudited: null,
        sseRawBytesLimit: null,
        sseRawTruncatedByLimit: false,
        sseRawWriteError: false,
      },
    });

    const meta = JSON.parse(await fs.readFile(path.join(interactionDir, 'meta.json'), 'utf8'));
    expect(meta.interactionType).toBe('agentic-turn');
    expect(meta.turnOutcome).toBe('completed');
    expect(meta.stepCount).toBe(2);
    expect(meta.steps).toHaveLength(2);
    expect(meta.totals.inputTokens).toBe(10);
  });
});

describe('AuditWriterService - writeInteractionState / removeInteractionState', () => {
  let tempDir: string;
  let service: AuditWriterService;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `scp-test-state-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    service = new AuditWriterService(new RedactService(), new MarkdownRendererService());
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('debería escribir state.json con el estado in-progress', async () => {
    const interactionDir = path.join(tempDir, 'interactions', '000001_req');
    await service.writeInteractionState(interactionDir, {
      state: 'in-progress',
      startedAt: '2026-01-01T00:00:00.000Z',
      interactionType: 'agentic-turn',
    });
    const content = JSON.parse(await fs.readFile(path.join(interactionDir, 'state.json'), 'utf8'));
    expect(content.state).toBe('in-progress');
    expect(content.interactionType).toBe('agentic-turn');
    expect(content.startedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('debería eliminar state.json al llamar removeInteractionState', async () => {
    const interactionDir = path.join(tempDir, 'interactions', '000002_req');
    await service.writeInteractionState(interactionDir, {
      state: 'in-progress',
      startedAt: '2026-01-01T00:00:00.000Z',
      interactionType: 'side-request',
    });
    await service.removeInteractionState(interactionDir);
    await expect(fs.access(path.join(interactionDir, 'state.json'))).rejects.toThrow();
  });

  it('removeInteractionState debería ser idempotente (no lanza si no existe)', async () => {
    const interactionDir = path.join(tempDir, 'interactions', 'nonexistent');
    await fs.mkdir(interactionDir, { recursive: true });
    await expect(service.removeInteractionState(interactionDir)).resolves.toBeUndefined();
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

  it('debería generar markdown semántico para petición con tool_use', async () => {
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
    expect(md).toContain('**tool:** read_file');
    expect(md).toContain('**id:** `toolu_abc`');
  });
});
