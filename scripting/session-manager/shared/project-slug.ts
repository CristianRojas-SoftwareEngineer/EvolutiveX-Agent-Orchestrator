import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectsDir } from './paths.js';

/** `/c/Users/Cristian/foo` → `C:\Users\Cristian\foo` */
export function posixToWindows(pathStr: string): string {
  const m = /^\/([a-zA-Z])\/(.*)$/.exec(pathStr);
  if (m) {
    const drive = m[1]!.toUpperCase();
    const rest = m[2]!.replace(/\//g, '\\');
    return `${drive}:\\${rest}`;
  }
  return pathStr.replace(/\//g, '\\');
}

/** `C:\Users\Cristian\Foo` → `C--Users-Cristian-Foo` (misma regla que Claude Code / PS1). */
export function projectPathToSlug(windowsPath: string): string {
  const normalized = windowsPath.replace(/\\/g, '/');
  const m = /^([A-Za-z]):\/?(.*)$/.exec(normalized);
  if (m) {
    const drive = m[1]!.toUpperCase();
    const rest = m[2]!.replace(/\/$/, '');
    // Claude Code sustituye separadores y espacios por guiones en el slug del proyecto.
    const encoded = rest.replace(/[/. ]/g, '-');
    return `${drive}--${encoded}`;
  }
  return windowsPath.replace(/[\\/:*?"<>|]/g, '-');
}

export function resolveProjectDir(projectArg: string): string {
  if (!projectArg?.trim()) {
    throw new Error('Se requiere --project (ruta del directorio de trabajo)');
  }
  const winPath = posixToWindows(projectArg.trim());
  const dirName = projectPathToSlug(winPath);
  const fullPath = join(getProjectsDir(), dirName);
  if (!existsSync(fullPath)) {
    throw new Error(`Directorio de proyecto no encontrado: ${fullPath}`);
  }
  return fullPath;
}
