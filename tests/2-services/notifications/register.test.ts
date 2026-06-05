// Tests del helper de AUMID (register.ts): wrapper de `reg.exe` + instalación
// del .lnk vía SnoreToast `--install` (mockeado).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';

const registryMock = vi.hoisted(() => ({
  readRegistry: vi.fn(),
  writeRegistry: vi.fn(),
  deleteRegistry: vi.fn(),
}));

const snoreToastMock = vi.hoisted(() => ({
  getSnoreToastPath: vi.fn(),
  installSnoreToastShortcut: vi.fn(),
  SHORTCUT_ENGINE_SNORETOAST: 'snoretoast',
}));

vi.mock('../../../src/2-services/notifications/registry.js', () => registryMock);
vi.mock('../../../src/2-services/notifications/snoretoast-shortcut.js', () => snoreToastMock);

import {
  AUMID,
  DISPLAY_NAME,
  isValidAumid,
  installAction,
  uninstallAction,
  dispatch,
  getLnkPath,
  getIconIcoPath,
  getIconPngPath,
} from '../../../src/2-services/notifications/register.js';
import { buildShortcutBytes } from '../../../src/2-services/notifications/lnk-format.js';

const registeredState = () => ({
  exists: true,
  displayName: DISPLAY_NAME,
  icon: getIconIcoPath(),
  iconUri: getIconPngPath(),
  shortcutEngine: 'snoretoast',
});

let tmpDir: string;
let expectedLnkPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'register-test-'));
  process.env['APPDATA'] = tmpDir;
  expectedLnkPath = getLnkPath();
  mkdirSync(dirname(expectedLnkPath), { recursive: true });

  registryMock.readRegistry.mockReset();
  registryMock.writeRegistry.mockReset();
  registryMock.deleteRegistry.mockReset();
  snoreToastMock.getSnoreToastPath.mockReset();
  snoreToastMock.installSnoreToastShortcut.mockReset();

  registryMock.readRegistry.mockResolvedValue(registeredState());
  registryMock.writeRegistry.mockResolvedValue(undefined);
  registryMock.deleteRegistry.mockResolvedValue(undefined);
  snoreToastMock.getSnoreToastPath.mockReturnValue('C:\\fake\\snoretoast-x64.exe');
  snoreToastMock.installSnoreToastShortcut.mockImplementation(
    async (_lnkFileName: string, targetExe: string, aumid: string, lnkPath: string, iconLocation: string) => {
      writeFileSync(
        lnkPath,
        buildShortcutBytes({
          target: targetExe,
          icon: iconLocation,
          name: _lnkFileName,
          aumid,
        }),
      );
    },
  );

  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env['AI_ASSISTANT_AUMID'];
  delete process.env['APPDATA'];
});

describe('isValidAumid', () => {
  it('acepta el AUMID por defecto', () => {
    expect(isValidAumid(AUMID)).toBe(true);
  });
});

describe('installAction', () => {
  it('instala .lnk vía SnoreToast y escribe registro cuando no está registrado', async () => {
    registryMock.readRegistry.mockResolvedValue({ exists: false });
    const code = await installAction();
    expect(code).toBe(0);
    expect(snoreToastMock.installSnoreToastShortcut).toHaveBeenCalledTimes(1);
    expect(existsSync(expectedLnkPath)).toBe(true);
    expect(registryMock.writeRegistry).toHaveBeenCalledTimes(1);
    expect(registryMock.writeRegistry).toHaveBeenCalledWith(
      AUMID,
      DISPLAY_NAME,
      expect.stringContaining('ai-assistant.ico'),
      expect.stringContaining('ai-assistant.png'),
    );
  });

  it('es idempotente si registro, .lnk y ShortcutEngine están OK', async () => {
    writeFileSync(
      expectedLnkPath,
      buildShortcutBytes({
        target: 'C:\\fake\\snoretoast-x64.exe',
        icon: `${getIconIcoPath()},1`,
        name: 'AI Assistant',
        aumid: 'AIAssistant.Proxy',
      }),
    );
    const code = await installAction();
    expect(code).toBe(0);
    expect(registryMock.writeRegistry).not.toHaveBeenCalled();
    expect(snoreToastMock.installSnoreToastShortcut).not.toHaveBeenCalled();
  });

  it('repara el .lnk si falta ShortcutEngine en registro', async () => {
    writeFileSync(expectedLnkPath, Buffer.from('old'));
    registryMock.readRegistry.mockResolvedValue({
      ...registeredState(),
      shortcutEngine: undefined,
    });
    const code = await installAction();
    expect(code).toBe(0);
    expect(snoreToastMock.installSnoreToastShortcut).toHaveBeenCalledTimes(1);
    expect(registryMock.writeRegistry).toHaveBeenCalledTimes(1);
  });

  it('repara el .lnk si el registro está bien pero falta el archivo', async () => {
    registryMock.readRegistry.mockResolvedValue(registeredState());
    const code = await installAction();
    expect(code).toBe(0);
    expect(snoreToastMock.installSnoreToastShortcut).toHaveBeenCalledTimes(1);
    expect(registryMock.writeRegistry).not.toHaveBeenCalled();
  });

  it('falla con exit 1 si writeRegistry lanza', async () => {
    registryMock.readRegistry.mockResolvedValue({ exists: false });
    registryMock.writeRegistry.mockRejectedValue(new Error('Access denied'));
    const code = await installAction();
    expect(code).toBe(1);
    expect(snoreToastMock.installSnoreToastShortcut).not.toHaveBeenCalled();
  });
});

describe('uninstallAction', () => {
  it('borra el .lnk y llama a deleteRegistry', async () => {
    writeFileSync(expectedLnkPath, Buffer.from('stub'));
    const code = await uninstallAction();
    expect(code).toBe(0);
    expect(existsSync(expectedLnkPath)).toBe(false);
    expect(registryMock.deleteRegistry).toHaveBeenCalledTimes(1);
  });
});

describe('dispatch (entry-point con platform check)', () => {
  it('--install en win32 ejecuta installAction', async () => {
    registryMock.readRegistry.mockResolvedValue({ exists: false });
    expect(await dispatch({ install: true }, 'win32')).toBe(0);
    expect(snoreToastMock.installSnoreToastShortcut).toHaveBeenCalled();
  });
});
