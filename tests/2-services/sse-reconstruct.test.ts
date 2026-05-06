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
    stepDir = path.join(interactionDir, 'steps', '01');
    const stepResponseDir = path.join(stepDir, 'response');
    await fs.mkdir(stepResponseDir, { recursive: true });
    await fs.mkdir(path.join(interactionDir, 'response'), { recursive: true });

    const redactService = new RedactService();
    const markdownRenderer = new MarkdownRendererService();
    auditWriterService = new AuditWriterService(redactService, markdownRenderer);
    sseReconstructService = new SseReconstructService(auditWriterService);

    // Crear step body.json para que writeTopLevelMultiStepResponse lo encuentre
    const stepBody = {
      id: 'msg_mock',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hola mundo!' }],
      model: 'claude-3-5-sonnet-20241022',
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 12 },
    };
    await fs.writeFile(
      path.join(stepDir, 'response', 'body.json'),
      JSON.stringify(stepBody, null, 2),
      'utf8',
    );

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
      stepCount: 1,
      originalUrl: 'https://api.anthropic.com/v1/messages',
      headers: {},
      sseRawBytesWritten: 1024,
      sseRawTruncatedByLimit: false,
      sseRawWriteError: false,
    });

    expect(result.sseResponseBodyAttempted).toBe(true);
    expect(result.sseResponseBodyWritten).toBe(true);
    expect(result.sseResponseBodySource).toBe('file');

    const jsonContent = await fs.readFile(
      path.join(interactionDir, 'output', 'body.json'),
      'utf8',
    );
    const parsed = JSON.parse(jsonContent);

    // Formato multi-step-response
    expect(parsed.type).toBe('multi-step-response');
    expect(parsed.stepCount).toBe(1);
    expect(parsed.steps).toBeInstanceOf(Array);
    expect(parsed.steps[0].id).toBe('msg_mock');
    expect(parsed.steps[0].role).toBe('assistant');
    expect(parsed.steps[0].content[0].type).toBe('text');
    expect(parsed.steps[0].content[0].text).toBe('Hola mundo!');
    expect(parsed.steps[0].stop_reason).toBe('end_turn');

    const mdContent = await fs.readFile(
      path.join(interactionDir, 'output', 'body.parsed.md'),
      'utf8',
    );
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
    stepDir = path.join(interactionDir, 'steps', '01');
    await fs.mkdir(path.join(stepDir, 'response'), { recursive: true });
    await fs.mkdir(path.join(interactionDir, 'response'), { recursive: true });

    const redactService = new RedactService();
    const markdownRenderer = new MarkdownRendererService();
    const writer = new AuditWriterService(redactService, markdownRenderer);
    service = new SseReconstructService(writer);

    // Crear step body.json para que writeTopLevelMultiStepResponse lo encuentre
    const stepBody = {
      id: 'msg_ok',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'ok' }],
      model: 'claude',
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    await fs.writeFile(
      path.join(stepDir, 'response', 'body.json'),
      JSON.stringify(stepBody, null, 2),
      'utf8',
    );

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
      stepCount: 1,
      sseRawBytesWritten: 1,
      sseRawTruncatedByLimit: false,
      sseRawWriteError: false,
    });

    expect(result.sseResponseBodyAttempted).toBe(true);
    expect(result.sseResponseBodyWritten).toBe(true);
    expect(result.sseResponseBodyError).toBeUndefined();

    const body = JSON.parse(
      await fs.readFile(path.join(interactionDir, 'output', 'body.json'), 'utf8'),
    );
    // Formato multi-step-response
    expect(body.type).toBe('multi-step-response');
    expect(body.stepCount).toBe(1);
    expect(body.steps[0].id).toBe('msg_ok');
    expect(body.steps[0].role).toBe('assistant');
    expect(body.steps[0].content[0].text).toBe('ok');
  });

  it('reconstruye aunque sse.txt haya sido truncado o haya fallado escritura', async () => {
    const result = await service.runReconstruction({
      stepDir,
      interactionDir,
      stepCount: 1,
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
    stepDir = path.join(interactionDir, 'steps', '01');
    await fs.mkdir(path.join(stepDir, 'response'), { recursive: true });
    await fs.mkdir(path.join(interactionDir, 'response'), { recursive: true });

    const redactService = new RedactService();
    const markdownRenderer = new MarkdownRendererService();
    const writer = new AuditWriterService(redactService, markdownRenderer);
    service = new SseReconstructService(writer);

    const here = path.dirname(fileURLToPath(import.meta.url));
    const fixturePath = path.resolve(here, '../fixtures/sse-reconstruct/real-title-gen-step.jsonl');
    const jsonlBytes = await fs.readFile(fixturePath);
    await fs.writeFile(path.join(stepDir, 'response', 'sse.jsonl'), jsonlBytes);

    // Crear step body.json para que writeTopLevelMultiStepResponse lo encuentre
    const stepBody = {
      id: 'msg_title_gen',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: '{"title": "Explain Smart Code Proxy project"}' }],
      model: 'claude-3-5-sonnet',
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 50 },
    };
    await fs.writeFile(
      path.join(stepDir, 'response', 'body.json'),
      JSON.stringify(stepBody, null, 2),
      'utf8',
    );
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('reconstruye el step real "title-gen" (side-request con end_turn)', async () => {
    const result = await service.runReconstruction({
      stepDir,
      interactionDir,
      stepCount: 1,
      sseRawBytesWritten: 1349,
      sseRawTruncatedByLimit: false,
      sseRawWriteError: false,
    });
    expect(result.sseResponseBodyAttempted).toBe(true);
    expect(result.sseResponseBodyWritten).toBe(true);
    expect(result.sseResponseBodyError).toBeUndefined();

    const body = JSON.parse(
      await fs.readFile(path.join(interactionDir, 'output', 'body.json'), 'utf8'),
    );
    // Formato multi-step-response
    expect(body.type).toBe('multi-step-response');
    expect(body.stepCount).toBe(1);
    expect(body.steps[0].role).toBe('assistant');
    expect(body.steps[0].stop_reason).toBe('end_turn');
    expect(body.steps[0].content[0].type).toBe('text');
    // El contenido es un JSON con el título generado por Claude Code
    expect(body.steps[0].content[0].text).toContain('Explain Smart Code Proxy project');
  });
});

describe('SseReconstructService - reconstrucción por fase (coalesced)', () => {
  let tempDir: string;
  let jsonlPath: string;
  let service: SseReconstructService;

  beforeAll(async () => {
    tempDir = path.join(os.tmpdir(), `scp-sse-phase-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    jsonlPath = path.join(tempDir, 'sse.jsonl');

    const redactService = new RedactService();
    const markdownRenderer = new MarkdownRendererService();
    const writer = new AuditWriterService(redactService, markdownRenderer);
    service = new SseReconstructService(writer);
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('reconstruye fase delegation con tool_use Agent y sin message_stop', async () => {
    const delegationLines = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_01","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":0}}}',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_01","name":"Agent","input":{}}}',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"description\\":\\"Test\\""}}',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":",\\"prompt\\":\\"Do it\\"}"}}',
      'event: content_block_stop',
      'data: {"type":"content_block_stop","index":0}',
      'event: message_delta',
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}',
    ];

    const jsonlContent = delegationLines
      .map((line, i) => JSON.stringify({ i: i + 1, ts: '2026-01-01T00:00:00Z', line, phase: 'delegation' as const }))
      .join('\n') + '\n';
    await fs.writeFile(jsonlPath, jsonlContent, 'utf8');

    const message = await service.reconstructSseJsonlPhaseMessage(jsonlPath, 'delegation');

    expect(message.id).toBe('msg_01');
    expect(message.model).toBe('claude-3-5-sonnet');
    expect(message.stop_reason).toBe('tool_use');
    expect(message.content).toHaveLength(1);
    expect(message.content[0].type).toBe('tool_use');
    if (message.content[0].type === 'tool_use') {
      expect(message.content[0].id).toBe('toolu_01');
      expect(message.content[0].name).toBe('Agent');
      // Verificar que el input se reconstruyó desde los deltas
      expect(message.content[0].input).toEqual({ description: 'Test', prompt: 'Do it' });
    }
  });

  it('reconstruye fase continuation con texto final y message_stop', async () => {
    const continuationLines = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_02","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":5,"output_tokens":0}}}',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Final "}}',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"answer"}}',
      'event: content_block_stop',
      'data: {"type":"content_block_stop","index":0}',
      'event: message_delta',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":10}}',
      'event: message_stop',
      'data: {"type":"message_stop"}',
    ];

    const jsonlContent = continuationLines
      .map((line, i) => JSON.stringify({ i: i + 1, ts: '2026-01-01T00:00:00Z', line, phase: 'continuation' as const }))
      .join('\n') + '\n';
    await fs.writeFile(jsonlPath, jsonlContent, 'utf8');

    const message = await service.reconstructSseJsonlPhaseMessage(jsonlPath, 'continuation');

    expect(message.id).toBe('msg_02');
    expect(message.model).toBe('claude-3-5-sonnet');
    expect(message.stop_reason).toBe('end_turn');
    expect(message.content).toHaveLength(1);
    expect(message.content[0].type).toBe('text');
    if (message.content[0].type === 'text') {
      expect(message.content[0].text).toBe('Final answer');
    }
  });

  it('filtra correctamente por fase y ignora eventos de otras fases', async () => {
    const mixedLines = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_01","model":"claude"}}',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"delegation text"}}',
      'event: content_block_stop',
      'data: {"type":"content_block_stop","index":0}',
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_02","model":"claude"}}',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"continuation text"}}',
      'event: content_block_stop',
      'data: {"type":"content_block_stop","index":0}',
    ];

    const jsonlContent = mixedLines
      .map((line, i) => {
        const phase = i < 5 ? 'delegation' : 'continuation';
        return JSON.stringify({ i: i + 1, ts: '2026-01-01T00:00:00Z', line, phase });
      })
      .join('\n') + '\n';
    await fs.writeFile(jsonlPath, jsonlContent, 'utf8');

    const delegationMessage = await service.reconstructSseJsonlPhaseMessage(jsonlPath, 'delegation');
    expect(delegationMessage.id).toBe('msg_01');

    const continuationMessage = await service.reconstructSseJsonlPhaseMessage(jsonlPath, 'continuation');
    expect(continuationMessage.id).toBe('msg_02');
  });
});

describe('SseReconstructService - validación de SSE completo', () => {
  let tempDir: string;
  let jsonlPath: string;
  let service: SseReconstructService;

  beforeAll(async () => {
    tempDir = path.join(os.tmpdir(), `scp-sse-validate-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    jsonlPath = path.join(tempDir, 'sse.jsonl');

    const redactService = new RedactService();
    const markdownRenderer = new MarkdownRendererService();
    const writer = new AuditWriterService(redactService, markdownRenderer);
    service = new SseReconstructService(writer);
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('validateCompleteSseJsonl detecta múltiples message_start y lanza error', async () => {
    const multiMessageLines = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_01","model":"claude"}}',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"text 1"}}',
      'event: content_block_stop',
      'data: {"type":"content_block_stop","index":0}',
      'event: message_stop',
      'data: {"type":"message_stop"}',
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_02","model":"claude"}}',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"text 2"}}',
      'event: content_block_stop',
      'data: {"type":"content_block_stop","index":0}',
      'event: message_stop',
      'data: {"type":"message_stop"}',
    ];

    await fs.writeFile(jsonlPath, toJsonl(multiMessageLines), 'utf8');

    await expect(service.reconstructSseJsonlFile(jsonlPath)).rejects.toThrow(
      'sse.jsonl contiene múltiples mensajes completos (múltiples message_start)',
    );
  });

  it('validateCompleteSseJsonl detecta stream incompleto (sin message_stop) y lanza error', async () => {
    const incompleteLines = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_01","model":"claude"}}',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"text"}}',
      'event: content_block_stop',
      'data: {"type":"content_block_stop","index":0}',
    ];

    await fs.writeFile(jsonlPath, toJsonl(incompleteLines), 'utf8');

    await expect(service.reconstructSseJsonlFile(jsonlPath)).rejects.toThrow(
      'sse.jsonl incompleto: falta message_stop',
    );
  });

  it('validateCompleteSseJsonl no lanza error para stream válido (1 message_start, 1 message_stop)', async () => {
    const validLines = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_01","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":1}}}',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hola"}}',
      'event: content_block_stop',
      'data: {"type":"content_block_stop","index":0}',
      'event: message_delta',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":12}}',
      'event: message_stop',
      'data: {"type":"message_stop"}',
    ];

    await fs.writeFile(jsonlPath, toJsonl(validLines), 'utf8');

    const message = await service.reconstructSseJsonlFile(jsonlPath);
    expect(message.id).toBe('msg_01');
  });

  it('validateCompleteSseJsonl lanza error si no hay message_start', async () => {
    const noStartLines = [
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"text"}}',
      'event: content_block_stop',
      'data: {"type":"content_block_stop","index":0}',
      'event: message_stop',
      'data: {"type":"message_stop"}',
    ];

    await fs.writeFile(jsonlPath, toJsonl(noStartLines), 'utf8');

    await expect(service.reconstructSseJsonlFile(jsonlPath)).rejects.toThrow(
      'sse.jsonl no contiene message_start',
    );
  });
});
