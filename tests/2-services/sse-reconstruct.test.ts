import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { AuditWriterService } from '../../src/2-services/audit-writer.service.js';
import { RedactService } from '../../src/1-domain/services/redact.service.js';
import { MarkdownRendererService } from '../../src/1-domain/services/markdown-renderer.service.js';
import { SseReconstructService } from '../../src/2-services/sse-reconstruct.service.js';

/**
 * Helper: serializa un array de líneas SSE al formato sse.jsonl escrito por
 * `AuditWriterService.appendSseLine`.
 */
function toJsonl(lines: string[]): string {
  return (
    lines
      .map((line, i) => JSON.stringify({ i: i + 1, ts: '2026-01-01T00:00:00Z', line }))
      .join('\n') + '\n'
  );
}

describe('Test de Integración - SseReconstructService (fuente: sse.jsonl)', () => {
  let tempSessionsDir: string;
  let interactionDir: string;
  let stepDir: string;
  let sseReconstructService: SseReconstructService;
  let auditWriterService: AuditWriterService;

  beforeAll(async () => {
    tempSessionsDir = path.join(os.tmpdir(), `scp-sse-${Date.now()}`);
    interactionDir = path.join(tempSessionsDir, 'test-session', 'interactions', 'mock-req');
    stepDir = path.join(interactionDir, 'steps', '001');
    const stepResponseDir = path.join(stepDir, 'response');
    await fs.mkdir(stepResponseDir, { recursive: true });
    await fs.mkdir(path.join(interactionDir, 'response'), { recursive: true });

    const redactService = new RedactService();
    const markdownRenderer = new MarkdownRendererService();
    auditWriterService = new AuditWriterService(redactService, markdownRenderer);
    sseReconstructService = new SseReconstructService(auditWriterService, markdownRenderer);

    const lines = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_mock","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet-20241022","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":1}}}',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hola "}}',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"mundo!"}}',
      'event: content_block_stop',
      'data: {"type":"content_block_stop","index":0}',
      'event: message_delta',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":12}}',
      'event: message_stop',
      'data: {"type":"message_stop"}',
    ];
    await fs.writeFile(path.join(stepDir, 'response', 'sse.jsonl'), toJsonl(lines), 'utf8');
  });

  afterAll(async () => {
    await fs.rm(tempSessionsDir, { recursive: true, force: true });
  });

  it('debería reconstruir response/body.* desde sse.jsonl usando el SDK', async () => {
    const result = await sseReconstructService.runReconstruction({
      stepDir,
      interactionDir,
      originalUrl: 'https://api.anthropic.com/v1/messages',
      headers: {},
      sseRawBytesWritten: 1024,
      sseRawTruncatedByLimit: false,
      sseRawWriteError: false,
    });

    expect(result.sseResponseBodyAttempted).toBe(true);
    expect(result.sseResponseBodyWritten).toBe(true);
    expect(result.sseResponseBodySource).toBe('file');

    const jsonContent = await fs.readFile(path.join(interactionDir, 'response', 'body.json'), 'utf8');
    const parsed = JSON.parse(jsonContent);

    expect(parsed.id).toBe('msg_mock');
    expect(parsed.role).toBe('assistant');
    expect(parsed.content[0].type).toBe('text');
    expect(parsed.content[0].text).toBe('Hola mundo!');
    expect(parsed.stop_reason).toBe('end_turn');

    const mdContent = await fs.readFile(path.join(interactionDir, 'response', 'body.parsed.md'), 'utf8');
    expect(mdContent).toContain('_(stop_reason: end_turn)_');
    expect(mdContent).toContain('# Respuesta del Asistente');
    expect(mdContent).toContain('Hola mundo!');
  });
});

describe('SseReconstructService - resiliencia frente a sse.txt corrupto', () => {
  let tempDir: string;
  let interactionDir: string;
  let stepDir: string;
  let service: SseReconstructService;

  beforeAll(async () => {
    tempDir = path.join(os.tmpdir(), `scp-sse-corrupt-${Date.now()}`);
    interactionDir = path.join(tempDir, 'session', 'interactions', 'mock');
    stepDir = path.join(interactionDir, 'steps', '001');
    await fs.mkdir(path.join(stepDir, 'response'), { recursive: true });
    await fs.mkdir(path.join(interactionDir, 'response'), { recursive: true });

    const redactService = new RedactService();
    const markdownRenderer = new MarkdownRendererService();
    const writer = new AuditWriterService(redactService, markdownRenderer);
    service = new SseReconstructService(writer, markdownRenderer);

    // sse.jsonl: ORDEN CORRECTO
    const correctOrder = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_ok","type":"message","role":"assistant","content":[],"model":"claude","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":1,"output_tokens":1}}}',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      'event: ping',
      'data: {"type":"ping"}',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}',
      'event: content_block_stop',
      'data: {"type":"content_block_stop","index":0}',
      'event: message_delta',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":1}}',
      'event: message_stop',
      'data: {"type":"message_stop"}',
    ];
    await fs.writeFile(path.join(stepDir, 'response', 'sse.jsonl'), toJsonl(correctOrder), 'utf8');

    // sse.txt: ORDEN CORRUPTO (content_block_start antes de message_start) —
    // replica exactamente el escenario histórico capturado en sessions/ antes
    // del fix. El servicio NO debe leer este archivo.
    const corruptTxt = [
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      '',
      'event: message_start',
      'data: {"type":"message_start"}',
      '',
    ].join('\n');
    await fs.writeFile(path.join(stepDir, 'response', 'sse.txt'), corruptTxt, 'utf8');
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('reconstruye correctamente ignorando un sse.txt desordenado', async () => {
    const result = await service.runReconstruction({
      stepDir,
      interactionDir,
      sseRawBytesWritten: 1,
      sseRawTruncatedByLimit: false,
      sseRawWriteError: false,
    });

    expect(result.sseResponseBodyAttempted).toBe(true);
    expect(result.sseResponseBodyWritten).toBe(true);
    expect(result.sseResponseBodyError).toBeUndefined();

    const body = JSON.parse(
      await fs.readFile(path.join(interactionDir, 'response', 'body.json'), 'utf8'),
    );
    expect(body.id).toBe('msg_ok');
    expect(body.role).toBe('assistant');
    expect(body.content[0].text).toBe('ok');
  });

  it('reconstruye aunque sse.txt haya sido truncado o haya fallado escritura', async () => {
    const result = await service.runReconstruction({
      stepDir,
      interactionDir,
      sseRawBytesWritten: 0,
      sseRawTruncatedByLimit: true,
      sseRawWriteError: true,
    });
    expect(result.sseResponseBodyWritten).toBe(true);
  });
});

describe('SseReconstructService - fixture real (sessions/ histórico)', () => {
  let tempDir: string;
  let interactionDir: string;
  let stepDir: string;
  let service: SseReconstructService;

  beforeAll(async () => {
    tempDir = path.join(os.tmpdir(), `scp-sse-real-${Date.now()}`);
    interactionDir = path.join(tempDir, 'session', 'interactions', 'real');
    stepDir = path.join(interactionDir, 'steps', '001');
    await fs.mkdir(path.join(stepDir, 'response'), { recursive: true });
    await fs.mkdir(path.join(interactionDir, 'response'), { recursive: true });

    const redactService = new RedactService();
    const markdownRenderer = new MarkdownRendererService();
    const writer = new AuditWriterService(redactService, markdownRenderer);
    service = new SseReconstructService(writer, markdownRenderer);

    const here = path.dirname(fileURLToPath(import.meta.url));
    const fixturePath = path.resolve(
      here,
      '../fixtures/sse-reconstruct/real-title-gen-step.jsonl',
    );
    const jsonlBytes = await fs.readFile(fixturePath);
    await fs.writeFile(path.join(stepDir, 'response', 'sse.jsonl'), jsonlBytes);
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('reconstruye el step real "title-gen" (side-request con end_turn)', async () => {
    const result = await service.runReconstruction({
      stepDir,
      interactionDir,
      sseRawBytesWritten: 1349,
      sseRawTruncatedByLimit: false,
      sseRawWriteError: false,
    });
    expect(result.sseResponseBodyAttempted).toBe(true);
    expect(result.sseResponseBodyWritten).toBe(true);
    expect(result.sseResponseBodyError).toBeUndefined();

    const body = JSON.parse(
      await fs.readFile(path.join(interactionDir, 'response', 'body.json'), 'utf8'),
    );
    expect(body.role).toBe('assistant');
    expect(body.stop_reason).toBe('end_turn');
    expect(body.content[0].type).toBe('text');
    // El contenido es un JSON con el título generado por Claude Code
    expect(body.content[0].text).toContain('Explain Smart Code Proxy project');
  });
});
