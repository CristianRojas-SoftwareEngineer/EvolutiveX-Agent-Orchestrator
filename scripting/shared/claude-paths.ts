import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

let claudeDirOverride: string | undefined;

/** Redirige `~/.claude` para tests. */
export function setClaudeDirForTests(dir: string | undefined): void {
  claudeDirOverride = dir;
}

export function getClaudeDir(): string {
  return claudeDirOverride ?? join(homedir(), '.claude');
}

export function getProjectsDir(): string {
  return join(getClaudeDir(), 'projects');
}

export function getArchiveDir(): string {
  return join(getClaudeDir(), 'archived-sessions');
}

export function getSessionsDir(): string {
  return join(getClaudeDir(), 'sessions');
}

export function getSessionTagsPath(): string {
  return join(getClaudeDir(), 'session-tags.json');
}

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
