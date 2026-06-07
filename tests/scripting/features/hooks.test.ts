import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  isScpManagedCommand,
  classifyKey,
  mergeHooks,
  unmergeHooks,
  backupSettings,
  readCanonicalHooks,
  validateScpRoot,
  type HooksBlock,
} from '../../../scripting/features/hooks.js';
import {
  setClaudeSettingsPathForTests,
  SMART_CODE_PROXY_ROOT_KEY,
  type ClaudeSettings,
} from '../../../scripting/shared/claude-settings.js';
import { createValidProxyRootForHooks } from '../helpers/proxy-root-fixture.js';

describe('isScpManagedCommand', () => {
  const scpRoot = '/c/repos/smart-code-proxy';

  it('detecta post-hook-event', () => {
    expect(isScpManagedCommand('npx tsx /c/repos/scp/scripting/post-hook-event.ts', scpRoot)).toBe(
      true,
    );
  });

  it('detecta stop-hook-ux', () => {
    expect(isScpManagedCommand('npx tsx /c/repos/scripting/stop-hook-ux.ts', scpRoot)).toBe(true);
  });

  it('detecta notifications/cli.ts', () => {
    expect(
      isScpManagedCommand(
        'npx tsx /c/repos/src/2-services/notifications/cli.ts --event-type Stop',
        scpRoot,
      ),
    ).toBe(true);
  });

  it('detecta task-in-progress-hook-ux', () => {
    expect(
      isScpManagedCommand('npx tsx /c/repos/scp/scripting/task-in-progress-hook-ux.ts', scpRoot),
    ).toBe(true);
  });

  it('detecta por ruta resolved de scpRoot', () => {
    expect(
      isScpManagedCommand('echo something with /c/repos/smart-code-proxy inside', scpRoot),
    ).toBe(true);
  });

  it('retorna false para comandos ajenos', () => {
    expect(isScpManagedCommand('echo hello', scpRoot)).toBe(false);
    expect(isScpManagedCommand('npm run build', scpRoot)).toBe(false);
  });

  it('retorna false para undefined', () => {
    expect(isScpManagedCommand(undefined, scpRoot)).toBe(false);
  });

  it('normaliza backslashes en Windows', () => {
    expect(isScpManagedCommand('C:\\repos\\scp\\scripting\\post-hook-event.ts', scpRoot)).toBe(
      true,
    );
  });
});

describe('classifyKey', () => {
  const scpRoot = '/c/repos/scp';

  it('scp-only cuando todos son de SCP', () => {
    const blocks = [
      { hooks: [{ type: 'command', command: '/c/repos/scp/scripting/post-hook-event.ts' }] },
    ];
    expect(classifyKey(blocks, scpRoot)).toBe('scp-only');
  });

  it('user-only cuando ninguno es de SCP', () => {
    const blocks = [{ hooks: [{ type: 'command', command: 'echo hello' }] }];
    expect(classifyKey(blocks, scpRoot)).toBe('user-only');
  });

  it('mixed cuando hay mezcla', () => {
    const blocks = [
      {
        hooks: [
          { type: 'command', command: 'echo other' },
          { type: 'command', command: '/c/repos/scp/scripting/post-hook-event.ts' },
        ],
      },
    ];
    expect(classifyKey(blocks, scpRoot)).toBe('mixed');
  });

  it('user-only para array vacío o undefined', () => {
    expect(classifyKey([], scpRoot)).toBe('user-only');
    expect(classifyKey(undefined, scpRoot)).toBe('user-only');
  });
});

describe('mergeHooks', () => {
  const scpRoot = '/c/repos/scp';
  const canonical: HooksBlock = {
    UserPromptSubmit: [{ hooks: [{ type: 'command', command: `${scpRoot}/post-hook-event.ts` }] }],
  };

  it('crea entrada si no existe', () => {
    const result = mergeHooks({}, canonical, scpRoot, false);
    const hooks = result.hooks as Record<string, HooksBlock[string]>;
    expect(hooks['UserPromptSubmit']).toBeDefined();
  });

  it('reemplaza si todos son SCP', () => {
    const settings: ClaudeSettings = {
      hooks: {
        UserPromptSubmit: [
          { hooks: [{ type: 'command', command: `${scpRoot}/old-post-hook-event.ts` }] },
        ],
      },
    };
    const result = mergeHooks(settings, canonical, scpRoot, false);
    const hooks = result.hooks as Record<string, HooksBlock[string]>;
    expect(hooks['UserPromptSubmit'][0].hooks[0].command).toContain('post-hook-event.ts');
  });

  it('preserva user-only sin --force', () => {
    const settings: ClaudeSettings = {
      hooks: {
        UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'echo other' }] }],
      },
    };
    const result = mergeHooks(settings, canonical, scpRoot, false);
    const hooks = result.hooks as Record<string, HooksBlock[string]>;
    expect(hooks['UserPromptSubmit'][0].hooks[0].command).toBe('echo other');
  });

  it('con --force sobrescribe user-only', () => {
    const settings: ClaudeSettings = {
      hooks: {
        UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'echo other' }] }],
      },
    };
    const result = mergeHooks(settings, canonical, scpRoot, true);
    const hooks = result.hooks as Record<string, HooksBlock[string]>;
    expect(hooks['UserPromptSubmit'][0].hooks[0].command).toContain('post-hook-event.ts');
  });

  it('en mixed preserva user + agrega canonical', () => {
    const settings: ClaudeSettings = {
      hooks: {
        UserPromptSubmit: [
          { hooks: [{ type: 'command', command: 'echo other' }] },
          { hooks: [{ type: 'command', command: `${scpRoot}/post-hook-event.ts` }] },
        ],
      },
    };
    const mixedCanonical: HooksBlock = {
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: `${scpRoot}/stop-hook-ux.ts` }] }],
    };
    const result = mergeHooks(settings, mixedCanonical, scpRoot, false);
    const hooks = result.hooks as Record<string, HooksBlock[string]>;
    expect(hooks['UserPromptSubmit'].length).toBe(2);
    expect(hooks['UserPromptSubmit'][0].hooks[0].command).toBe('echo other');
    expect(hooks['UserPromptSubmit'][1].hooks[0].command).toContain('stop-hook-ux.ts');
  });

  it('establece SMART_CODE_PROXY_ROOT en env', () => {
    const result = mergeHooks({}, canonical, scpRoot, false);
    expect(result.env?.[SMART_CODE_PROXY_ROOT_KEY]).toBe(scpRoot);
  });
});

describe('unmergeHooks', () => {
  const scpRoot = '/c/repos/scp';
  const canonical: HooksBlock = {
    UserPromptSubmit: [{ hooks: [{ type: 'command', command: `${scpRoot}/post-hook-event.ts` }] }],
    Stop: [{ hooks: [{ type: 'command', command: `${scpRoot}/stop-hook-ux.ts` }] }],
  };

  it('elimina clave si todos los comandos son SCP', () => {
    const settings: ClaudeSettings = {
      hooks: {
        UserPromptSubmit: [
          { hooks: [{ type: 'command', command: `${scpRoot}/post-hook-event.ts` }] },
        ],
      },
    };
    const result = unmergeHooks(settings, canonical, scpRoot);
    expect((result.hooks as Record<string, unknown>)?.['UserPromptSubmit']).toBeUndefined();
  });

  it('elimina solo comandos SCP de clave mixta', () => {
    const settings: ClaudeSettings = {
      hooks: {
        UserPromptSubmit: [
          { hooks: [{ type: 'command', command: `${scpRoot}/post-hook-event.ts` }] },
          { hooks: [{ type: 'command', command: 'echo other' }] },
        ],
      },
    };
    const result = unmergeHooks(settings, canonical, scpRoot);
    const hooks = result.hooks as Record<string, HooksBlock[string]>;
    expect(hooks['UserPromptSubmit'].length).toBe(1);
    expect(hooks['UserPromptSubmit'][0].hooks[0].command).toBe('echo other');
  });

  it('preserva claves ajenas intactas', () => {
    const settings: ClaudeSettings = {
      hooks: {
        UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'echo other' }] }],
      },
    };
    const result = unmergeHooks(settings, canonical, scpRoot);
    const hooks = result.hooks as Record<string, HooksBlock[string]>;
    expect(hooks['UserPromptSubmit'][0].hooks[0].command).toBe('echo other');
  });
});

describe('backupSettings', () => {
  let settingsDir: string;
  let settingsPath: string;

  beforeEach(() => {
    settingsDir = mkdtempSync(join(tmpdir(), 'backup-test-'));
    settingsPath = join(settingsDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({ env: { TEST: 'value' } }), 'utf-8');
    setClaudeSettingsPathForTests(settingsPath);
  });

  afterEach(() => {
    setClaudeSettingsPathForTests(undefined);
    rmSync(settingsDir, { recursive: true, force: true });
  });

  it('crea archivo de backup con timestamp', () => {
    const backupPath = backupSettings({});
    expect(existsSync(backupPath)).toBe(true);
    expect(backupPath).toMatch(/settings-backup-\d{4}-\d{2}-\d{2}T/);
  });
});

describe('readCanonicalHooks', () => {
  it('lee configs/hooks.json y reemplaza placeholders', () => {
    const minimalHooks = {
      hooks: {
        UserPromptSubmit: [
          {
            hooks: [
              {
                type: 'command',
                command:
                  'npx --prefix "${SMART_CODE_PROXY_ROOT}" tsx "${SMART_CODE_PROXY_ROOT}/scripting/post-hook-event.ts"',
              },
            ],
          },
        ],
      },
    };
    const root = createValidProxyRootForHooks('scp-hooks-', minimalHooks);
    const hooks = readCanonicalHooks(root);
    expect(hooks['UserPromptSubmit']).toBeDefined();
    const cmd = hooks['UserPromptSubmit'][0].hooks[0].command;
    expect(cmd).not.toContain('${SMART_CODE_PROXY_ROOT}');
    const normalizedRoot = root.replace(/\\/g, '/');
    expect(cmd.replace(/\\/g, '/')).toContain(normalizedRoot);
    rmSync(root, { recursive: true, force: true });
  });

  it('lanza error si no existe configs/hooks.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'scp-no-hooks-'));
    expect(() => readCanonicalHooks(root)).toThrow();
    rmSync(root, { recursive: true, force: true });
  });
});

describe('validateScpRoot', () => {
  it('pasa si todos los archivos existen', () => {
    const root = createValidProxyRootForHooks();
    expect(() => validateScpRoot(root)).not.toThrow();
    rmSync(root, { recursive: true, force: true });
  });

  it('falla si falta cli.ts', () => {
    const root = mkdtempSync(join(tmpdir(), 'scp-missing-cli-'));
    mkdirSync(join(root, 'configs'), { recursive: true });
    writeFileSync(join(root, 'configs', 'hooks.json'), JSON.stringify({ hooks: {} }), 'utf-8');
    mkdirSync(join(root, 'scripting'), { recursive: true });
    writeFileSync(join(root, 'scripting', 'post-hook-event.ts'), '', 'utf-8');
    writeFileSync(join(root, 'scripting', 'stop-hook-ux.ts'), '', 'utf-8');
    expect(() => validateScpRoot(root)).toThrow(/cli\.ts/);
    rmSync(root, { recursive: true, force: true });
  });
});
