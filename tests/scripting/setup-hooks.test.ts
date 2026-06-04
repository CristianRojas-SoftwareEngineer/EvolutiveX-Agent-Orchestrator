import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  isScpManagedCommand,
  classifyKey,
  mergeHooks,
  unmergeHooks,
  backupSettings,
  readCanonicalHooks,
  runSetupHooks,
  validateScpRoot,
  type HooksBlock,
} from '../../scripting/setup-hooks.js';
import {
  setClaudeSettingsPathForTests,
  SMART_CODE_PROXY_ROOT_KEY,
  type ClaudeSettings,
} from '../../scripting/shared/claude-settings.js';
import { createValidProxyRootForHooks } from './helpers/proxy-root-fixture.js';

describe('isScpManagedCommand', () => {
  const scpRoot = '/c/repos/smart-code-proxy';

  it('detecta post-hook-event', () => {
    expect(
      isScpManagedCommand(
        'npx --prefix "/c/repos/scp" tsx /c/repos/scp/scripting/post-hook-event.ts',
        scpRoot,
      ),
    ).toBe(true);
  });

  it('detecta stop-hook-ux', () => {
    expect(
      isScpManagedCommand(
        'npx --prefix "/c/repos" tsx /c/repos/scripting/stop-hook-ux.ts',
        scpRoot,
      ),
    ).toBe(true);
  });

  it('detecta notifications/cli.ts', () => {
    expect(
      isScpManagedCommand(
        'npx tsx /c/repos/smart-code-proxy/src/2-services/notifications/cli.ts --event-type Stop',
        scpRoot,
      ),
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
      {
        hooks: [
          {
            type: 'command',
            command: 'npx --prefix /c/repos/scp tsx /c/repos/scp/scripting/post-hook-event.ts',
          },
        ],
      },
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
          {
            type: 'command',
            command: 'npx --prefix /c/repos/scp tsx /c/repos/scp/scripting/post-hook-event.ts',
          },
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
    UserPromptSubmit: [
      { hooks: [{ type: 'command', command: `${scpRoot}/post-hook-event.ts` }] },
    ],
  };

  it('crea entrada si no existe', () => {
    const settings: ClaudeSettings = {};
    const result = mergeHooks(settings, canonical, scpRoot, false);
    const hooks = result.hooks as Record<string, HooksBlock[string]>;
    expect(hooks['UserPromptSubmit']).toBeDefined();
    expect(hooks['UserPromptSubmit'].length).toBe(1);
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
    expect(hooks['UserPromptSubmit'].length).toBe(1);
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
    expect(hooks['UserPromptSubmit'].length).toBe(1);
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
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command: `${scpRoot}/stop-hook-ux.ts` }] },
      ],
    };
    const result = mergeHooks(settings, mixedCanonical, scpRoot, false);
    const hooks = result.hooks as Record<string, HooksBlock[string]>;
    // El bloque ajeno se preserva y se le agrega el bloque canónico de SCP
    expect(hooks['UserPromptSubmit'].length).toBe(2);
    expect(hooks['UserPromptSubmit'][0].hooks[0].command).toBe('echo other');
    expect(hooks['UserPromptSubmit'][1].hooks[0].command).toContain('stop-hook-ux.ts');
  });

  it('establece SMART_CODE_PROXY_ROOT en env', () => {
    const settings: ClaudeSettings = {};
    const result = mergeHooks(settings, canonical, scpRoot, false);
    expect(result.env?.[SMART_CODE_PROXY_ROOT_KEY]).toBe(scpRoot);
  });
});

describe('unmergeHooks', () => {
  const scpRoot = '/c/repos/scp';
  const canonical: HooksBlock = {
    UserPromptSubmit: [
      { hooks: [{ type: 'command', command: `${scpRoot}/post-hook-event.ts` }] },
    ],
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
    const hooks = result.hooks as Record<string, HooksBlock[string]> | undefined;
    expect(hooks?.['UserPromptSubmit']).toBeUndefined();
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
    expect(hooks['UserPromptSubmit']).toBeDefined();
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
    expect(hooks['UserPromptSubmit']).toBeDefined();
    expect(hooks['UserPromptSubmit'][0].hooks[0].command).toBe('echo other');
  });
});

describe('backupSettings', () => {
  it('crea archivo de backup con timestamp', () => {
    const settings: ClaudeSettings = {
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: 'echo' }] }],
      },
    };
    const backupPath = backupSettings(settings);
    expect(existsSync(backupPath)).toBe(true);
    const content = JSON.parse(readFileSync(backupPath, 'utf-8'));
    // El backup refleja el estado del settings.json existente (vacío en test) más lo nuevo
    expect(content).toBeDefined();
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
    expect(Object.keys(hooks).length).toBeGreaterThan(0);
    // Verificar que el placeholder fue reemplazado
    const cmd = hooks['UserPromptSubmit'][0].hooks[0].command;
    expect(cmd).not.toContain('${SMART_CODE_PROXY_ROOT}');
    // Normalizar ambos a forward slashes para comparación cross-platform
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

describe('runSetupHooks', () => {
  let settingsDir: string;
  let settingsPath: string;

  beforeEach(() => {
    settingsDir = mkdtempSync(join(tmpdir(), 'setup-hooks-test-'));
    settingsPath = join(settingsDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({}), 'utf-8');
    setClaudeSettingsPathForTests(settingsPath);
  });

  afterEach(() => {
    setClaudeSettingsPathForTests(undefined);
    rmSync(settingsDir, { recursive: true, force: true });
  });

  it('--dry-run no escribe en disco', () => {
    const root = createValidProxyRootForHooks();
    const code = runSetupHooks({ root, dryRun: true, force: false, uninstall: false });
    expect(code).toBe(0);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(Object.keys(onDisk)).toHaveLength(0); // vacío, no escribió
    rmSync(root, { recursive: true, force: true });
  });

  it('install escribe las entradas', () => {
    const root = createValidProxyRootForHooks();
    const code = runSetupHooks({ root, dryRun: false, force: false, uninstall: false });
    expect(code).toBe(0);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(onDisk.hooks).toBeDefined();
    expect(onDisk.env?.[SMART_CODE_PROXY_ROOT_KEY]).toBeDefined();
    rmSync(root, { recursive: true, force: true });
  });

  it('uninstall solo elimina comandos SCP', () => {
    const root = createValidProxyRootForHooks();
    runSetupHooks({ root, dryRun: false, force: false, uninstall: false });
    // Agregar un hook ajeno
    const withUserHook = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    withUserHook.hooks = withUserHook.hooks || {};
    (withUserHook.hooks as Record<string, unknown>)['UserPromptSubmit'] = [
      ...(((withUserHook.hooks as Record<string, unknown>)['UserPromptSubmit'] as unknown[]) || []),
      { hooks: [{ type: 'command', command: 'echo user-hook' }] },
    ];
    writeFileSync(settingsPath, JSON.stringify(withUserHook, null, 2), 'utf-8');

    const code = runSetupHooks({ root, dryRun: false, force: false, uninstall: true });
    expect(code).toBe(0);
    const onDisk = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    // Queda el hook ajeno
    const hooks = onDisk.hooks as Record<string, unknown>;
    expect(hooks['UserPromptSubmit']).toBeDefined();
    const entries = hooks['UserPromptSubmit'] as Array<{ hooks: Array<{ command: string }> }>;
    expect(entries.some(e => e.hooks.some(h => h.command === 'echo user-hook'))).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it('validación falla si falta configs/hooks.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'scp-missing-'));
    mkdirSync(join(root, 'scripting'), { recursive: true });
    writeFileSync(join(root, 'scripting', 'post-hook-event.ts'), '', 'utf-8');
    writeFileSync(join(root, 'scripting', 'stop-hook-ux.ts'), '', 'utf-8');
    mkdirSync(join(root, 'src', '2-services', 'notifications'), { recursive: true });
    writeFileSync(join(root, 'src', '2-services', 'notifications', 'cli.ts'), '', 'utf-8');

    const code = runSetupHooks({ root, dryRun: true, force: false, uninstall: false });
    expect(code).toBe(1);
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
    writeFileSync(
      join(root, 'configs', 'hooks.json'),
      JSON.stringify({ hooks: {} }, null, 2),
      'utf-8',
    );
    mkdirSync(join(root, 'scripting'), { recursive: true });
    writeFileSync(join(root, 'scripting', 'post-hook-event.ts'), '', 'utf-8');
    writeFileSync(join(root, 'scripting', 'stop-hook-ux.ts'), '', 'utf-8');
    // no cli.ts

    expect(() => validateScpRoot(root)).toThrow(/cli\.ts/);
    rmSync(root, { recursive: true, force: true });
  });
});