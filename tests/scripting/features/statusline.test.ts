import { describe, it, expect } from 'vitest';
import { rmSync } from 'node:fs';
import {
  isSmartCodeStatusLine,
  buildStatusLineCommand,
  shouldOverwriteStatusLine,
  applyStatuslineInstall,
  applyStatuslineUninstall,
} from '../../../scripting/features/statusline.js';
import { createValidProxyRootForStatusline } from '../helpers/proxy-root-fixture.js';
import {
  SMART_CODE_PROXY_ROOT_KEY,
  type ClaudeSettings,
} from '../../../scripting/shared/claude-settings.js';

describe('isSmartCodeStatusLine', () => {
  it('retorna true si el comando incluye router-status.ts', () => {
    expect(isSmartCodeStatusLine('npx tsx /repo/scripting/router-status.ts')).toBe(true);
  });

  it('retorna true con backslashes Windows', () => {
    expect(isSmartCodeStatusLine('C:\\repo\\scripting\\router-status.ts')).toBe(true);
  });

  it('retorna false para comandos ajenos', () => {
    expect(isSmartCodeStatusLine('echo hello')).toBe(false);
    expect(isSmartCodeStatusLine(undefined)).toBe(false);
  });
});

describe('buildStatusLineCommand', () => {
  it('genera el comando npx tsx para el proxyRoot dado', () => {
    const root = createValidProxyRootForStatusline();
    const cmd = buildStatusLineCommand(root);
    expect(cmd).toContain('tsx');
    expect(cmd.replace(/\\/g, '/')).toContain('scripting/router-status.ts');
    rmSync(root, { recursive: true, force: true });
  });
});

describe('shouldOverwriteStatusLine', () => {
  it('ok si no hay statusLine existente', () => {
    expect(shouldOverwriteStatusLine(undefined, false)).toEqual({ ok: true });
  });

  it('ok si el statusLine existente es de SCP', () => {
    expect(shouldOverwriteStatusLine('npx tsx /repo/scripting/router-status.ts', false)).toEqual({
      ok: true,
    });
  });

  it('ok con --force aunque el statusLine sea ajeno', () => {
    expect(shouldOverwriteStatusLine('echo other', true)).toEqual({ ok: true });
  });

  it('error si el statusLine existente es ajeno y sin --force', () => {
    const result = shouldOverwriteStatusLine('echo other', false);
    expect(result).toHaveProperty('ok', false);
  });
});

describe('applyStatuslineInstall', () => {
  it('instala statusLine y env.SMART_CODE_PROXY_ROOT', () => {
    const root = createValidProxyRootForStatusline();
    const result = applyStatuslineInstall({}, root, false);
    expect('error' in result).toBe(false);
    const settings = result as ClaudeSettings;
    expect(settings.statusLine?.type).toBe('command');
    expect(settings.env?.[SMART_CODE_PROXY_ROOT_KEY]).toBeTruthy();
    rmSync(root, { recursive: true, force: true });
  });

  it('retorna error si hay statusLine ajeno sin --force', () => {
    const root = createValidProxyRootForStatusline();
    const settings: ClaudeSettings = { statusLine: { command: 'echo other' } };
    const result = applyStatuslineInstall(settings, root, false);
    expect('error' in result).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it('instala con --force aunque haya ajeno', () => {
    const root = createValidProxyRootForStatusline();
    const settings: ClaudeSettings = { statusLine: { command: 'echo other' } };
    const result = applyStatuslineInstall(settings, root, true);
    expect('error' in result).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });
});

describe('applyStatuslineUninstall', () => {
  it('borra statusLine de SCP sin --force', () => {
    const settings: ClaudeSettings = {
      statusLine: { command: 'npx tsx /repo/scripting/router-status.ts' },
      env: { [SMART_CODE_PROXY_ROOT_KEY]: '/repo' },
    };
    const result = applyStatuslineUninstall(settings, false);
    expect(result.statusLine).toBeUndefined();
    expect(result.env).toBeUndefined();
  });

  it('preserva statusLine ajeno sin --force (S4)', () => {
    const settings: ClaudeSettings = {
      statusLine: { command: 'echo other' },
      env: { [SMART_CODE_PROXY_ROOT_KEY]: '/repo', OTHER: 'val' },
    };
    const result = applyStatuslineUninstall(settings, false);
    expect(result.statusLine?.command).toBe('echo other');
    expect(result.env?.[SMART_CODE_PROXY_ROOT_KEY]).toBe('/repo');
  });

  it('borra statusLine ajeno con --force', () => {
    const settings: ClaudeSettings = {
      statusLine: { command: 'echo other' },
      env: { [SMART_CODE_PROXY_ROOT_KEY]: '/repo' },
    };
    const result = applyStatuslineUninstall(settings, true);
    expect(result.statusLine).toBeUndefined();
    expect(result.env).toBeUndefined();
  });

  it('no hace nada si no hay statusLine', () => {
    const settings: ClaudeSettings = { env: { OTHER: 'val' } };
    const result = applyStatuslineUninstall(settings, false);
    expect(result.env?.['OTHER']).toBe('val');
    expect(result.statusLine).toBeUndefined();
  });
});
