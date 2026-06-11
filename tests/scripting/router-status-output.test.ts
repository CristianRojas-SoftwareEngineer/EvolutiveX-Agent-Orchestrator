import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildStatuslineOutput,
  resolveAuthMethodFromEnv,
  type ClaudeCodeContext,
  type ClaudeSettingsEnv,
} from '../../scripting/router-status.js';

const rateLimitsCtx: ClaudeCodeContext = {
  rate_limits: {
    five_hour: { used_percentage: 60, resets_at: Math.floor(Date.now() / 1000) + 3600 },
  },
};

describe('resolveAuthMethodFromEnv', () => {
  it('resuelve api_key, bearer y oauth', () => {
    expect(resolveAuthMethodFromEnv({ ANTHROPIC_API_KEY: 'k' })).toBe('api_key');
    expect(resolveAuthMethodFromEnv({ ANTHROPIC_AUTH_TOKEN: 't' })).toBe('bearer');
    expect(resolveAuthMethodFromEnv({})).toBe('oauth');
  });
});

describe('buildStatuslineOutput', () => {
  let sessionsRoot: string;

  afterEach(() => {
    if (sessionsRoot) rmSync(sessionsRoot, { recursive: true, force: true });
  });

  function emptySessionsRoot(): string {
    sessionsRoot = mkdtempSync(join(tmpdir(), 'router-status-out-'));
    return sessionsRoot;
  }

  it('muestra Tabla 1 y Tabla 2 side-by-side sin session_id ni carpeta (§3.2)', () => {
    const settings: ClaudeSettingsEnv = { SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS: 'on' };
    const out = buildStatuslineOutput({}, settings, { sessionsRoot: emptySessionsRoot() });
    expect(out).toContain('Sesión actual');
    expect(out).toContain('Trabajo por niveles de razonamiento');
  });

  // api_key y bearer comparten layout; solo oauth activa Tabla 3 (§3.3).
  it('no muestra rate limits con api_key aunque ctx traiga rate_limits', () => {
    const settings: ClaudeSettingsEnv = { ANTHROPIC_API_KEY: 'test-key' };
    const out = buildStatuslineOutput(rateLimitsCtx, settings, {
      sessionsRoot: emptySessionsRoot(),
    });
    expect(out).not.toContain('Límites de uso por suscripción');
  });

  it('no muestra rate limits con bearer aunque ctx traiga rate_limits', () => {
    const settings: ClaudeSettingsEnv = { ANTHROPIC_AUTH_TOKEN: 'test-token' };
    const out = buildStatuslineOutput(rateLimitsCtx, settings, {
      sessionsRoot: emptySessionsRoot(),
    });
    expect(out).not.toContain('Límites de uso por suscripción');
  });

  it('muestra rate limits con oauth y rate_limits en ctx', () => {
    const out = buildStatuslineOutput(rateLimitsCtx, {}, { sessionsRoot: emptySessionsRoot() });
    expect(out).toContain('Límites de uso por suscripción');
    expect(out).toContain('Cuota actual (5h)');
  });

  it('usa contextUsagePercentage de caché si stdin no trae used_percentage', () => {
    const root = emptySessionsRoot();
    const sessionId = 'cache-ctx-test';
    const sessionDir = join(root, `${sessionId}-suffix`);
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(
      join(sessionDir, '.statusline-state.json'),
      JSON.stringify({ contextUsagePercentage: 55 }),
      'utf-8',
    );

    const out = buildStatuslineOutput(
      { session_id: sessionId, context_window: { context_window_size: 200000 } },
      {},
      { sessionsRoot: root },
    );
    expect(out).toContain('55%');
  });

  it('ignora caché corrupta y no lanza', () => {
    const root = emptySessionsRoot();
    const sessionId = 'bad-cache';
    const sessionDir = join(root, sessionId);
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, '.statusline-state.json'), '{ invalid', 'utf-8');
    writeFileSync(
      join(sessionDir, 'session-metrics.json'),
      JSON.stringify({
        models: {
          'x/m1-haiku': {
            billable_hops: 1,
            finalized_runs: 0,
            input_tokens: 10,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
            output_tokens: 5,
          },
        },
        session_totals: {
          billable_hops: 1,
          finalized_runs: 0,
          input_tokens: 10,
          output_tokens: 5,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      }),
      'utf-8',
    );

    const settings: ClaudeSettingsEnv = {
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'm1-haiku',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'm2-sonnet',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'm3-opus',
    };

    expect(() =>
      buildStatuslineOutput({ session_id: sessionId }, settings, { sessionsRoot: root }),
    ).not.toThrow();
  });

  it('resalta métricas cuando metricsSnapshot difiere del actual', () => {
    const root = emptySessionsRoot();
    const sessionId = 'metrics-diff';
    const sessionDir = join(root, sessionId);
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(
      join(sessionDir, 'session-metrics.json'),
      JSON.stringify({
        models: {
          'p/m1-haiku': {
            billable_hops: 2,
            finalized_runs: 0,
            input_tokens: 100,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
            output_tokens: 20,
          },
        },
        session_totals: {
          billable_hops: 2,
          finalized_runs: 0,
          input_tokens: 100,
          output_tokens: 20,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      }),
      'utf-8',
    );
    writeFileSync(
      join(sessionDir, '.statusline-state.json'),
      JSON.stringify({
        metricsSnapshot: {
          lite: {
            billableHops: 1,
            finalizedRuns: 0,
            inputTokens: 50,
            cacheReadInputTokens: 0,
            outputTokens: 10,
          },
          standard: {
            billableHops: 0,
            finalizedRuns: 0,
            inputTokens: 0,
            cacheReadInputTokens: 0,
            outputTokens: 0,
          },
          reasoning: {
            billableHops: 0,
            finalizedRuns: 0,
            inputTokens: 0,
            cacheReadInputTokens: 0,
            outputTokens: 0,
          },
        },
      }),
      'utf-8',
    );

    const settings: ClaudeSettingsEnv = {
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'm1-haiku',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'm2-sonnet',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'm3-opus',
      SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS: 'on',
    };

    const out = buildStatuslineOutput({ session_id: sessionId }, settings, {
      sessionsRoot: root,
    });
    expect(out).toContain('Lite');
    expect(out).toMatch(/2/);
  });

  it('oculta Tabla 2 cuando SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS está ausente', () => {
    const out = buildStatuslineOutput({}, {}, { sessionsRoot: emptySessionsRoot() });
    expect(out).toContain('Sesión actual');
    expect(out).not.toContain('Trabajo por niveles de razonamiento');
  });

  it('muestra Tabla 2 cuando SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS = "on"', () => {
    const settings: ClaudeSettingsEnv = { SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS: 'on' };
    const out = buildStatuslineOutput({}, settings, { sessionsRoot: emptySessionsRoot() });
    expect(out).toContain('Sesión actual');
    expect(out).toContain('Trabajo por niveles de razonamiento');
  });

  it('Tabla 2 refleja billable_hops per-step con finalized_runs aún en 0', () => {
    const root = emptySessionsRoot();
    const sessionId = 'per-step-mid';
    const sessionDir = join(root, sessionId);
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(
      join(sessionDir, 'session-metrics.json'),
      JSON.stringify({
        models: {
          'p/m1-haiku': {
            billable_hops: 1,
            finalized_runs: 0,
            input_tokens: 42,
            output_tokens: 7,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            cache_efficiency: 0,
          },
        },
        session_totals: {
          input_tokens: 42,
          output_tokens: 7,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          billable_hops: 1,
          finalized_runs: 0,
        },
      }),
      'utf-8',
    );

    const settings: ClaudeSettingsEnv = {
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'm1-haiku',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'm2-sonnet',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'm3-opus',
      SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS: 'on',
    };

    const out = buildStatuslineOutput({ session_id: sessionId }, settings, {
      sessionsRoot: root,
    });
    expect(out).toContain('# Steps');
    expect(out).toMatch(/\b1\b/);
    expect(out).toContain('0');
  });

  it('oculta Tabla 2 cuando SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS = "off"', () => {
    const settings: ClaudeSettingsEnv = { SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS: 'off' };
    const out = buildStatuslineOutput({}, settings, { sessionsRoot: emptySessionsRoot() });
    expect(out).toContain('Sesión actual');
    expect(out).not.toContain('Trabajo por niveles de razonamiento');
  });

  it('segunda invocación con mtime sin cambios produce output idéntico (cierre temprano)', () => {
    const root = emptySessionsRoot();
    const sessionId = 'early-exit-stable';
    const sessionDir = join(root, sessionId);
    mkdirSync(sessionDir, { recursive: true });
    const metricsPath = join(sessionDir, 'session-metrics.json');
    writeFileSync(
      metricsPath,
      JSON.stringify({
        models: {
          'p/m1-haiku': {
            billable_hops: 1,
            finalized_runs: 0,
            input_tokens: 10,
            output_tokens: 5,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
        session_totals: {
          billable_hops: 1,
          finalized_runs: 0,
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      }),
      'utf-8',
    );

    const settings: ClaudeSettingsEnv = {
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'm1-haiku',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'm2-sonnet',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'm3-opus',
      SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS: 'on',
    };

    const ctx: ClaudeCodeContext = { session_id: sessionId };
    const first = buildStatuslineOutput(ctx, settings, { sessionsRoot: root });
    const second = buildStatuslineOutput(ctx, settings, { sessionsRoot: root });
    expect(second).toBe(first);
  });

  it('re-renderiza cuando cambia el mtime de session-metrics.json', () => {
    const root = emptySessionsRoot();
    const sessionId = 'early-exit-mtime-change';
    const sessionDir = join(root, sessionId);
    mkdirSync(sessionDir, { recursive: true });
    const metricsPath = join(sessionDir, 'session-metrics.json');
    writeFileSync(
      metricsPath,
      JSON.stringify({
        models: {
          'p/m1-haiku': {
            billable_hops: 1,
            finalized_runs: 0,
            input_tokens: 10,
            output_tokens: 5,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
        session_totals: {
          billable_hops: 1,
          finalized_runs: 0,
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      }),
      'utf-8',
    );

    const settings: ClaudeSettingsEnv = {
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'm1-haiku',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'm2-sonnet',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'm3-opus',
      SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS: 'on',
    };

    const ctx: ClaudeCodeContext = { session_id: sessionId };
    const first = buildStatuslineOutput(ctx, settings, { sessionsRoot: root });

    writeFileSync(
      metricsPath,
      JSON.stringify({
        models: {
          'p/m1-haiku': {
            billable_hops: 9,
            finalized_runs: 0,
            input_tokens: 10,
            output_tokens: 5,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
        session_totals: {
          billable_hops: 9,
          finalized_runs: 0,
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      }),
      'utf-8',
    );

    const second = buildStatuslineOutput(ctx, settings, { sessionsRoot: root });
    expect(second).not.toBe(first);
    expect(second.split('Totales de sesión')[1] ?? '').toContain('9');
  });

  it('sin session-metrics.json persiste lastRenderedMtimeMs 0 y re-render con caché inválida', () => {
    const root = emptySessionsRoot();
    const sessionId = 'no-metrics-cache';
    const sessionDir = join(root, sessionId);
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, '.statusline-state.json'), '{ invalid', 'utf-8');

    const settings: ClaudeSettingsEnv = {
      SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS: 'on',
    };

    buildStatuslineOutput({ session_id: sessionId }, settings, { sessionsRoot: root });
    const cache = JSON.parse(
      readFileSync(join(sessionDir, '.statusline-state.json'), 'utf-8'),
    ) as { lastRenderedMtimeMs?: number };
    expect(cache.lastRenderedMtimeMs).toBe(0);
  });
});
