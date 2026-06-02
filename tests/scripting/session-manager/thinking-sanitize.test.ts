import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  countCorruptThinkingBlocks,
  isValidThinkingSignature,
  repairJsonlFile,
} from '../../../scripting/session-manager/shared/thinking-sanitize.js';

describe('thinking-sanitize', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'scp-sanitize-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('valida firmas Anthropic largas', () => {
    expect(isValidThinkingSignature('x'.repeat(344))).toBe(true);
    expect(isValidThinkingSignature('short')).toBe(false);
    expect(isValidThinkingSignature('')).toBe(false);
  });

  it('cuenta y repara bloques thinking inválidos', async () => {
    const path = join(dir, 'sess.jsonl');
    const validSig = 'a'.repeat(220);
    const lines = [
      JSON.stringify({
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 't', signature: 'bad' },
            { type: 'text', text: 'ok' },
          ],
        },
      }),
      JSON.stringify({
        message: {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: 'keep', signature: validSig }],
        },
      }),
      'not-json-but-preserved',
    ];
    writeFileSync(path, lines.join('\n') + '\n', 'utf-8');

    expect(await countCorruptThinkingBlocks(path)).toBe(1);
    const removed = await repairJsonlFile(path);
    expect(removed).toBe(1);
    expect(await countCorruptThinkingBlocks(path)).toBe(0);

    const out = readFileSync(path, 'utf-8');
    expect(out).toContain('not-json-but-preserved');
    expect(out).toContain('keep');
    expect(out).not.toContain('"signature":"bad"');
  });
});
