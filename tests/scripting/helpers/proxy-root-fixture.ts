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
  mkdirSync(join(root, 'src', '2-services', 'notifications'), { recursive: true });
  writeFileSync(join(root, 'src', '2-services', 'notifications', 'cli.ts'), '', 'utf-8');
  if (options.withSessionsDir) {
    mkdirSync(join(root, 'sessions'), { recursive: true });
  }
  return resolve(root);
}

/** Raíz válida para install-notifications (solo exige cli.ts). */
export function createValidProxyRootForNotifications(prefix = 'scp-notif-'): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, 'src', '2-services', 'notifications'), { recursive: true });
  writeFileSync(join(root, 'src', '2-services', 'notifications', 'cli.ts'), '', 'utf-8');
  return resolve(root);
}

/** Raíz válida para setup-hooks (exige configs/hooks.json + scripts + cli.ts). */
export function createValidProxyRootForHooks(
  prefix = 'scp-hooks-',
  hooksJsonContent: object = { hooks: {} },
): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, 'configs'), { recursive: true });
  writeFileSync(
    join(root, 'configs', 'hooks.json'),
    JSON.stringify(hooksJsonContent, null, 2),
    'utf-8',
  );
  mkdirSync(join(root, 'scripting'), { recursive: true });
  writeFileSync(join(root, 'scripting', 'post-hook-event.ts'), 'export {}', 'utf-8');
  writeFileSync(join(root, 'scripting', 'stop-hook-ux.ts'), 'export {}', 'utf-8');
  mkdirSync(join(root, 'src', '2-services', 'notifications'), { recursive: true });
  writeFileSync(join(root, 'src', '2-services', 'notifications', 'cli.ts'), 'export {}', 'utf-8');
  return resolve(root);
}
