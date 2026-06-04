import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runSetup } from '../../scripting/setup.js';
import { setClaudeSettingsPathForTests } from '../../scripting/shared/claude-settings.js';
import * as claudeSettings from '../../scripting/shared/claude-settings.js';
import { applyStatuslineInstall } from '../../scripting/install-statusline.js';
import { applyNotificationsInstall } from '../../scripting/install-notifications.js';
import { applyVoiceInstall } from '../../scripting/install-voice.js';
import { createValidProxyRoot } from './helpers/proxy-root-fixture.js';
import { resolvePosixAbsolutePath } from '../../scripting/shared/npx-tsx-command.js';

const DEFAULT_OPTS = {
  statusline: false,
  notifications: false,
  voice: false,
  voiceMode: 'hold' as const,
  voiceAutoSubmit: true,
  uninstall: false,
  dryRun: false,
  force: false,
};

describe('runSetup — integración', () => {
  let proxyRoot: string;
  let settingsDir: string;
  let settingsPath: string;
  const initialSettings = { env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:8787' } };

  beforeEach(() => {
    settingsDir = mkdtempSync(join(tmpdir(), 'setup-settings-'));
    settingsPath = join(settingsDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify(initialSettings, null, 2), 'utf-8');
    setClaudeSettingsPathForTests(settingsPath);
    proxyRoot = createValidProxyRoot({ prefix: 'setup-' });
  });

  afterEach(() => {
    setClaudeSettingsPathForTests(undefined);
    if (proxyRoot) rmSync(proxyRoot, { recursive: true, force: true });
    if (settingsDir) rmSync(settingsDir, { recursive: true, force: true });
  });

  it('install total instala statusline, notificaciones y voz', () => {
    const code = runSetup({ ...DEFAULT_OPTS, root: proxyRoot });
    expect(code).toBe(0);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    expect(onDisk['statusLine']).toBeDefined();
    expect(onDisk['hooks']).toBeDefined();
    expect(onDisk['voiceEnabled']).toBe(true);
    expect(onDisk['voice']).toBeDefined();
  });

  it('install selectivo --voice solo toca voz, no statusline ni hooks', () => {
    const beforeInstall = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    expect(beforeInstall['statusLine']).toBeUndefined();
    expect(beforeInstall['hooks']).toBeUndefined();

    const code = runSetup({ ...DEFAULT_OPTS, root: proxyRoot, voice: true });
    expect(code).toBe(0);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    expect(onDisk['statusLine']).toBeUndefined();
    expect(onDisk['hooks']).toBeUndefined();
    expect(onDisk['voiceEnabled']).toBe(true);
  });

  it('uninstall total elimina statusline, hooks y voz', () => {
    runSetup({ ...DEFAULT_OPTS, root: proxyRoot });
    const code = runSetup({ ...DEFAULT_OPTS, root: proxyRoot, uninstall: true });
    expect(code).toBe(0);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    expect(onDisk['statusLine']).toBeUndefined();
    expect(onDisk['hooks']).toBeUndefined();
    expect(onDisk['voiceEnabled']).toBeUndefined();
    expect(onDisk['voice']).toBeUndefined();
  });

  it('uninstall selectivo --voice conserva statusline y hooks', () => {
    runSetup({ ...DEFAULT_OPTS, root: proxyRoot });
    const code = runSetup({ ...DEFAULT_OPTS, root: proxyRoot, voice: true, uninstall: true });
    expect(code).toBe(0);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    expect(onDisk['statusLine']).toBeDefined();
    expect(onDisk['hooks']).toBeDefined();
    expect(onDisk['voiceEnabled']).toBeUndefined();
    expect(onDisk['voice']).toBeUndefined();
  });

  it('dry-run no modifica settings.json en disco', () => {
    const code = runSetup({ ...DEFAULT_OPTS, root: proxyRoot, dryRun: true });
    expect(code).toBe(0);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8')) as typeof initialSettings;
    expect(onDisk).toEqual(initialSettings);
  });

  it('force sobre statusLine ajeno lo sobrescribe', () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({ statusLine: { type: 'command', command: 'echo other', padding: 0 } }, null, 2),
      'utf-8',
    );
    const blocked = runSetup({ ...DEFAULT_OPTS, root: proxyRoot, force: false });
    expect(blocked).toBe(1);

    const forced = runSetup({ ...DEFAULT_OPTS, root: proxyRoot, force: true });
    expect(forced).toBe(0);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    const sl = onDisk['statusLine'] as Record<string, unknown>;
    expect(sl['command']).toContain('router-status.ts');
  });

  it('--root alternativo válido instala correctamente', () => {
    const altRoot = createValidProxyRoot({ prefix: 'setup-alt-' });
    try {
      const code = runSetup({ ...DEFAULT_OPTS, root: altRoot });
      expect(code).toBe(0);
      const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
      expect(onDisk['statusLine']).toBeDefined();
      const sl = onDisk['statusLine'] as Record<string, unknown>;
      expect(sl['command']).toContain(resolvePosixAbsolutePath(altRoot));
    } finally {
      rmSync(altRoot, { recursive: true, force: true });
    }
  });

  it('resultado deep-equal al encadenamiento de apply* sobre mismo input', () => {
    const initial = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;

    runSetup({ ...DEFAULT_OPTS, root: proxyRoot });
    const fromSetup = JSON.parse(readFileSync(settingsPath, 'utf-8'));

    writeFileSync(settingsPath, JSON.stringify(initial, null, 2), 'utf-8');
    let manual = initial as Parameters<typeof applyStatuslineInstall>[0];
    const s1 = applyStatuslineInstall(manual, proxyRoot, false);
    if ('error' in s1) throw new Error(String(s1.error));
    manual = s1;
    const s2 = applyNotificationsInstall(manual, proxyRoot, false);
    if ('error' in s2) throw new Error(String(s2.error));
    manual = s2;
    manual = applyVoiceInstall(manual, { mode: 'hold', autoSubmit: true });

    expect(fromSetup).toEqual(manual);
  });
});

describe('runSetup — lectura/escritura única', () => {
  let proxyRoot: string;
  let settingsDir: string;
  let settingsPath: string;

  beforeEach(() => {
    settingsDir = mkdtempSync(join(tmpdir(), 'setup-spy-'));
    settingsPath = join(settingsDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({}), 'utf-8');
    setClaudeSettingsPathForTests(settingsPath);
    proxyRoot = createValidProxyRoot({ prefix: 'setup-spy-' });
  });

  afterEach(() => {
    setClaudeSettingsPathForTests(undefined);
    vi.restoreAllMocks();
    if (proxyRoot) rmSync(proxyRoot, { recursive: true, force: true });
    if (settingsDir) rmSync(settingsDir, { recursive: true, force: true });
  });

  it('invoca readClaudeSettings y writeClaudeSettings exactamente una vez', () => {
    const readSpy = vi.spyOn(claudeSettings, 'readClaudeSettings');
    const writeSpy = vi.spyOn(claudeSettings, 'writeClaudeSettings');

    runSetup({ ...DEFAULT_OPTS, root: proxyRoot });

    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });
});
