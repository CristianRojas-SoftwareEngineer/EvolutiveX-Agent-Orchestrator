// Rutas ASCII-only para los assets de branding.
//
// Por qué existe: las APIs Windows shell que consultan el icono de un
// AUMID (para mostrarlo en el Action Center) tienen issues conocidos
// con caracteres no-ASCII en paths. La ruta canónica del repo
// (`C:\...\Proyectos\Smart Code Proxy\assets\notifications\ai-assistant.ico`)
// contiene la letra "ó" de "Proyectos", lo que hace que Windows
// muestre un icono genérico ("roto") en lugar del logo AI Assistant,
// aunque la AUMID se resuelva correctamente (el título "AI Assistant"
// sí aparece).
//
// Solución: `register.ts` copia los assets desde el repo a
// `%LOCALAPPDATA%\AIAssistant\` (ruta ASCII-only) durante
// `--install`, y usa esa ruta en el registro. La CLI usa la misma
// ruta para el `-p` (toast body image). El repo sigue siendo la fuente
// de verdad (los binarios versionados en `assets/notifications/`);
// el directorio bajo `%LOCALAPPDATA%` es un cache operativo.
import { existsSync } from 'fs';
import { join } from 'path';

const STABLE_ASSETS_DIR = join(
  process.env['LOCALAPPDATA'] ?? '',
  'AIAssistant',
);

export const STABLE_ICON_PATH = join(STABLE_ASSETS_DIR, 'ai-assistant.ico');
export const STABLE_PNG_PATH = join(STABLE_ASSETS_DIR, 'ai-assistant.png');

// Índice del frame 32×32 en `ai-assistant.ico` (orden: 0=16, 1=32, …, 5=256).
// El header del Action Center suele tomar ~32px del .lnk; `,1` evita el 16×16.
export const STABLE_ICON_FRAME_INDEX = 1;

export function buildStableIconLocation(icoPath: string = STABLE_ICON_PATH): string {
  return `${icoPath},${STABLE_ICON_FRAME_INDEX}`;
}

/** Ruta para `IconUri` (header del toast WinRT): PNG estable si existe, si no .ico. */
export function getStableIconUriPath(): string {
  return existsSync(STABLE_PNG_PATH) ? STABLE_PNG_PATH : STABLE_ICON_PATH;
}
