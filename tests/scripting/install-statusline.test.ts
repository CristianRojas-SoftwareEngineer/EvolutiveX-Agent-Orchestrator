import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  applyStatuslineInstall,
  applyStatuslineUninstall,
  buildStatusLineCommand,
  isSmartCodeStatusLine,
  runInstallStatusline,
  shouldOverwriteStatusLine,
  validateProxyRoot,
} from '../../scripting/install-statusline.js';
import {
  setClaudeSettingsPathForTests,
  SMART_CODE_PROXY_ROOT_KEY,
} from '../../scripting/lib/claude-settings.js';
import { createValidProxyRoot } from './helpers/proxy-root-fixture.js';

describe('buildStatusLineCommand', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('cita rutas con espacios en Windows con comillas dobles', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const cmd = buildStatusLineCommand('C:\\Program Files\\Smart Code Proxy');
    expect(cmd).toContain('npx --prefix "C:\\Program Files\\Smart Code Proxy"');
    expect(cmd).toContain('tsx scripting/router-status.ts');
  });

  it('cita rutas con espacios en Unix con comillas simples', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const cmd = buildStatusLineCommand('/home/user/Smart Code Proxy');
    expect(cmd).toMatch(/^npx --prefix '.*Smart Code Proxy' tsx scripting\/router-status\.ts$/);
    expect(cmd).not.toContain('"');
  });
});

describe('política de sobrescritura', () => {
  it('detecta statusLine del proxy', () => {
    expect(isSmartCodeStatusLine('npx tsx scripting/router-status.ts')).toBe(true);
    expect(isSmartCodeStatusLine('echo hello')).toBe(false);
  });

  it('bloquea sobrescritura ajena sin force', () => {
    expect(shouldOverwriteStatusLine('echo custom', false).ok).toBe(false);
    expect(shouldOverwriteStatusLine(undefined, false).ok).toBe(true);
    expect(shouldOverwriteStatusLine('npx tsx scripting/router-status.ts', false).ok).toBe(true);
    expect(shouldOverwriteStatusLine('echo custom', true).ok).toBe(true);
  });
});

describe('applyStatuslineInstall / uninstall', () => {
  let proxyRoot: string;

  afterEach(() => {
    if (proxyRoot) rmSync(proxyRoot, { recursive: true, force: true });
  });

  it('applyStatuslineInstall devuelve payload sin mutar input', () => {
    proxyRoot = createValidProxyRoot({ prefix: 'install-sl-' });
    const settings = { env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:8787' } };
    const next = applyStatuslineInstall(settings, proxyRoot, false);
    expect('error' in next).toBe(false);
    if ('error' in next) return;
    expect(next.statusLine?.type).toBe('command');
    expect(next.statusLine?.padding).toBe(0);
    expect(next.statusLine?.command).toContain('router-status.ts');
    expect(next.env?.[SMART_CODE_PROXY_ROOT_KEY]).toBe(proxyRoot);
    expect('statusLine' in settings).toBe(false);
  });

  it('reinstalación idempotente actualiza ROOT y comando sin force', () => {
    const oldRoot = createValidProxyRoot({ prefix: 'install-sl-old-' });
    proxyRoot = createValidProxyRoot({ prefix: 'install-sl-new-' });
    const settings = {
      statusLine: {
        type: 'command',
        command: buildStatusLineCommand(oldRoot),
        padding: 0,
      },
      env: { [SMART_CODE_PROXY_ROOT_KEY]: oldRoot },
    };
    const next = applyStatuslineInstall(settings, proxyRoot, false);
    expect('error' in next).toBe(false);
    if ('error' in next) return;
    expect(next.env?.[SMART_CODE_PROXY_ROOT_KEY]).toBe(proxyRoot);
    expect(next.statusLine?.command).toContain(proxyRoot);
    rmSync(oldRoot, { recursive: true, force: true });
  });

  it('force sobrescribe statusLine ajeno', () => {
    proxyRoot = createValidProxyRoot({ prefix: 'install-sl-' });
    const blocked = applyStatuslineInstall(
      { statusLine: { type: 'command', command: 'echo other' } },
      proxyRoot,
      false,
    );
    expect(blocked).toEqual({
      error:
        'Ya existe un statusLine que no es de Smart Code Proxy. Use --force para sobrescribirlo.',
    });

    const forced = applyStatuslineInstall(
      { statusLine: { type: 'command', command: 'echo other' } },
      proxyRoot,
      true,
    );
    expect('error' in forced).toBe(false);
  });

  it('uninstall preserva otras claves de env', () => {
    const next = applyStatuslineUninstall({
      statusLine: { type: 'command', command: 'npx tsx scripting/router-status.ts', padding: 0 },
      env: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8787',
        [SMART_CODE_PROXY_ROOT_KEY]: '/tmp/proxy',
      },
    });
    expect(next.statusLine).toBeUndefined();
    expect(next.env?.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:8787');
    expect(next.env?.[SMART_CODE_PROXY_ROOT_KEY]).toBeUndefined();
  });
});

describe('validateProxyRoot', () => {
  it('falla si falta router-status.ts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'install-sl-bad-'));
    mkdirSync(join(dir, 'routing', 'providers'), { recursive: true });
    expect(() => validateProxyRoot(dir)).toThrow(/router-status/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('runInstallStatusline', () => {
  let proxyRoot: string;
  let settingsPath: string;
  let settingsDir: string;
  const initialSettings = {
    env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:8787' },
  };

  beforeEach(() => {
    settingsDir = mkdtempSync(join(tmpdir(), 'install-sl-settings-'));
    settingsPath = join(settingsDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify(initialSettings, null, 2), 'utf-8');
    setClaudeSettingsPathForTests(settingsPath);
    proxyRoot = createValidProxyRoot({ prefix: 'install-sl-run-' });
  });

  afterEach(() => {
    setClaudeSettingsPathForTests(undefined);
    if (proxyRoot) rmSync(proxyRoot, { recursive: true, force: true });
    if (settingsDir) rmSync(settingsDir, { recursive: true, force: true });
  });

  it('dry-run no modifica settings.json en disco', () => {
    const code = runInstallStatusline({
      root: proxyRoot,
      dryRun: true,
      force: false,
      uninstall: false,
    });
    expect(code).toBe(0);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8')) as typeof initialSettings;
    expect(onDisk).toEqual(initialSettings);
  });

  it('raíz inválida retorna 1 y no escribe settings', () => {
    const badRoot = mkdtempSync(join(tmpdir(), 'install-sl-invalid-'));
    mkdirSync(join(badRoot, 'routing', 'providers'), { recursive: true });

    const code = runInstallStatusline({
      root: badRoot,
      dryRun: false,
      force: false,
      uninstall: false,
    });
    expect(code).toBe(1);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8')) as typeof initialSettings;
    expect(onDisk).toEqual(initialSettings);

    rmSync(badRoot, { recursive: true, force: true });
  });
});
