import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { AuditWriterService } from '../src/services/audit-writer.service.js';
import { RedactService } from '../src/services/redact.service.js';
import { MarkdownRendererService } from '../src/services/markdown-renderer.service.js';

describe('AuditWriterService - appendSseLine (síncrono)', () => {
  let tempDir: string;
  let service: AuditWriterService;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `scp-test-sse-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    const redactService = new RedactService();
    const markdownRenderer = new MarkdownRendererService();
    service = new AuditWriterService(redactService, markdownRenderer);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('debería escribir líneas SSE de forma síncrona', async () => {
    service.appendSseLine(tempDir, { i: 1, ts: '2026-01-01T00:00:00Z', line: 'data: test1' });
    service.appendSseLine(tempDir, { i: 2, ts: '2026-01-01T00:00:01Z', line: 'data: test2' });

    const content = await fs.readFile(path.join(tempDir, 'response.sse.jsonl'), 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).line).toBe('data: test1');
    expect(JSON.parse(lines[1]).line).toBe('data: test2');
  });
});

describe('AuditWriterService - writeFormattedAndMarkdown semántico', () => {
  let tempDir: string;
  let service: AuditWriterService;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `scp-test-md-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    const redactService = new RedactService();
    const markdownRenderer = new MarkdownRendererService();
    service = new AuditWriterService(redactService, markdownRenderer);
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
            {
              type: 'tool_use',
              id: 'toolu_abc',
              name: 'read_file',
              input: { path: '/test.ts' },
            },
          ],
        },
      ],
    };
    await service.writeFormattedAndMarkdown(tempDir, 'request.body', parsed, 'request');

    const md = await fs.readFile(path.join(tempDir, 'request.body.parsed.md'), 'utf8');
    expect(md).toContain('**tool:** read_file');
    expect(md).toContain('**id:** `toolu_abc`');
  });

  it('debería generar markdown semántico para respuesta con thinking', async () => {
    const parsed = {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-3-5-sonnet-20241022',
      stop_reason: 'end_turn',
      content: [
        {
          type: 'thinking',
          thinking: 'Analizando el problema...',
          signature: 'x'.repeat(50),
        },
      ],
    };
    await service.writeFormattedAndMarkdown(tempDir, 'response.body', parsed, 'response');

    const md = await fs.readFile(path.join(tempDir, 'response.body.parsed.md'), 'utf8');
    expect(md).toContain('thinking');
    expect(md).toContain('_(signature: 50 chars)_');
    expect(md).toContain('Analizando el problema...');
  });
});
