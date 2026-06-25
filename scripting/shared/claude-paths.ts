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

/**
 * Normaliza rutas al formato nativo del SO de ejecución.
 * - win32: convierte /c/Users/... → C:\Users\... (Git Bash / MSYS) y /C/... → C:\...
 * - posix: retorna la ruta sin cambios (ya está en formato nativo).
 */
export function posixToWindows(pathStr: string): string {
  if (process.platform === 'win32') {
    const m = /^\/([a-zA-Z])\/(.*)$/.exec(pathStr);
    if (m) {
      const drive = m[1]!.toUpperCase();
      const rest = m[2]!.replace(/\//g, '\\');
      return `${drive}:\\${rest}`;
    }
    return pathStr.replace(/\//g, '\\');
  }
  return pathStr;
}

/**
 * Convierte una ruta al slug que usa Claude Code para nombrar ~/.claude/projects/<slug>.
 * Algoritmo canónico verificado contra los slugs reales:
 * - win32: `C:\Users\user\Foo` → `C--Users-user-Foo`
 * - posix: `/home/user/foo` → `-home-user-foo` (pwd | sed 's/\\//-/g')
 */
export function projectPathToSlug(windowsPath: string): string {
  if (process.platform === 'win32') {
    const normalized = windowsPath.replace(/\\/g, '/');
    const m = /^([A-Za-z]):\/?(.*)$/.exec(normalized);
    if (m) {
      const drive = m[1]!.toUpperCase();
      const rest = m[2]!.replace(/\/$/, '');
      const encoded = rest.replace(/[/. ]/g, '-');
      return `${drive}--${encoded}`;
    }
    return windowsPath.replace(/[\\/:*?"<>|]/g, '-');
  }
  // Posix: algoritmo canónico de Claude Code (cada / → -)
  return windowsPath.replace(/\//g, '-');
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
