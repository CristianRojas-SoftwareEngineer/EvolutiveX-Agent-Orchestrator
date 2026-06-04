import { resolve } from 'node:path';

/** Ruta absoluta con `/` (válida en Node, npx y tsx en Windows, macOS y Linux). */
export function resolvePosixAbsolutePath(...segments: string[]): string {
  return resolve(...segments).replace(/\\/g, '/');
}

function quoteShellPath(path: string, isWin: boolean): string {
  if (isWin) {
    return `"${path.replace(/"/g, '\\"')}"`;
  }
  return `'${path.replace(/'/g, "'\\''")}'`;
}

/** Comando `npx --prefix <root> tsx <scriptAbsoluto> [args…]` con quoting multiplataforma. */
export function buildNpxTsxCommand(
  proxyRoot: string,
  scriptRelativePath: string,
  extraArgs: string[] = [],
): string {
  const root = resolvePosixAbsolutePath(proxyRoot);
  const scriptPath = resolvePosixAbsolutePath(proxyRoot, scriptRelativePath);
  const isWin = process.platform === 'win32';
  const quotedRoot = quoteShellPath(root, isWin);
  const quotedScript = quoteShellPath(scriptPath, isWin);
  const argsSuffix = extraArgs.length > 0 ? ` ${extraArgs.join(' ')}` : '';
  return `npx --prefix ${quotedRoot} tsx ${quotedScript}${argsSuffix}`;
}
