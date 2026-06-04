import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
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
            count: 1,
            inputTokens: 10,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            outputTokens: 5,
          },
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
            count: 2,
            inputTokens: 100,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            outputTokens: 20,
          },
        },
      }),
      'utf-8',
    );
    writeFileSync(
      join(sessionDir, '.statusline-state.json'),
      JSON.stringify({
        metricsSnapshot: {
          lite: { count: 1, inputTokens: 50, cacheReadInputTokens: 0, outputTokens: 10 },
          standard: { count: 0, inputTokens: 0, cacheReadInputTokens: 0, outputTokens: 0 },
          reasoning: { count: 0, inputTokens: 0, cacheReadInputTokens: 0, outputTokens: 0 },
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

  it('oculta Tabla 2 cuando SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS = "off"', () => {
    const settings: ClaudeSettingsEnv = { SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS: 'off' };
    const out = buildStatuslineOutput({}, settings, { sessionsRoot: emptySessionsRoot() });
    expect(out).toContain('Sesión actual');
    expect(out).not.toContain('Trabajo por niveles de razonamiento');
  });
});
