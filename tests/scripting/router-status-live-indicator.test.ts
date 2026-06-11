import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildStatuslineOutput, type ClaudeSettingsEnv } from '../../scripting/router-status.js';
import {
  setClaudeSettingsPathForTests,
  writeClaudeSettings,
} from '../../scripting/shared/claude-settings.js';

describe('indicador live en cabecera de Tabla 2', () => {
  let sessionsRoot: string;
  let settingsPath: string;

  afterEach(() => {
    setClaudeSettingsPathForTests(undefined);
    if (sessionsRoot) rmSync(sessionsRoot, { recursive: true, force: true });
    if (settingsPath) rmSync(settingsPath, { force: true });
  });

  function prepareSettings(refreshInterval?: number): void {
    settingsPath = join(mkdtempSync(join(tmpdir(), 'live-indicator-settings-')), 'settings.json');
    setClaudeSettingsPathForTests(settingsPath);
    writeClaudeSettings({
      statusLine: refreshInterval !== undefined ? { refreshInterval } : {},
    });
  }

  function routerDetailsOn(): ClaudeSettingsEnv {
    return { SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS: 'on' };
  }

  it('muestra ● live (3s) cuando refreshInterval es 3', () => {
    prepareSettings(3);
    sessionsRoot = mkdtempSync(join(tmpdir(), 'live-indicator-sessions-'));
    const out = buildStatuslineOutput({}, routerDetailsOn(), { sessionsRoot });
    expect(out).toContain('● live (3s)');
  });

  it('no muestra el sufijo cuando refreshInterval está ausente', () => {
    prepareSettings();
    sessionsRoot = mkdtempSync(join(tmpdir(), 'live-indicator-sessions-'));
    const out = buildStatuslineOutput({}, routerDetailsOn(), { sessionsRoot });
    expect(out).not.toContain('● live');
  });

  it('no muestra el sufijo cuando Tabla 2 está oculta', () => {
    prepareSettings(3);
    sessionsRoot = mkdtempSync(join(tmpdir(), 'live-indicator-sessions-'));
    const out = buildStatuslineOutput({}, {}, { sessionsRoot });
    expect(out).not.toContain('● live');
    expect(out).not.toContain('Trabajo por niveles de razonamiento');
  });
});
