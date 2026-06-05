// Instalación del acceso directo del AUMID vía SnoreToast `--install`.
//
// El .lnk binario MS-SHLLINK (lnk-format.ts) no basta: SnoreToast comprueba
// `shell:AppsFolder\<AUMID>` y, si falla, entra en "fallback mode" y el
// icono del header del toast queda como placeholder. El `--install` nativo
// crea el .lnk con IPropertyStore (AUMID + ToastActivatorCLSID) y registra
// el CLSID del activador en HKCU — requisito para branding correcto.
import { execFile } from 'child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { patchIconLocation } from './lnk-format.js';

const require = createRequire(fileURLToPath(import.meta.url));

export const SHORTCUT_ENGINE_SNORETOAST = 'snoretoast';

export function getSnoreToastPath(): string {
  const pkgDir = dirname(require.resolve('node-notifier/package.json'));
  const suffix = process.arch === 'x64' ? '64' : '86';
  const path = join(pkgDir, 'vendor', 'snoreToast', `snoretoast-x${suffix}.exe`);
  if (!existsSync(path)) {
    throw new Error(`SnoreToast no encontrado en ${path}`);
  }
  return path;
}

function execSnoreToast(args: string[]): Promise<void> {
  const snoreToast = getSnoreToastPath();
  return new Promise((resolve, reject) => {
    execFile(snoreToast, args, { windowsHide: true }, (err, stdout, stderr) => {
      const out = stdout == null ? '' : String(stdout);
      const errOut = stderr == null ? '' : String(stderr);
      if (err) {
        reject(Object.assign(err, { stdout: out, stderr: errOut }));
        return;
      }
      resolve();
    });
  });
}

/**
 * Crea el .lnk en el Menú Inicio con el flujo oficial de SnoreToast.
 * `lnkFileName` es solo el nombre (p. ej. `AI Assistant.lnk`), no ruta absoluta.
 * `targetExe` suele ser la propia ruta de SnoreToast (mismo criterio que el README).
 */
export async function installSnoreToastShortcut(
  lnkFileName: string,
  targetExe: string,
  aumid: string,
  lnkAbsolutePath: string,
  iconLocation: string,
): Promise<void> {
  if (existsSync(lnkAbsolutePath)) {
    unlinkSync(lnkAbsolutePath);
  }
  await execSnoreToast(['-install', lnkFileName, targetExe, aumid]);

  // SnoreToast no asigna IconLocation: el header del toast hereda el icono
  // del .exe target (SnoreToast genérico). Fijamos el .ico del branding.
  const lnk = readFileSync(lnkAbsolutePath);
  const patched = patchIconLocation(lnk, iconLocation);
  writeFileSync(lnkAbsolutePath, patched);
}
