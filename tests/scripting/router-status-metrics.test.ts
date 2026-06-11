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

function canonicalMetrics(overrides: Record<string, unknown> = {}) {
  return {
    models: {
      'provider/m1-haiku': {
        billable_hops: 2,
        finalized_runs: 0,
        input_tokens: 300,
        cache_read_input_tokens: 50,
        cache_creation_input_tokens: 0,
        output_tokens: 120,
      },
    },
    session_totals: {
      billable_hops: 2,
      finalized_runs: 0,
      input_tokens: 300,
      output_tokens: 120,
      cache_read_input_tokens: 50,
      cache_creation_input_tokens: 0,
    },
    ...overrides,
  };
}

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
    expect(m.lite.billableHops).toBe(0);
    expect(m.standard.inputTokens).toBe(0);
    expect(m.reasoning.outputTokens).toBe(0);
    expect(m.sessionTotals.finalizedRuns).toBe(0);
  });

  it('retorna ceros si session-metrics.json está malformado', () => {
    const dir = sessionDir();
    writeFileSync(join(dir, 'session-metrics.json'), '{ invalid', 'utf-8');
    const m = aggregateSessionMetrics(dir, configuredEnv, routingPath);
    expect(m.lite.billableHops).toBe(0);
  });

  it('retorna ceros para JSON solo G4 (count/workflow_count sin billable_hops)', () => {
    const dir = sessionDir();
    writeFileSync(
      join(dir, 'session-metrics.json'),
      JSON.stringify({
        models: {
          'provider/m1-haiku': {
            count: 99,
            workflow_count: 2,
            input_tokens: 1000,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
            output_tokens: 500,
          },
        },
        session_totals: { total_steps: 99, total_workflows: 2 },
      }),
      'utf-8',
    );
    const m = aggregateSessionMetrics(dir, configuredEnv, routingPath);
    expect(m.lite.billableHops + m.standard.billableHops + m.reasoning.billableHops).toBe(0);
    expect(m.sessionTotals.billableHops).toBe(0);
  });

  it('no suma modelId sin coincidencia en ANTHROPIC_DEFAULT_*', () => {
    const dir = sessionDir();
    writeFileSync(
      join(dir, 'session-metrics.json'),
      JSON.stringify(
        canonicalMetrics({
          models: {
            'unknown-model': {
              billable_hops: 99,
              finalized_runs: 1,
              input_tokens: 1000,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
              output_tokens: 500,
            },
          },
        }),
      ),
      'utf-8',
    );
    const m = aggregateSessionMetrics(dir, configuredEnv, routingPath);
    expect(m.lite.billableHops + m.standard.billableHops + m.reasoning.billableHops).toBe(0);
  });

  it('trata cache_read_input_tokens null como 0 (§10)', () => {
    const dir = sessionDir();
    writeFileSync(
      join(dir, 'session-metrics.json'),
      JSON.stringify(
        canonicalMetrics({
          models: {
            'provider/m1-haiku': {
              billable_hops: 1,
              finalized_runs: 0,
              input_tokens: 100,
              cache_read_input_tokens: null,
              cache_creation_input_tokens: 0,
              output_tokens: 50,
            },
          },
        }),
      ),
      'utf-8',
    );
    const m = aggregateSessionMetrics(dir, configuredEnv, routingPath);
    expect(m.lite.cacheReadInputTokens).toBe(0);
    expect(m.lite.inputTokens).toBe(100);
    expect(Number.isNaN(m.lite.cacheReadInputTokens)).toBe(false);
  });

  it('acumula billable_hops y tokens del schema canónico', () => {
    const dir = sessionDir();
    writeFileSync(join(dir, 'session-metrics.json'), JSON.stringify(canonicalMetrics()), 'utf-8');
    const m = aggregateSessionMetrics(dir, configuredEnv, routingPath);
    expect(m.lite.billableHops).toBe(2);
    expect(m.lite.inputTokens).toBe(300);
    expect(m.lite.cacheReadInputTokens).toBe(50);
    expect(m.lite.outputTokens).toBe(120);
  });

  it('acumula en el nivel correcto cuando el modelId coincide', () => {
    const dir = sessionDir();
    writeFileSync(
      join(dir, 'session-metrics.json'),
      JSON.stringify(
        canonicalMetrics({
          models: {
            'provider/m2-sonnet': {
              billable_hops: 3,
              finalized_runs: 1,
              input_tokens: 200,
              cache_read_input_tokens: 10,
              cache_creation_input_tokens: 0,
              output_tokens: 80,
            },
          },
          session_totals: {
            billable_hops: 3,
            finalized_runs: 1,
            input_tokens: 200,
            output_tokens: 80,
            cache_read_input_tokens: 10,
            cache_creation_input_tokens: 0,
          },
        }),
      ),
      'utf-8',
    );
    const m = aggregateSessionMetrics(dir, configuredEnv, routingPath);
    expect(m.standard.billableHops).toBe(3);
    expect(m.standard.finalizedRuns).toBe(1);
    expect(m.standard.inputTokens).toBe(200);
    expect(m.standard.cacheReadInputTokens).toBe(10);
  });

  it('retorna ceros para directorio de sesión inexistente (sin metrics file)', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'router-status-metrics-empty-'));
    const missingSession = join(tempDir, 'no-such-session');
    mkdirSync(tempDir, { recursive: true });
    const m = aggregateSessionMetrics(missingSession, configuredEnv, routingPath);
    expect(m.lite.billableHops).toBe(0);
  });

  it('deriva el total de finalized_runs de la suma de niveles, no de session_totals', () => {
    const dir = sessionDir();
    writeFileSync(
      join(dir, 'session-metrics.json'),
      JSON.stringify(
        canonicalMetrics({
          models: {
            'provider/m2-sonnet': {
              billable_hops: 4,
              finalized_runs: 2,
              input_tokens: 500,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
              output_tokens: 100,
            },
          },
          session_totals: {
            billable_hops: 4,
            finalized_runs: 1,
            input_tokens: 500,
            output_tokens: 100,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        }),
      ),
      'utf-8',
    );
    const m = aggregateSessionMetrics(dir, configuredEnv, routingPath);
    expect(m.standard.finalizedRuns).toBe(2);
    // session_totals.finalized_runs (1) difiere de la suma por nivel (2):
    // gana la suma de niveles para que la tabla sea internamente consistente.
    expect(m.sessionTotals.finalizedRuns).toBe(2);
  });

  it('fallback heurístico: clasifica modelos estándar de Anthropic cuando vars están ausentes', () => {
    const dir = sessionDir();
    writeFileSync(
      join(dir, 'session-metrics.json'),
      JSON.stringify({
        models: {
          'claude-sonnet-4-6': {
            billable_hops: 5,
            finalized_runs: 0,
            input_tokens: 1000,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
            output_tokens: 300,
          },
          'claude-haiku-4-5-20251001': {
            billable_hops: 3,
            finalized_runs: 0,
            input_tokens: 400,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
            output_tokens: 100,
          },
        },
        session_totals: {
          billable_hops: 8,
          finalized_runs: 0,
          input_tokens: 1400,
          output_tokens: 400,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      }),
      'utf-8',
    );
    const m = aggregateSessionMetrics(dir, {}, routingPath);
    expect(m.standard.billableHops).toBe(5);
    expect(m.lite.billableHops).toBe(3);
    expect(m.reasoning.billableHops).toBe(0);
    expect(m.standard.inputTokens).toBe(1000);
    expect(m.lite.inputTokens).toBe(400);
  });
});
