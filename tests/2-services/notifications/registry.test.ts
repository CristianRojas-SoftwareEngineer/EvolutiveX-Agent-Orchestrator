// Tests del wrapper de `reg.exe` (registry.ts). Mockeamos
// `child_process.execFile` para no tocar el registro real en CI ni
// en máquinas de desarrollo.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: execFileMock,
}));

import {
  readRegistry,
  writeRegistry,
  deleteRegistry,
} from '../../../src/2-services/notifications/registry.js';

const AUMID = 'AIAssistant.Proxy';

// Helper para crear el callback de execFile con stdout/stderr controlados.
function cbOk(
  stdout: string,
  stderr = '',
): (
  cmd: string,
  args: string[],
  opts: unknown,
  cb: (err: null, stdout: string, stderr: string) => void,
) => void {
  return (_cmd, _args, _opts, cb) => {
    cb(null, stdout, stderr);
  };
}

function cbErr(
  code: number,
  stdout = '',
  stderr = '',
): (
  cmd: string,
  args: string[],
  opts: unknown,
  cb: (err: NodeJS.ErrnoException, stdout: string, stderr: string) => void,
) => void {
  return (_cmd, _args, _opts, cb) => {
    const err = Object.assign(new Error('reg.exe failed'), { code: String(code) });
    cb(err, stdout, stderr);
  };
}

beforeEach(() => {
  execFileMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readRegistry', () => {
  it('devuelve exists=true con displayName e icon parseados', async () => {
    const stdout = [
      'HKEY_CURRENT_USER\\Software\\Classes\\AppUserModelId\\AIAssistant.Proxy',
      '    DisplayName    REG_SZ    AI Assistant',
      '    Icon           REG_EXPAND_SZ    C:\\path\\to\\icon.ico',
      '',
    ].join('\r\n');
    execFileMock.mockImplementationOnce(cbOk(stdout));
    const result = await readRegistry(AUMID);
    expect(result.exists).toBe(true);
    expect(result.displayName).toBe('AI Assistant');
    expect(result.icon).toBe('C:\\path\\to\\icon.ico');
  });

  it('devuelve exists=true sin valores si la clave está vacía', async () => {
    const stdout = [
      'HKEY_CURRENT_USER\\Software\\Classes\\AppUserModelId\\AIAssistant.Proxy',
      '',
    ].join('\r\n');
    execFileMock.mockImplementationOnce(cbOk(stdout));
    const result = await readRegistry(AUMID);
    expect(result.exists).toBe(true);
    expect(result.displayName).toBeUndefined();
    expect(result.icon).toBeUndefined();
  });

  it('devuelve exists=false cuando reg.exe retorna exit 1 (clave no existe)', async () => {
    execFileMock.mockImplementationOnce(
      cbErr(1, '', 'ERROR: The system was unable to find the specified registry key or value.'),
    );
    const result = await readRegistry(AUMID);
    expect(result.exists).toBe(false);
  });

  it('propaga el error cuando reg.exe retorna exit code distinto a 1', async () => {
    execFileMock.mockImplementationOnce(cbErr(2, '', 'Access denied'));
    await expect(readRegistry(AUMID)).rejects.toThrow();
  });

  it('invoca reg query con la clave correcta', async () => {
    execFileMock.mockImplementationOnce(cbOk(''));
    await readRegistry(AUMID);
    const [cmd, args] = execFileMock.mock.calls[0]!;
    expect(cmd).toBe('reg');
    expect(args).toEqual(['query', `HKCU\\Software\\Classes\\AppUserModelId\\${AUMID}`]);
  });
});

describe('writeRegistry', () => {
  it('invoca reg add con DisplayName, Icon, IconUri, IconBackgroundColor y ShowInSettings', async () => {
    execFileMock.mockImplementation(cbOk(''));
    await writeRegistry(AUMID, 'AI Assistant', 'C:\\path\\to\\icon.ico', 'C:\\path\\to\\logo.png');
    expect(execFileMock).toHaveBeenCalledTimes(6);
    const cmd1 = execFileMock.mock.calls[0]!;
    expect(cmd1[0]).toBe('reg');
    expect(cmd1[1]).toEqual([
      'add',
      `HKCU\\Software\\Classes\\AppUserModelId\\${AUMID}`,
      '/v',
      'DisplayName',
      '/t',
      'REG_SZ',
      '/d',
      'AI Assistant',
      '/f',
    ]);
    const cmd2 = execFileMock.mock.calls[1]!;
    expect(cmd2[1]).toEqual([
      'add',
      `HKCU\\Software\\Classes\\AppUserModelId\\${AUMID}`,
      '/v',
      'Icon',
      '/t',
      'REG_EXPAND_SZ',
      '/d',
      'C:\\path\\to\\icon.ico',
      '/f',
    ]);
    const cmd3 = execFileMock.mock.calls[2]!;
    expect(cmd3[1]).toEqual([
      'add',
      `HKCU\\Software\\Classes\\AppUserModelId\\${AUMID}`,
      '/v',
      'IconUri',
      '/t',
      'REG_SZ',
      '/d',
      'C:\\path\\to\\logo.png',
      '/f',
    ]);
  });

  it('propaga el error si reg add falla', async () => {
    execFileMock.mockImplementationOnce(cbErr(5, '', 'Access denied'));
    await expect(writeRegistry(AUMID, 'X', 'C:\\a.ico', 'C:\\b.png')).rejects.toThrow();
  });
});

describe('deleteRegistry', () => {
  it('invoca reg delete con la clave correcta y /f', async () => {
    execFileMock.mockImplementationOnce(cbOk(''));
    await deleteRegistry(AUMID);
    const [cmd, args] = execFileMock.mock.calls[0]!;
    expect(cmd).toBe('reg');
    expect(args).toEqual(['delete', `HKCU\\Software\\Classes\\AppUserModelId\\${AUMID}`, '/f']);
  });

  it('es no-op (no propaga) cuando la clave no existe (exit 1)', async () => {
    execFileMock.mockImplementationOnce(
      cbErr(1, '', 'ERROR: The system was unable to find the specified registry key or value.'),
    );
    await expect(deleteRegistry(AUMID)).resolves.toBeUndefined();
  });

  it('propaga el error si reg delete falla con código distinto a 1', async () => {
    execFileMock.mockImplementationOnce(cbErr(5, '', 'Access denied'));
    await expect(deleteRegistry(AUMID)).rejects.toThrow();
  });
});
