// Wrapper sobre `reg.exe` (built-in en Windows) para escribir, leer y
// borrar la clave de registro que registra el AUMID de AI Assistant:
//
//   HKCU\Software\Classes\AppUserModelId\AIAssistant.Proxy
//     DisplayName (REG_SZ)         = "AI Assistant"
//     Icon        (REG_EXPAND_SZ)  = ruta al .ico (shell / acceso directo)
//     IconUri     (REG_SZ)         = ruta al .png estable (header WinRT)
//     IconBackgroundColor (REG_SZ) = "0" (sin tinte de acento extra)
//     ShowInSettings (REG_DWORD)   = 0
//
// Por qué existe: SnoreToast invoca `ToastNotificationManager.CreateToastNotifier(aumid)`.
// Windows resuelve el AUMID en dos sitios:
//   1. Esta clave de registro → efecto inmediato (sin caché).
//   2. El .lnk en el Menú Inicio → requiere que el shell lo indexe (puede
//      tardar minutos o un reinicio de `explorer.exe`).
// Por eso el helper `register.ts` escribe AMBOS: el registro para efecto
// inmediato, el .lnk como Start Menu tile (largo plazo).
//
// Implementación: `reg.exe` (no PowerShell, no es un lenguaje de
// scripting) invocado vía `child_process.execFile` (sin shell, args
// pasados directamente al binario). Cada función es una operación
// pequeña (1-2 invocaciones de `reg.exe`).
import { execFile } from 'child_process';
import type { ExecFileOptions } from 'child_process';

const REG_KEY_BASE = 'HKCU\\Software\\Classes\\AppUserModelId';

const EXEC_OPTS: ExecFileOptions = { windowsHide: true };

// `reg.exe` exit codes:
//   0 = success
//   1 = failed (e.g. key not found on `reg query`, permission denied)
const REG_NOT_FOUND_EXIT_CODE = 1;

function buildKey(aumid: string): string {
  return `${REG_KEY_BASE}\\${aumid}`;
}

function execReg(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile('reg', args, EXEC_OPTS, (err, stdout, stderr) => {
      // `execFile` callback tipa stdout/stderr como `string | Buffer`.
      // Para `reg.exe` siempre vienen como string (la salida es texto);
      // casteamos explícitamente para satisfacer el tipo de retorno.
      const out = typeof stdout === 'string' ? stdout : stdout.toString('utf8');
      const errOut = typeof stderr === 'string' ? stderr : stderr.toString('utf8');
      if (err) {
        reject(Object.assign(err, { stdout: out, stderr: errOut }));
        return;
      }
      resolve({ stdout: out, stderr: errOut });
    });
  });
}

export const REG_SHORTCUT_ENGINE = 'ShortcutEngine';

export interface RegistryState {
  exists: boolean;
  displayName?: string;
  icon?: string;
  iconUri?: string;
  shortcutEngine?: string;
}

/**
 * Lee la clave de registro del AUMID. Devuelve `exists: false` si la
 * clave no existe (cualquier otro error se propaga).
 */
export async function readRegistry(aumid: string): Promise<RegistryState> {
  try {
    const { stdout } = await execReg(['query', buildKey(aumid)]);
    const result: RegistryState = { exists: true };
    // `reg query` output (Windows 10/11):
    //   HKEY_CURRENT_USER\Software\Classes\AppUserModelId\AIAssistant.Proxy
    //       DisplayName    REG_SZ    AI Assistant
    //       Icon           REG_EXPAND_SZ    C:\path\to\icon.ico
    for (const line of stdout.split(/\r?\n/)) {
      const match = /^\s+(DisplayName|Icon|IconUri|ShortcutEngine)\s+REG_(?:SZ|EXPAND_SZ|DWORD)\s+(.*?)\s*$/i.exec(line);
      if (match) {
        const name = String(match[1]).toLowerCase();
        const value = String(match[2]);
        if (name === 'displayname') result.displayName = value;
        if (name === 'icon') result.icon = value;
        if (name === 'iconuri') result.iconUri = value;
        if (name === 'shortcutengine') result.shortcutEngine = value;
      }
    }
    return result;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException & { code?: number }).code;
    if (code === REG_NOT_FOUND_EXIT_CODE) {
      return { exists: false };
    }
    // Stderr de `reg query` cuando la clave no existe contiene
    // "ERROR: The system was unable to find the specified registry key
    // or value." — pero el exit code ya es 1, así que esto es solo
    // un fallback.
    const stderr = (err as { stderr?: string }).stderr ?? '';
    if (/unable to find/i.test(stderr)) {
      return { exists: false };
    }
    throw err;
  }
}

/**
 * Escribe (o sobrescribe con `/f`) el branding del AUMID en registro.
 * `iconIcoPath` → shell (`Icon`); `iconUriPath` → header del toast (`IconUri`, suele ser el .png).
 */
export async function writeRegistry(
  aumid: string,
  displayName: string,
  iconIcoPath: string,
  iconUriPath: string,
): Promise<void> {
  const key = buildKey(aumid);
  await execReg(['add', key, '/v', 'DisplayName', '/t', 'REG_SZ', '/d', displayName, '/f']);
  await execReg(['add', key, '/v', 'Icon', '/t', 'REG_EXPAND_SZ', '/d', iconIcoPath, '/f']);
  await execReg(['add', key, '/v', 'IconUri', '/t', 'REG_SZ', '/d', iconUriPath, '/f']);
  await execReg(['add', key, '/v', 'IconBackgroundColor', '/t', 'REG_SZ', '/d', '0', '/f']);
  await execReg(['add', key, '/v', 'ShowInSettings', '/t', 'REG_DWORD', '/d', '0', '/f']);
  await execReg(['add', key, '/v', REG_SHORTCUT_ENGINE, '/t', 'REG_SZ', '/d', 'snoretoast', '/f']);
}

/**
 * Borra la clave del AUMID. Es no-op si no existe.
 */
export async function deleteRegistry(aumid: string): Promise<void> {
  try {
    await execReg(['delete', buildKey(aumid), '/f']);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException & { code?: number }).code;
    if (code === REG_NOT_FOUND_EXIT_CODE) {
      return; // no-op
    }
    const stderr = (err as { stderr?: string }).stderr ?? '';
    if (/unable to find/i.test(stderr)) {
      return; // no-op
    }
    throw err;
  }
}
