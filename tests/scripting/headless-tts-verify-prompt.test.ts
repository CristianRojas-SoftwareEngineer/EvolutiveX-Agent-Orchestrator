import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setClaudeDirForTests } from '../../scripting/session-manager/shared/paths.js';
import {
  extractLastUserPrompt,
  verifyPromptInTranscript,
} from '../../scripting/headless-tts-gateway-test/verify-prompt.js';

describe('verify-prompt', () => {
  const fakeClaudeDir = join(tmpdir(), `headless-tts-verify-${Date.now()}`);
  const projectSlug = 'C--Users-Test-Project';
  const transcriptPath = join(fakeClaudeDir, 'projects', projectSlug, 'session-1.jsonl');

  afterEach(() => {
    setClaudeDirForTests(undefined);
    rmSync(fakeClaudeDir, { recursive: true, force: true });
  });

  it('detecta prompt íntegro vía last-prompt', () => {
    setClaudeDirForTests(fakeClaudeDir);
    mkdirSync(join(fakeClaudeDir, 'projects', projectSlug), { recursive: true });
    const expected = 'Hola, resume en una frase qué dices';
    writeFileSync(
      transcriptPath,
      [
        JSON.stringify({ type: 'user', message: { role: 'user', content: 'Hola,' } }),
        JSON.stringify({ type: 'last-prompt', lastPrompt: expected }),
      ].join('\n'),
      'utf-8',
    );

    expect(extractLastUserPrompt(transcriptPath)).toBe(expected);
    expect(verifyPromptInTranscript(transcriptPath, expected)).toBe(true);
    expect(verifyPromptInTranscript(transcriptPath, 'Hola,')).toBe(false);
  });
});
