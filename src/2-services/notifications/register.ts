// Helper de registro de AUMID (Application User Model ID) en Windows.
// Capa 4 PKA: entry point CLI standalone, opt-in, idempotente.
//
// En Windows, registra el AUMID en DOS sitios para que las
// notificaciones firmadas por SnoreToast muestren el branding "AI
// Assistant" de forma consistente:
//
//   1. Registro: HKCU\Software\Classes\AppUserModelId\{AUMID}
//      con DisplayName e Icon (vía `reg.exe`).
//      → Efecto INMEDIATO: UWP/SnoreToast lee esta clave directamente
//        sin depender de la caché del shell.
//
//   2. Menú Inicio: %APPDATA%\...\AI Assistant.lnk (SnoreToast `-install` +
//      parche de IconLocation al .ico estable en LOCALAPPDATA).
//      → Sin SnoreToast, `shell:AppsFolder\<AUMID>` falla (icono header roto).
//      → Sin IconLocation en el .lnk, Windows usa el icono de snoretoast.exe.
//
// Además, copia los assets (.ico + .png) desde el repo a
// `%LOCALAPPDATA%\AIAssistant\` para usar una ruta ASCII-only. Las
// Windows shell APIs que consultan el icono de un AUMID tienen issues
// conocidos con caracteres no-ASCII en paths (la "ó" de "Proyectos"
// en la ruta del repo); con la copia a LOCALAPPDATA el icono se
// renderiza correctamente.
//
// Implementación:
//   - `.lnk`: TypeScript puro (`lnk-format.ts`, MS-SHLLINK binario).
//   - Registro: `reg.exe` (CLI built-in de Windows, NO es PowerShell).
//   - Assets: copiados a LOCALAPPDATA (ASCII-only) vía `fs.copyFileSync`.
import { Command } from 'commander';
import { createHash } from 'crypto';
import { copyFileSync, existsSync, mkdirSync, unlinkSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve as resolvePath, join, dirname } from 'path';
import { readRegistry, writeRegistry, deleteRegistry } from './registry.js';
import {
  STABLE_ICON_PATH,
  STABLE_PNG_PATH,
  buildStableIconLocation,
  getStableIconUriPath,
} from './asset-paths.js';
import { parseIconLocation } from './lnk-format.js';
import {
  SHORTCUT_ENGINE_SNORETOAST,
  getSnoreToastPath,
  installSnoreToastShortcut,
} from './snoretoast-shortcut.js';

// Constantes del branding. `AUMID` sigue la convención Windows
// `[Compañía].[App]`, sin espacios, ≤ 129 caracteres.
export const AUMID = 'AIAssistant.Proxy';
export const DISPLAY_NAME = 'AI Assistant';
const LNK_FILENAME = `${DISPLAY_NAME}.lnk`;

// Validación defensiva del AUMID (override por env `AI_ASSISTANT_AUMID`).
// La regex sigue el límite Windows y los caracteres permitidos:
// letras, dígitos, punto y guion; longitud 1..129.
const AUMID_REGEX = /^[A-Za-z0-9.-]{1,129}$/;

function getAumid(): string {
  return process.env['AI_ASSISTANT_AUMID'] ?? AUMID;
}

export function isValidAumid(value: string): boolean {
  return AUMID_REGEX.test(value);
}

// Resolver la ruta del `.lnk` en el Menú Inicio del usuario.
export function getLnkPath(): string {
  const appData = process.env['APPDATA'] ?? '';
  return join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', LNK_FILENAME);
}

// Resolver la ruta al `.ico` desde el `import.meta.url` del módulo.
// Se usa `dirname` del módulo para que `..` se aplique sobre el
// directorio `src/2-services/notifications/` y no sobre el nombre de
// archivo `register.ts` (con `path.resolve(file, '../..')` el primer
// `..` cancela el nombre del archivo, no el directorio).
//
// Esta es la ruta "fuente" en el repo. La ruta "estable" usada en el
// registro y la CLI es `STABLE_ICON_PATH` (en `%LOCALAPPDATA%\AIAssistant\`),
// que es ASCII-only para evitar issues con Windows shell APIs.
export function getIconIcoPath(): string {
  return resolvePath(
    resolvePath(fileURLToPath(import.meta.url), '..'),
    '../../..',
    'assets/notifications/ai-assistant.ico',
  );
}

export function getIconPngPath(): string {
  return resolvePath(
    resolvePath(fileURLToPath(import.meta.url), '..'),
    '../../..',
    'assets/notifications/ai-assistant.png',
  );
}

function fileSha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// Copia un asset solo si el contenido cambió (evita no-op cuando el repo
// regeneró binarios pero registro + .lnk siguen “OK”).
function copyFileIfChanged(source: string, dest: string): boolean {
  if (existsSync(dest) && fileSha256(source) === fileSha256(dest)) {
    return false;
  }
  copyFileSync(source, dest);
  return true;
}

// Copia los assets desde el repo a `%LOCALAPPDATA%\AIAssistant\`
// (ASCII-only). Devuelve `updated: true` si algún binario cambió.
function ensureStableAssets(): { icoPath: string; pngPath: string; updated: boolean } {
  const sourceIco = getIconIcoPath();
  const sourcePng = getIconPngPath();
  if (!existsSync(sourceIco)) {
    throw new Error(`Icono fuente no encontrado en ${sourceIco}`);
  }
  mkdirSync(dirname(STABLE_ICON_PATH), { recursive: true });
  const icoUpdated = copyFileIfChanged(sourceIco, STABLE_ICON_PATH);
  let pngUpdated = false;
  if (existsSync(sourcePng)) {
    pngUpdated = copyFileIfChanged(sourcePng, STABLE_PNG_PATH);
  }
  return {
    icoPath: STABLE_ICON_PATH,
    pngPath: STABLE_PNG_PATH,
    updated: icoUpdated || pngUpdated,
  };
}

// Resultado del check de idempotencia: ¿están ambos sitios
// (registro y .lnk) configurados con los valores objetivo?
interface InstallState {
  lnkOk: boolean;
  registryOk: boolean;
}

async function checkInstallState(
  aumid: string,
  iconIcoPath: string,
  iconUriPath: string,
): Promise<InstallState> {
  const registry = await readRegistry(aumid);
  const lnkPath = getLnkPath();
  let lnkIconOk = false;
  if (existsSync(lnkPath)) {
    try {
      lnkIconOk = parseIconLocation(readFileSync(lnkPath)) === buildStableIconLocation(iconIcoPath);
    } catch {
      lnkIconOk = false;
    }
  }
  const lnkOk = lnkIconOk
    && registry.shortcutEngine === SHORTCUT_ENGINE_SNORETOAST;
  const registryOk = registry.exists
    && registry.displayName === DISPLAY_NAME
    && registry.icon === iconIcoPath
    && registry.iconUri === iconUriPath
    && registry.shortcutEngine === SHORTCUT_ENGINE_SNORETOAST;
  return { lnkOk, registryOk };
}

export async function installAction(): Promise<number> {
  const aumid = getAumid();
  if (!isValidAumid(aumid)) {
    process.stderr.write(`AUMID inválido: "${aumid}". Debe coincidir con /^[A-Za-z0-9.\\-]{1,129}$/\n`);
    return 1;
  }
  const lnkPath = getLnkPath();

  if (!existsSync(getIconIcoPath())) {
    process.stderr.write(`Icono no encontrado en ${getIconIcoPath()}. Aborta.\n`);
    return 1;
  }

  // Copiar assets a LOCALAPPDATA (ruta ASCII-only) para evitar issues
  // de Windows shell APIs con caracteres no-ASCII en paths. Esta es
  // la ruta que se usará en el registro y que la CLI usará como
  // toast body image.
  let stableIcoPath: string;
  let assetsUpdated: boolean;
  try {
    const stable = ensureStableAssets();
    stableIcoPath = stable.icoPath;
    assetsUpdated = stable.updated;
  } catch (err) {
    process.stderr.write(`Error copiando assets a LOCALAPPDATA: ${(err as Error).message}\n`);
    return 1;
  }

  const iconUriPath = getStableIconUriPath();
  const state = await checkInstallState(aumid, stableIcoPath, iconUriPath);
  const needsRegistry = !state.registryOk || assetsUpdated;
  const needsLnk = !state.lnkOk || assetsUpdated;

  // Idempotencia: no-op solo si registro, .lnk y assets en disco están al día.
  if (!needsRegistry && !needsLnk) {
    process.stdout.write(`AUMID ya registrado (AppUserModelID="${aumid}"): registro OK + .lnk OK. No-op.\n`);
    return 0;
  }

  // 1. Registro (efecto inmediato en UWP/SnoreToast).
  if (needsRegistry) {
    try {
      await writeRegistry(aumid, DISPLAY_NAME, stableIcoPath, iconUriPath);
    } catch (err) {
      process.stderr.write(`Error escribiendo registro: ${(err as Error).message}\n`);
      return 1;
    }
  }

  // 2. .lnk vía SnoreToast (COM + ToastActivatorCLSID → shell:AppsFolder\<AUMID>).
  if (needsLnk) {
    try {
      const snoreToast = getSnoreToastPath();
      await installSnoreToastShortcut(LNK_FILENAME, snoreToast, aumid, lnkPath);
    } catch (err) {
      process.stderr.write(`Error creando .lnk con SnoreToast (registro sí se escribió): ${(err as Error).message}\n`);
      return 1;
    }
  }

  process.stdout.write(`Registrado: AppUserModelID="${aumid}" DisplayName="${DISPLAY_NAME}" (registro + .lnk SnoreToast=${lnkPath}, icono=${stableIcoPath} [copia ASCII-only]).\n`);
  return 0;
}

export async function uninstallAction(): Promise<number> {
  const aumid = getAumid();
  const lnkPath = getLnkPath();

  // Borrar el .lnk primero (es local; el error más común es ENOENT
  // si no existe, que tratamos como no-op).
  try {
    unlinkSync(lnkPath);
    process.stdout.write(`Eliminado .lnk: ${lnkPath}\n`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      process.stderr.write(`Error eliminando .lnk: ${(err as Error).message}\n`);
      return 1;
    }
  }

  // Borrar el registro (no-op si no existe).
  try {
    await deleteRegistry(aumid);
    process.stdout.write(`Eliminado registro: ${aumid}\n`);
  } catch (err) {
    process.stderr.write(`Error eliminando registro: ${(err as Error).message}\n`);
    return 1;
  }

  process.stdout.write(`Reversión completa. SnoreToast volverá a firmar como "SnoreToast" hasta el próximo --install.\n`);
  return 0;
}

export async function statusAction(): Promise<number> {
  const aumid = getAumid();
  const lnkPath = getLnkPath();

  const lnkExists = existsSync(lnkPath);

  let registry;
  try {
    registry = await readRegistry(aumid);
  } catch (err) {
    process.stderr.write(`Error leyendo registro: ${(err as Error).message}\n`);
    registry = { exists: false };
  }

  if (!lnkExists && !registry.exists) {
    process.stdout.write('not registered. Ejecuta `npm run notifications:register -- --install` para habilitar el branding en Windows\n');
  } else if (
    registry.exists
    && registry.displayName === DISPLAY_NAME
    && registry.icon === STABLE_ICON_PATH
    && registry.iconUri === getStableIconUriPath()
    && registry.shortcutEngine === SHORTCUT_ENGINE_SNORETOAST
    && lnkExists
    && parseIconLocation(readFileSync(lnkPath)) === buildStableIconLocation()
  ) {
    process.stdout.write(`registered: AppUserModelID="${aumid}" DisplayName="${DISPLAY_NAME}" (registro + .lnk SnoreToast OK)\n`);
  } else {
    const parts: string[] = [];
    parts.push(registry.exists
      ? `registro: DisplayName="${registry.displayName}" Icon="${registry.icon}" IconUri="${registry.iconUri ?? '(ausente)'}" ShortcutEngine="${registry.shortcutEngine ?? '(ausente)'}"`
      : 'registro: no presente');
    parts.push(lnkExists ? '.lnk: presente' : '.lnk: no presente');
    process.stdout.write(`partially registered (${parts.join('; ')}). Ejecuta --install para reparar.\n`);
  }
  return 0;
}

async function main(): Promise<number> {
  const program = new Command();
  program
    .name('notifications-register')
    .description('Registra, desregistra o consulta el AUMID de AI Assistant en Windows (idempotente, opt-in).')
    .allowExcessArguments(false)
    .option('--install', 'Crea o actualiza el .lnk en el Menú Inicio y la clave de registro del AUMID')
    .option('--uninstall', 'Elimina el .lnk y la clave de registro del AUMID')
    .option('--status', 'Muestra el estado actual del registro (registro + .lnk)')
    .parse(process.argv);

  const opts = program.opts<DispatchOpts>();
  return dispatch(opts);
}

export interface DispatchOpts {
  install?: boolean;
  uninstall?: boolean;
  status?: boolean;
}

export async function dispatch(opts: DispatchOpts, platform: NodeJS.Platform = process.platform): Promise<number> {
  if (platform !== 'win32') {
    process.stdout.write('AUMID setup is Windows-only. En macOS/Linux el branding se aplica via `appName` en node-notifier (sin registro).\n');
    return 0;
  }

  if (opts.install) return installAction();
  if (opts.uninstall) return uninstallAction();
  if (opts.status) return statusAction();

  process.stderr.write('Especifica uno de: --install, --uninstall, --status\n');
  return 1;
}

// Auto-ejecutar solo cuando este módulo es el entry point (evita que
// `import` desde tests dispare `main()` + `process.exit()`).
// `import.meta.url` y `process.argv[1]` solo coinciden cuando Node
// ejecuta este archivo directamente vía `node` o `tsx`.
const isEntryPoint =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === resolvePath(process.argv[1]);

if (isEntryPoint) {
  main().then(
    (code) => {
      process.exit(code);
    },
    (err) => {
      process.stderr.write(`Error inesperado: ${(err as Error).message}\n`);
      process.exit(1);
    },
  );
}
