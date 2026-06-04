import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  coerceMetricNumber,
  aggregateSessionMetrics,
  type ClaudeSettingsEnv,
} from '../../scripting/router-status.js';

const configuredEnv: ClaudeSettingsEnv = {
  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'm1-haiku',
  ANTHROPIC_DEFAULT_SONNET_MODEL: 'm2-sonnet',
  ANTHROPIC_DEFAULT_OPUS_MODEL: 'm3-opus',
};

const routingPath = join(process.cwd(), 'routing', 'providers');

describe('coerceMetricNumber', () => {
  it('devuelve 0 para null, undefined y no numérico', () => {
    expect(coerceMetricNumber(null)).toBe(0);
    expect(coerceMetricNumber(undefined)).toBe(0);
    expect(coerceMetricNumber('x')).toBe(0);
    expect(coerceMetricNumber(NaN)).toBe(0);
  });

  it('devuelve el número finito', () => {
    expect(coerceMetricNumber(42)).toBe(42);
  });
});

describe('aggregateSessionMetrics', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  function sessionDir(): string {
    tempDir = mkdtempSync(join(tmpdir(), 'router-status-metrics-'));
    return tempDir;
  }

  it('retorna ceros si session-metrics.json no existe', () => {
    const dir = sessionDir();
    const m = aggregateSessionMetrics(dir, configuredEnv, routingPath);
    expect(m.lite.count).toBe(0);
    expect(m.standard.inputTokens).toBe(0);
    expect(m.reasoning.outputTokens).toBe(0);
  });

  it('retorna ceros si session-metrics.json está malformado', () => {
    const dir = sessionDir();
    writeFileSync(join(dir, 'session-metrics.json'), '{ invalid', 'utf-8');
    const m = aggregateSessionMetrics(dir, configuredEnv, routingPath);
    expect(m.lite.count).toBe(0);
  });

  it('no suma modelId sin coincidencia en ANTHROPIC_DEFAULT_*', () => {
    const dir = sessionDir();
    writeFileSync(
      join(dir, 'session-metrics.json'),
      JSON.stringify({
        models: {
          'unknown-model': {
            count: 99,
            inputTokens: 1000,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            outputTokens: 500,
          },
        },
      }),
      'utf-8',
    );
    const m = aggregateSessionMetrics(dir, configuredEnv, routingPath);
    expect(m.lite.count + m.standard.count + m.reasoning.count).toBe(0);
  });

  it('trata cacheReadInputTokens null como 0 (§10)', () => {
    const dir = sessionDir();
    writeFileSync(
      join(dir, 'session-metrics.json'),
      JSON.stringify({
        models: {
          'provider/m1-haiku': {
            count: 1,
            inputTokens: 100,
            cacheReadInputTokens: null,
            cacheCreationInputTokens: 0,
            outputTokens: 50,
          },
        },
      }),
      'utf-8',
    );
    const m = aggregateSessionMetrics(dir, configuredEnv, routingPath);
    expect(m.lite.cacheReadInputTokens).toBe(0);
    expect(m.lite.inputTokens).toBe(100);
    expect(Number.isNaN(m.lite.cacheReadInputTokens)).toBe(false);
  });

  it('acumula con contadores snake_case (esquema G4 §33.2)', () => {
    const dir = sessionDir();
    writeFileSync(
      join(dir, 'session-metrics.json'),
      JSON.stringify({
        models: {
          'provider/m1-haiku': {
            count: 2,
            input_tokens: 300,
            cache_read_input_tokens: 50,
            cache_creation_input_tokens: 0,
            output_tokens: 120,
          },
        },
      }),
      'utf-8',
    );
    const m = aggregateSessionMetrics(dir, configuredEnv, routingPath);
    expect(m.lite.count).toBe(2);
    expect(m.lite.inputTokens).toBe(300);
    expect(m.lite.cacheReadInputTokens).toBe(50);
    expect(m.lite.outputTokens).toBe(120);
  });

  it('acumula en el nivel correcto cuando el modelId coincide', () => {
    const dir = sessionDir();
    writeFileSync(
      join(dir, 'session-metrics.json'),
      JSON.stringify({
        models: {
          'provider/m2-sonnet': {
            count: 3,
            inputTokens: 200,
            cacheReadInputTokens: 10,
            cacheCreationInputTokens: 0,
            outputTokens: 80,
          },
        },
      }),
      'utf-8',
    );
    const m = aggregateSessionMetrics(dir, configuredEnv, routingPath);
    expect(m.standard.count).toBe(3);
    expect(m.standard.inputTokens).toBe(200);
    expect(m.standard.cacheReadInputTokens).toBe(10);
  });

  it('retorna ceros para directorio de sesión inexistente (sin metrics file)', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'router-status-metrics-empty-'));
    const missingSession = join(tempDir, 'no-such-session');
    mkdirSync(tempDir, { recursive: true });
    const m = aggregateSessionMetrics(missingSession, configuredEnv, routingPath);
    expect(m.lite.count).toBe(0);
  });

  it('lee workflow_count y lo acumula en workflowCount', () => {
    const dir = sessionDir();
    writeFileSync(
      join(dir, 'session-metrics.json'),
      JSON.stringify({
        models: {
          'provider/m2-sonnet': {
            count: 4,
            workflow_count: 2,
            input_tokens: 500,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
            output_tokens: 100,
          },
        },
      }),
      'utf-8',
    );
    const m = aggregateSessionMetrics(dir, configuredEnv, routingPath);
    expect(m.standard.workflowCount).toBe(2);
  });

  it('workflow_count ausente en JSON → workflowCount === 0', () => {
    const dir = sessionDir();
    writeFileSync(
      join(dir, 'session-metrics.json'),
      JSON.stringify({
        models: {
          'provider/m2-sonnet': {
            count: 3,
            input_tokens: 200,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
            output_tokens: 80,
          },
        },
      }),
      'utf-8',
    );
    const m = aggregateSessionMetrics(dir, configuredEnv, routingPath);
    expect(m.standard.workflowCount).toBe(0);
  });

  it('fallback heurístico: clasifica modelos estándar de Anthropic cuando vars están ausentes', () => {
    const dir = sessionDir();
    writeFileSync(
      join(dir, 'session-metrics.json'),
      JSON.stringify({
        models: {
          'claude-sonnet-4-6': {
            count: 5,
            inputTokens: 1000,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            outputTokens: 300,
          },
          'claude-haiku-4-5-20251001': {
            count: 3,
            inputTokens: 400,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            outputTokens: 100,
          },
        },
      }),
      'utf-8',
    );
    const m = aggregateSessionMetrics(dir, {}, routingPath);
    expect(m.standard.count).toBe(5);
    expect(m.lite.count).toBe(3);
    expect(m.reasoning.count).toBe(0);
    expect(m.standard.inputTokens).toBe(1000);
    expect(m.lite.inputTokens).toBe(400);
  });
});
