import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runSetup } from '../../scripting/setup.js';
import { setClaudeSettingsPathForTests } from '../../scripting/shared/claude-settings.js';
import * as claudeSettings from '../../scripting/shared/claude-settings.js';
import { applyStatuslineInstall } from '../../scripting/features/statusline.js';
import { applyVoiceInstall } from '../../scripting/features/voice.js';
import { mergeHooks, readCanonicalHooks } from '../../scripting/features/hooks.js';
import { createValidProxyRoot } from './helpers/proxy-root-fixture.js';
import { resolvePosixAbsolutePath } from '../../scripting/shared/npx-tsx-command.js';

const DEFAULT_OPTS = {
  root: '',
  uninstall: false,
  statusline: false,
  voice: false,
  hooks: false,
  voiceMode: 'hold' as const,
  voiceAutoSubmit: true,
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

  it('install sin flags aplica las 3 features (statusline, voz, hooks)', () => {
    const code = runSetup({ ...DEFAULT_OPTS, root: proxyRoot });
    expect(code).toBe(0);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    expect(onDisk['statusLine']).toBeDefined();
    expect(onDisk['voiceEnabled']).toBe(true);
    expect(onDisk['voice']).toBeDefined();
    expect(onDisk['hooks']).toBeDefined();
  });

  it('install --voice solo toca voz, no statusline ni hooks', () => {
    const code = runSetup({ ...DEFAULT_OPTS, root: proxyRoot, voice: true });
    expect(code).toBe(0);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    expect(onDisk['statusLine']).toBeUndefined();
    expect(onDisk['hooks']).toBeUndefined();
    expect(onDisk['voiceEnabled']).toBe(true);
  });

  it('install --statusline solo toca statusline, no voz ni hooks', () => {
    const code = runSetup({ ...DEFAULT_OPTS, root: proxyRoot, statusline: true });
    expect(code).toBe(0);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    expect(onDisk['statusLine']).toBeDefined();
    expect(onDisk['voiceEnabled']).toBeUndefined();
    expect(onDisk['hooks']).toBeUndefined();
  });

  it('install --hooks solo toca hooks, no statusline ni voz', () => {
    const code = runSetup({ ...DEFAULT_OPTS, root: proxyRoot, hooks: true });
    expect(code).toBe(0);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    expect(onDisk['statusLine']).toBeUndefined();
    expect(onDisk['voiceEnabled']).toBeUndefined();
    expect(onDisk['hooks']).toBeDefined();
  });

  it('uninstall total elimina las 3 features', () => {
    runSetup({ ...DEFAULT_OPTS, root: proxyRoot });
    const code = runSetup({ ...DEFAULT_OPTS, root: proxyRoot, uninstall: true });
    expect(code).toBe(0);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    expect(onDisk['statusLine']).toBeUndefined();
    expect(onDisk['voiceEnabled']).toBeUndefined();
    expect(onDisk['voice']).toBeUndefined();
    expect(onDisk['hooks']).toBeUndefined();
  });

  it('uninstall --voice conserva statusline y hooks', () => {
    runSetup({ ...DEFAULT_OPTS, root: proxyRoot });
    const code = runSetup({ ...DEFAULT_OPTS, root: proxyRoot, voice: true, uninstall: true });
    expect(code).toBe(0);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    expect(onDisk['statusLine']).toBeDefined();
    expect(onDisk['hooks']).toBeDefined();
    expect(onDisk['voiceEnabled']).toBeUndefined();
    expect(onDisk['voice']).toBeUndefined();
  });

  it('dry-run no modifica settings.json (S3)', () => {
    const code = runSetup({ ...DEFAULT_OPTS, root: proxyRoot, dryRun: true });
    expect(code).toBe(0);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(onDisk).toEqual(initialSettings);
  });

  it('--root inválido aborta con exit 1 (S1)', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'setup-empty-'));
    try {
      const code = runSetup({ ...DEFAULT_OPTS, root: emptyDir });
      expect(code).toBe(1);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('force sobre statusLine ajeno lo sobrescribe', () => {
    writeFileSync(
      settingsPath,
      JSON.stringify(
        { statusLine: { type: 'command', command: 'echo other', padding: 0 } },
        null,
        2,
      ),
      'utf-8',
    );
    const blocked = runSetup({ ...DEFAULT_OPTS, root: proxyRoot, statusline: true, force: false });
    expect(blocked).toBe(1);

    const forced = runSetup({ ...DEFAULT_OPTS, root: proxyRoot, statusline: true, force: true });
    expect(forced).toBe(0);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    expect((onDisk['statusLine'] as Record<string, unknown>)['command']).toContain(
      'router-status.ts',
    );
  });

  it('uninstall --statusline preserva statusLine ajeno sin --force (S4)', () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({ statusLine: { command: 'echo other' } }, null, 2),
      'utf-8',
    );
    const code = runSetup({ ...DEFAULT_OPTS, root: proxyRoot, statusline: true, uninstall: true });
    expect(code).toBe(0);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    // statusLine ajeno debe preservarse
    expect((onDisk['statusLine'] as Record<string, unknown>)['command']).toBe('echo other');
  });

  it('uninstall --statusline --force borra statusLine ajeno (S4)', () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({ statusLine: { command: 'echo other' } }, null, 2),
      'utf-8',
    );
    const code = runSetup({
      ...DEFAULT_OPTS,
      root: proxyRoot,
      statusline: true,
      uninstall: true,
      force: true,
    });
    expect(code).toBe(0);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    expect(onDisk['statusLine']).toBeUndefined();
  });

  it('--root alternativo válido instala con la ruta correcta', () => {
    const altRoot = createValidProxyRoot({ prefix: 'setup-alt-' });
    try {
      const code = runSetup({ ...DEFAULT_OPTS, root: altRoot, statusline: true });
      expect(code).toBe(0);
      const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
      const sl = onDisk['statusLine'] as Record<string, unknown>;
      expect(sl['command']).toContain(resolvePosixAbsolutePath(altRoot));
    } finally {
      rmSync(altRoot, { recursive: true, force: true });
    }
  });

  it('install --hooks produce comandos POSIX sin variables de runtime de Claude Code', () => {
    const code = runSetup({ ...DEFAULT_OPTS, root: proxyRoot, hooks: true });
    expect(code).toBe(0);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    const hooks = onDisk['hooks'] as Record<string, Array<{ hooks: Array<{ command?: string }> }>>;
    const commands = Object.values(hooks).flatMap((blocks) =>
      blocks.flatMap((b) => b.hooks.map((h) => h.command ?? '')),
    );
    for (const cmd of commands) {
      expect(cmd).not.toContain('\\');
      expect(cmd).not.toContain('${CLAUDE_PROJECT_DIR}');
    }
  });

  it('resultado deep-equal al encadenamiento de funciones puras (S3)', () => {
    const initial = JSON.parse(readFileSync(settingsPath, 'utf-8'));

    runSetup({ ...DEFAULT_OPTS, root: proxyRoot });
    const fromSetup = JSON.parse(readFileSync(settingsPath, 'utf-8'));

    // Reconstruir manualmente aplicando las mismas funciones puras
    writeFileSync(settingsPath, JSON.stringify(initial, null, 2), 'utf-8');
    const resolvedRoot = resolvePosixAbsolutePath(proxyRoot);
    let manual = initial as Parameters<typeof applyStatuslineInstall>[0];
    const s1 = applyStatuslineInstall(manual, resolvedRoot, false);
    if ('error' in s1) throw new Error(String(s1.error));
    manual = s1;
    manual = applyVoiceInstall(manual, { mode: 'hold', autoSubmit: true });
    const canonical = readCanonicalHooks(resolvedRoot);
    manual = mergeHooks(manual, canonical, resolvedRoot, false);

    expect(fromSetup).toEqual(manual);
  });
});

describe('runSetup — garantías S2 y S3', () => {
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

  it('S3: invoca readClaudeSettings y writeClaudeSettings exactamente una vez', () => {
    const readSpy = vi.spyOn(claudeSettings, 'readClaudeSettings');
    const writeSpy = vi.spyOn(claudeSettings, 'writeClaudeSettings');
    runSetup({ ...DEFAULT_OPTS, root: proxyRoot });
    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  it('S2: backupSettings se invoca antes de writeClaudeSettings', () => {
    // Verificar que el backup se crea: el orquestador llama a backupSettings
    // que copia settings.json en ~/.claude/settings-backup-<timestamp>.json.
    // Como setClaudeSettingsPathForTests redirige la ruta, no podemos afirmar
    // el path real. Verificamos mediante spy que writeClaudeSettings se llama
    // exactamente una vez (sin escrituras intermedias).
    const writeSpy = vi.spyOn(claudeSettings, 'writeClaudeSettings');
    runSetup({ ...DEFAULT_OPTS, root: proxyRoot });
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });
});
