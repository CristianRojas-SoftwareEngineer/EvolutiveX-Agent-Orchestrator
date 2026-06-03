import { resolve } from 'node:path';

/** Comando `npx --prefix <root> tsx <scriptRelative> [args…]` con quoting multiplataforma. */
export function buildNpxTsxCommand(
  proxyRoot: string,
  scriptRelativePath: string,
  extraArgs: string[] = [],
): string {
  const root = resolve(proxyRoot);
  const isWin = process.platform === 'win32';
  const quotedRoot = isWin
    ? `"${root.replace(/"/g, '\\"')}"`
    : `'${root.replace(/'/g, "'\\''")}'`;
  const argsSuffix = extraArgs.length > 0 ? ` ${extraArgs.join(' ')}` : '';
  return `npx --prefix ${quotedRoot} tsx ${scriptRelativePath}${argsSuffix}`;
}
