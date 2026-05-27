import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

export interface ValidProxyRootOptions {
  prefix?: string;
  withSessionsDir?: boolean;
}

/**
 * Crea un directorio temporal que cumple validateProxyRoot del instalador.
 */
export function createValidProxyRoot(options: ValidProxyRootOptions = {}): string {
  const prefix = options.prefix ?? 'scp-proxy-';
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, 'scripting'), { recursive: true });
  writeFileSync(join(root, 'scripting', 'router-status.ts'), '', 'utf-8');
  mkdirSync(join(root, 'routing', 'providers'), { recursive: true });
  if (options.withSessionsDir) {
    mkdirSync(join(root, 'sessions'), { recursive: true });
  }
  return resolve(root);
}
