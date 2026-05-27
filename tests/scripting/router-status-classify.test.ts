import { describe, it, expect } from 'vitest';
import {
  classifyModelWithEnv,
  type ClaudeSettingsEnv,
} from '../../scripting/router-status.js';

const configuredEnv: ClaudeSettingsEnv = {
  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'm1-haiku',
  ANTHROPIC_DEFAULT_SONNET_MODEL: 'm2-sonnet',
  ANTHROPIC_DEFAULT_OPUS_MODEL: 'm3-opus',
};

describe('classifyModelWithEnv', () => {
  it('clasifica por inclusión del modelId configurado (haiku → lite)', () => {
    expect(classifyModelWithEnv('provider/m1-haiku', configuredEnv)).toBe('lite');
  });

  it('clasifica opus antes que sonnet (reasoning)', () => {
    expect(classifyModelWithEnv('x/m3-opus', configuredEnv)).toBe('reasoning');
  });

  it('clasifica sonnet como standard', () => {
    expect(classifyModelWithEnv('x/m2-sonnet', configuredEnv)).toBe('standard');
  });

  it('devuelve null si el modelId no coincide con ningún modelo configurado', () => {
    expect(classifyModelWithEnv('unknown-model', configuredEnv)).toBeNull();
  });

  it('prioriza opus sobre sonnet si el id incluye ambos substrings', () => {
    expect(classifyModelWithEnv('combo-m3-opus-m2-sonnet', configuredEnv)).toBe('reasoning');
  });

  it('devuelve null si las variables ANTHROPIC_DEFAULT_* están vacías', () => {
    expect(classifyModelWithEnv('any-model', {})).toBeNull();
    expect(
      classifyModelWithEnv('haiku-like-name', {
        ANTHROPIC_DEFAULT_HAIKU_MODEL: '',
        ANTHROPIC_DEFAULT_SONNET_MODEL: '',
        ANTHROPIC_DEFAULT_OPUS_MODEL: '',
      }),
    ).toBeNull();
  });
});
