import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  applyNotificationsInstall,
  applyNotificationsUninstall,
  buildNotificationCommand,
  isLegacyNotificationPs1,
  isSmartCodeNotificationCommand,
  NOTIFICATION_CLI_SEGMENT,
  runInstallNotifications,
  shouldOverwriteNotificationKey,
  validateProxyRootForNotifications,
} from '../../scripting/install-notifications.js';
import {
  setClaudeSettingsPathForTests,
  SMART_CODE_PROXY_ROOT_KEY,
} from '../../scripting/shared/claude-settings.js';
import {
  createValidProxyRootForNotifications,
  createValidProxyRoot,
} from './helpers/proxy-root-fixture.js';

describe('buildNotificationCommand', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('cita rutas con espacios en Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const cmd = buildNotificationCommand('C:\\Program Files\\Smart Code Proxy', 'Stop', {
      stdinJson: true,
    });
    expect(cmd).toContain('npx --prefix "C:\\Program Files\\Smart Code Proxy"');
    expect(cmd).toContain(NOTIFICATION_CLI_SEGMENT);
    expect(cmd).toContain('--event-type Stop --stdin-json');
  });

  it('cita rutas con espacios en Unix', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const cmd = buildNotificationCommand('/home/user/Smart Code Proxy', 'SessionStart');
    expect(cmd).toMatch(/^npx --prefix '.*Smart Code Proxy' tsx /);
    expect(cmd).toContain('--event-type SessionStart');
    expect(cmd).not.toContain('--stdin-json');
  });
});

describe('detección de comandos', () => {
  it('detecta CLI del proxy y legacy PS1', () => {
    expect(
      isSmartCodeNotificationCommand(
        `npx --prefix "x" tsx ${NOTIFICATION_CLI_SEGMENT} --event-type Stop`,
      ),
    ).toBe(true);
    expect(isLegacyNotificationPs1('pwsh desktop-notification-hook.ps1')).toBe(true);
    expect(isSmartCodeNotificationCommand('echo hi')).toBe(false);
  });
});

describe('shouldOverwriteNotificationKey', () => {
  it('permite vacío, proxy o legacy; bloquea ajeno sin force', () => {
    expect(shouldOverwriteNotificationKey('Stop', undefined, false).ok).toBe(true);
    expect(
      shouldOverwriteNotificationKey(
        'Stop',
        [{ hooks: [{ type: 'command', command: `tsx ${NOTIFICATION_CLI_SEGMENT}` }] }],
        false,
      ).ok,
    ).toBe(true);
    expect(
      shouldOverwriteNotificationKey(
        'Stop',
        [
          {
            hooks: [
              {
                type: 'command',
                command: 'pwsh desktop-notification-hook.ps1 -EventType Stop',
              },
            ],
          },
        ],
        false,
      ).ok,
    ).toBe(true);
    expect(
      shouldOverwriteNotificationKey(
        'Stop',
        [{ hooks: [{ type: 'command', command: 'echo custom' }] }],
        false,
      ).ok,
    ).toBe(false);
    expect(
      shouldOverwriteNotificationKey(
        'Stop',
        [{ hooks: [{ type: 'command', command: 'echo custom' }] }],
        true,
      ).ok,
    ).toBe(true);
  });
});

describe('applyNotificationsInstall / uninstall', () => {
  let proxyRoot: string;

  afterEach(() => {
    if (proxyRoot) rmSync(proxyRoot, { recursive: true, force: true });
  });

  it('escribe 11 claves sin mutar input', () => {
    proxyRoot = createValidProxyRootForNotifications('install-notif-');
    const settings = { env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:8787' } };
    const next = applyNotificationsInstall(settings, proxyRoot, false);
    expect('error' in next).toBe(false);
    if ('error' in next) return;
    const hooks = next.hooks as Record<string, unknown[]>;
    expect(Object.keys(hooks)).toHaveLength(11);
    expect(hooks.SessionStart?.[0]).toMatchObject({ matcher: 'startup|resume' });
    expect(hooks.PreToolUse?.[0]).toMatchObject({ matcher: 'AskUserQuestion' });
    expect(next.env?.[SMART_CODE_PROXY_ROOT_KEY]).toBe(proxyRoot);
    expect('hooks' in settings).toBe(false);
  });

  it('uninstall preserva PostToolUse ajeno', () => {
    proxyRoot = createValidProxyRootForNotifications('install-notif-');
    const installed = applyNotificationsInstall({}, proxyRoot, false);
    if ('error' in installed) throw new Error(installed.error);
    const withPs1Guard = {
      ...installed,
      hooks: {
        ...(installed.hooks as object),
        PostToolUse: [
          {
            matcher: 'Write|Edit',
            hooks: [{ type: 'command', command: 'pwsh hook-post-tooluse.ps1' }],
          },
        ],
      },
    };
    const next = applyNotificationsUninstall(withPs1Guard);
    expect(next.hooks?.PostToolUse).toBeDefined();
    expect(next.hooks?.SessionStart).toBeUndefined();
  });
});

describe('validateProxyRootForNotifications', () => {
  it('falla si falta cli.ts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'install-notif-bad-'));
    expect(() => validateProxyRootForNotifications(dir)).toThrow(/cli\.ts/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('runInstallNotifications', () => {
  let proxyRoot: string;
  let settingsPath: string;
  let settingsDir: string;
  const initialSettings = {
    env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:8787' },
    hooks: {
      PostToolUse: [
        {
          matcher: 'Write|Edit',
          hooks: [{ type: 'command', command: 'pwsh guard.ps1' }],
        },
      ],
    },
  };

  beforeEach(() => {
    settingsDir = mkdtempSync(join(tmpdir(), 'install-notif-settings-'));
    settingsPath = join(settingsDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify(initialSettings, null, 2), 'utf-8');
    setClaudeSettingsPathForTests(settingsPath);
    proxyRoot = createValidProxyRoot({ prefix: 'install-notif-run-' });
  });

  afterEach(() => {
    setClaudeSettingsPathForTests(undefined);
    if (proxyRoot) rmSync(proxyRoot, { recursive: true, force: true });
    if (settingsDir) rmSync(settingsDir, { recursive: true, force: true });
  });

  it('dry-run no modifica settings.json', () => {
    const code = runInstallNotifications({
      root: proxyRoot,
      dryRun: true,
      force: false,
      uninstall: false,
    });
    expect(code).toBe(0);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(onDisk).toEqual(initialSettings);
  });

  it('instala y preserva PostToolUse en disco', () => {
    const code = runInstallNotifications({
      root: proxyRoot,
      dryRun: false,
      force: false,
      uninstall: false,
    });
    expect(code).toBe(0);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8')) as {
      hooks: Record<string, unknown>;
    };
    expect(onDisk.hooks.PostToolUse).toEqual(initialSettings.hooks.PostToolUse);
    expect(onDisk.hooks.SessionStart).toBeDefined();
    expect(
      (onDisk.hooks.Stop as { hooks: { command: string }[] }[])[0]!.hooks[0]!.command,
    ).toContain(NOTIFICATION_CLI_SEGMENT);
  });
});
