import { describe, it, expect } from 'vitest';
import { buildClaudeHeadlessArgs } from '../../scripting/headless-session/run-claude.js';

describe('buildClaudeHeadlessArgs', () => {
  it('pasa el prompt como un solo argumento -p (comas no parten el comando)', () => {
    const prompt = 'Hola, resume en una frase qué dices';
    const args = buildClaudeHeadlessArgs(prompt);

    expect(args[0]).toBe('-p');
    expect(args[1]).toBe(prompt);
    expect(args).toContain('--model');
    expect(args).toContain('haiku');
    expect(args).toContain('--max-turns');
    expect(args).toContain('1');
    expect(args).toContain('--output-format');
    expect(args).toContain('json');
  });

  it('sin env no añade --settings', () => {
    const args = buildClaudeHeadlessArgs('hola');
    expect(args).not.toContain('--settings');
  });

  it('con env inyecta --settings con bloque env JSON (precedencia sobre settings.json)', () => {
    const env = { ANTHROPIC_BASE_URL: 'http://127.0.0.1:8788', ANTHROPIC_AUTH_TOKEN: '' };
    const args = buildClaudeHeadlessArgs('hola', env);
    const idx = args.indexOf('--settings');
    expect(idx).toBeGreaterThan(-1);
    expect(JSON.parse(args[idx + 1]!)).toEqual({ env });
  });
});
