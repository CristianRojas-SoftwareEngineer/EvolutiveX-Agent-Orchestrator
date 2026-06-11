import { describe, it, expect } from 'vitest';
import { classifyModelWithEnv, type ClaudeSettingsEnv } from '../../scripting/router-status.js';

const configuredEnv: ClaudeSettingsEnv = {
  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'm1-haiku',
  ANTHROPIC_DEFAULT_SONNET_MODEL: 'm2-sonnet',
  ANTHROPIC_DEFAULT_OPUS_MODEL: 'm3-opus',
  ANTHROPIC_DEFAULT_FABLE_MODEL: 'm4-fable',
};

describe('classifyModelWithEnv', () => {
  it('clasifica por inclusión del modelId configurado (haiku → lite)', () => {
    expect(classifyModelWithEnv('provider/m1-haiku', configuredEnv)).toBe('lite');
  });

  it('clasifica fable como frontier', () => {
    expect(classifyModelWithEnv('x/m4-fable', configuredEnv)).toBe('frontier');
  });

  it('clasifica opus antes que sonnet (reasoning)', () => {
    expect(classifyModelWithEnv('x/m3-opus', configuredEnv)).toBe('reasoning');
  });

  it('prioriza fable sobre opus si el id incluye ambos substrings', () => {
    expect(classifyModelWithEnv('combo-m4-fable-m3-opus', configuredEnv)).toBe('frontier');
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

  it('fable sin vars → frontier', () => {
    expect(classifyModelWithEnv('claude-fable-5', {})).toBe('frontier');
  });

  it('opus sin vars → reasoning', () => {
    expect(classifyModelWithEnv('claude-opus-4-8', {})).toBe('reasoning');
  });

  it('mythos sin keyword fable → null', () => {
    expect(classifyModelWithEnv('claude-mythos-5', {})).toBeNull();
  });

  it('sonnet sin vars → standard', () => {
    expect(classifyModelWithEnv('claude-sonnet-4-6', {})).toBe('standard');
  });

  it('modelo sin término conocido sin vars → null', () => {
    expect(classifyModelWithEnv('minimax-m2-5', {})).toBeNull();
  });

  it('prioridad opus > sonnet en fallback', () => {
    expect(classifyModelWithEnv('claude-opus-4-sonnet', {})).toBe('reasoning');
  });
});

describe('fallback heurístico por nivel (configuración parcial)', () => {
  const partialEnv: ClaudeSettingsEnv = { ANTHROPIC_DEFAULT_SONNET_MODEL: 'm2-sonnet' };

  it('haiku clasifica lite por keyword aunque sonnet esté configurada', () => {
    expect(classifyModelWithEnv('claude-haiku-4-5', partialEnv)).toBe('lite');
  });

  it('opus clasifica reasoning por keyword aunque sonnet esté configurada', () => {
    expect(classifyModelWithEnv('claude-opus-4-8', partialEnv)).toBe('reasoning');
  });

  it('sonnet configurada clasifica por match de variable', () => {
    expect(classifyModelWithEnv('provider/m2-sonnet', partialEnv)).toBe('standard');
  });

  it('modelo sin keyword ni match de variable → null', () => {
    expect(classifyModelWithEnv('minimax-m2-5', partialEnv)).toBeNull();
  });
});
