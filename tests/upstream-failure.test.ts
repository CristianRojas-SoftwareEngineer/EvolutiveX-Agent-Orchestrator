import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { AuditWriterService } from '../src/services/audit-writer.service.js';
import { RedactService } from '../src/services/redact.service.js';
import { MarkdownRendererService } from '../src/services/markdown-renderer.service.js';

describe('AuditWriterService - writeUpstreamFailureMeta', () => {
  let tempDir: string;
  let service: AuditWriterService;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `scp-test-upstream-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    const redactService = new RedactService();
    const markdownRenderer = new MarkdownRendererService();
    service = new AuditWriterService(redactService, markdownRenderer);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('debería escribir meta.json con upstreamError: true cuando falla la conexión', async () => {
    const requestDir = path.join(tempDir, 'test-request');
    await fs.mkdir(requestDir, { recursive: true });

    const err = new Error('connect ECONNREFUSED 127.0.0.1:443') as Error & { code?: string };
    err.code = 'ECONNREFUSED';

    await service.writeUpstreamFailureMeta(requestDir, {
      requestId: 'test-uuid-123',
      requestSequence: 1,
      auditSessionId: 'test-session',
      err,
      requestStartTime: Date.now() - 100,
      upstream: 'https://api.anthropic.com',
      method: 'POST',
      url: '/v1/messages',
      requestBodyBytes: 512,
      requestBodyOmitted: false,
    });

    const metaPath = path.join(requestDir, 'meta.json');
    const metaRaw = await fs.readFile(metaPath, 'utf8');
    const meta = JSON.parse(metaRaw);

    expect(meta.responseReceived).toBe(false);
    expect(meta.upstreamError).toBe(true);
    expect(meta.errorMessage).toContain('ECONNREFUSED');
    expect(meta.errorCode).toBe('ECONNREFUSED');
    expect(meta.statusCode).toBeNull();
    expect(meta.sse).toBe(false);
    expect(meta.responseBodyComplete).toBe(false);
    expect(meta.truncation.requestBodyOmitted).toBe(false);
    expect(meta.truncation.responseBodyBytesTotal).toBeNull();
  });
});
