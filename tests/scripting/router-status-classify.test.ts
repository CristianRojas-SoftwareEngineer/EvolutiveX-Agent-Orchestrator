import { describe, it, expect } from 'vitest';
import { classifyModelWithEnv, type ClaudeSettingsEnv } from '../../scripting/router-status.js';

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

  it('devuelve null si el modelId no contiene términos conocidos y vars están vacías', () => {
    expect(classifyModelWithEnv('any-model', {})).toBeNull();
  });
});

describe('fallback heurístico (vars ausentes)', () => {
  it('haiku sin vars → lite', () => {
    expect(classifyModelWithEnv('claude-haiku-4-5-20251001', {})).toBe('lite');
  });

  it('opus sin vars → reasoning', () => {
    expect(classifyModelWithEnv('claude-opus-4-8', {})).toBe('reasoning');
  });

  it('sonnet sin vars → standard', () => {
    expect(classifyModelWithEnv('claude-sonnet-4-6', {})).toBe('standard');
  });

  it('modelo sin término conocido sin vars → null', () => {
    expect(classifyModelWithEnv('minimax-m2-5', {})).toBeNull();
  });

  it('no aplica si alguna var está configurada', () => {
    // sonnet no está vacía → fallback desactivado; 'claude-haiku-4-5' no incluye 'm2'
    expect(
      classifyModelWithEnv('claude-haiku-4-5', {
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'm2',
      }),
    ).toBeNull();
  });

  it('prioridad opus > sonnet en fallback', () => {
    expect(classifyModelWithEnv('claude-opus-4-sonnet', {})).toBe('reasoning');
  });
});
