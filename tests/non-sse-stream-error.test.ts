import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { AuditWriterService } from '../src/services/audit-writer.service.js';
import { RedactService } from '../src/services/redact.service.js';
import { MarkdownRendererService } from '../src/services/markdown-renderer.service.js';

describe('AuditWriterService - finalizeNonSseResponseAuditOnStreamError', () => {
  let tempDir: string;
  let service: AuditWriterService;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `scp-test-stream-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    const redactService = new RedactService();
    const markdownRenderer = new MarkdownRendererService();
    service = new AuditWriterService(redactService, markdownRenderer);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('debería escribir el cuerpo parcial y el archivo de omisión con mensaje de error', async () => {
    const requestDir = path.join(tempDir, 'test-stream-error');
    await fs.mkdir(requestDir, { recursive: true });

    const partialBody = Buffer.from('{"id":"msg_partial","content":', 'utf8');

    const result = await service.finalizeNonSseResponseAuditOnStreamError({
      requestDir,
      bodyBuffer: partialBody,
      totalBytes: 1000,
      maxAuditResponseBytes: 52428800,
      maxBufferBytes: 104857600,
      contentType: 'application/json',
      streamErrorMessage: 'socket hang up',
    });

    expect(result.responseBodyBytesAudited).toBe(partialBody.length);

    // Verificar que se escribió el archivo de omisión con el mensaje de error
    const omittedPath = path.join(requestDir, 'response.body.omitted.txt');
    const omitted = await fs.readFile(omittedPath, 'utf8');
    expect(omitted).toContain('Stream error: socket hang up');
    expect(omitted).toContain('Total bytes received from upstream before error: 1000');
  });
});
