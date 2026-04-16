import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { AuditWriterService } from '../src/services/audit-writer.service.js';
import { RedactService } from '../src/services/redact.service.js';
import { MarkdownRendererService } from '../src/services/markdown-renderer.service.js';
import { SseReconstructService } from '../src/services/sse-reconstruct.service.js';

describe('Test de Integración - SseReconstructService', () => {
  let tempSessionsDir: string;
  let requestDir: string;
  let sseReconstructService: SseReconstructService;
  let auditWriterService: AuditWriterService;

  beforeAll(async () => {
    tempSessionsDir = path.join(os.tmpdir(), `scp-sse-${Date.now()}`);
    requestDir = path.join(tempSessionsDir, 'test-session', 'requests', 'mock-req');
    await fs.mkdir(requestDir, { recursive: true });

    const redactService = new RedactService();
    const markdownRenderer = new MarkdownRendererService();
    auditWriterService = new AuditWriterService(redactService, markdownRenderer);
    sseReconstructService = new SseReconstructService(auditWriterService, markdownRenderer, 'claude-3-5-sonnet-20241022');

    // 1. Escribimos el RAW sse file simulando un stream SSE emitido por anthropic
    const sseEventSequence = `event: message_start
data: {"type":"message_start","message":{"id":"msg_mock","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet-20241022","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hola "}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"mundo!"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":12}}

event: message_stop
data: {"type":"message_stop"}

`;
    await fs.writeFile(path.join(requestDir, 'response.sse.txt'), sseEventSequence, 'utf8');
  });

  afterAll(async () => {
    await fs.rm(tempSessionsDir, { recursive: true, force: true });
  });

  it('debería reconstruir el response.body desde el archivo txt utilizando el SDK', async () => {
    // 2. Ejecutar la reconstrucción
    const result = await sseReconstructService.runReconstruction({
      requestDir,
      originalUrl: 'https://api.anthropic.com/v1/messages',
      headers: {},
      forceBeta: false,
      sseRawBytesWritten: 1024,
      auditSseRaw: true, // Esto es requerido si requireRaw=true (por defecto lo asume el mock si no pasamos requireRaw)
      sseRawTruncatedByLimit: false,
      sseRawWriteError: false,
      requireRaw: false
    });

    // Validar el flag resultado
    expect(result.sseResponseBodyAttempted).toBe(true);
    expect(result.sseResponseBodyWritten).toBe(true);
    expect(result.sseResponseBodySource).toBe('file');

    // Miremos el JSON generado (el body completo)
    const jsonContent = await fs.readFile(path.join(requestDir, 'response.body.json'), 'utf8');
    const parsed = JSON.parse(jsonContent);

    expect(parsed.id).toBe('msg_mock');
    expect(parsed.role).toBe('assistant');
    // Content ensamblado correctamente
    expect(parsed.content[0].type).toBe('text');
    expect(parsed.content[0].text).toBe('Hola mundo!');
    
    expect(parsed.stop_reason).toBe('end_turn');

    // Miremos el Markdown parseado para ver que el renderer funcionó bien anidado
    const mdContent = await fs.readFile(path.join(requestDir, 'response.body.parsed.md'), 'utf8');
    expect(mdContent).toContain('**stop_reason:** "end_turn"');
    expect(mdContent).toContain('Hola mundo!');
  });
});
