import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildStatuslineOutput,
  resolveProjectRoot,
  type ClaudeSettingsEnv,
} from '../../scripting/router-status.js';
import { SMART_CODE_PROXY_ROOT_KEY } from '../../scripting/lib/claude-settings.js';
import { createValidProxyRoot } from './helpers/proxy-root-fixture.js';

const modelSettings: ClaudeSettingsEnv = {
  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'm1-haiku',
  ANTHROPIC_DEFAULT_SONNET_MODEL: 'm2-sonnet',
  ANTHROPIC_DEFAULT_OPUS_MODEL: 'm3-opus',
};

describe('resolveProjectRoot', () => {
  let tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs = [];
  });

  function proxyRepo(): { root: string; cwd: string } {
    const root = createValidProxyRoot({ prefix: 'scp-root-' });
    const cwd = mkdtempSync(join(tmpdir(), 'scp-cwd-'));
    tempDirs.push(root, cwd);
    return { root, cwd: resolve(cwd) };
  }

  it('usa SMART_CODE_PROXY_ROOT cuando routing/providers existe', () => {
    const { root, cwd } = proxyRepo();
    const resolved = resolveProjectRoot({ [SMART_CODE_PROXY_ROOT_KEY]: root }, cwd);
    expect(resolved).toBe(root);
  });

  it('hace fallback a cwd si ROOT apunta a directorio inválido', () => {
    const { cwd } = proxyRepo();
    const invalid = mkdtempSync(join(tmpdir(), 'scp-invalid-'));
    tempDirs.push(invalid);
    const resolved = resolveProjectRoot({ [SMART_CODE_PROXY_ROOT_KEY]: invalid }, cwd);
    expect(resolved).toBe(cwd);
  });

  it('usa cwd si SMART_CODE_PROXY_ROOT está ausente', () => {
    const { cwd } = proxyRepo();
    expect(resolveProjectRoot({}, cwd)).toBe(cwd);
  });

  it('prioriza projectRoot inyectado vía resolveStatuslinePaths (buildStatuslineOutput)', () => {
    const { root, cwd } = proxyRepo();
    const sessionsRoot = mkdtempSync(join(tmpdir(), 'scp-sessions-'));
    tempDirs.push(sessionsRoot);

    const out = buildStatuslineOutput(
      {},
      { [SMART_CODE_PROXY_ROOT_KEY]: join(cwd, 'should-not-use') },
      { projectRoot: root, sessionsRoot },
    );
    expect(out).toContain('Sesión actual');
  });
});

describe('buildStatuslineOutput con ROOT en settingsEnv', () => {
  let tempDirs: string[] = [];
  let originalCwd: string;

  afterEach(() => {
    process.chdir(originalCwd);
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs = [];
  });

  it('lee métricas bajo ROOT del proxy aunque cwd sea otro workspace', () => {
    originalCwd = process.cwd();
    const proxyRoot = createValidProxyRoot({ prefix: 'scp-ws-', withSessionsDir: true });
    const foreignCwd = mkdtempSync(join(tmpdir(), 'scp-foreign-'));
    tempDirs.push(proxyRoot, foreignCwd);

    const sessionId = 'ws-metrics';
    const sessionDir = join(proxyRoot, 'sessions', sessionId);
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

    process.chdir(foreignCwd);

    const settingsEnv: ClaudeSettingsEnv = {
      ...modelSettings,
      [SMART_CODE_PROXY_ROOT_KEY]: proxyRoot,
    };

    const out = buildStatuslineOutput({ session_id: sessionId }, settingsEnv);
    expect(out).toContain('Lite');
    expect(out).toMatch(/2/);
  });
});
