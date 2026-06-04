import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

export interface ValidProxyRootOptions {
  prefix?: string;
  withSessionsDir?: boolean;
}

/**
 * Crea un directorio temporal que satisface TODAS las validaciones del
 * orquestador universal `setup.ts`:
 * - statusline: `scripting/router-status.ts` + `routing/providers/`
 * - voice: sin dependencias en disco
 * - hooks: `configs/hooks.json` + `scripting/post-hook-event.ts` +
 *   `scripting/stop-hook-ux.ts` + `src/2-services/notifications/cli.ts`
 *
 * Usado por tests del orquestador y de las features que requieren fixture
 * completo (statusline, hooks).
 */
export function createValidProxyRoot(options: ValidProxyRootOptions = {}): string {
  const prefix = options.prefix ?? 'scp-proxy-';
  const root = mkdtempSync(join(tmpdir(), prefix));
  // Statusline
  mkdirSync(join(root, 'scripting'), { recursive: true });
  writeFileSync(join(root, 'scripting', 'router-status.ts'), '', 'utf-8');
  mkdirSync(join(root, 'routing', 'providers'), { recursive: true });
  // Hooks
  mkdirSync(join(root, 'configs'), { recursive: true });
  writeFileSync(
    join(root, 'configs', 'hooks.json'),
    JSON.stringify({ hooks: {} }, null, 2),
    'utf-8',
  );
  writeFileSync(join(root, 'scripting', 'post-hook-event.ts'), 'export {}', 'utf-8');
  writeFileSync(join(root, 'scripting', 'stop-hook-ux.ts'), 'export {}', 'utf-8');
  mkdirSync(join(root, 'src', '2-services', 'notifications'), { recursive: true });
  writeFileSync(join(root, 'src', '2-services', 'notifications', 'cli.ts'), 'export {}', 'utf-8');
  if (options.withSessionsDir) {
    mkdirSync(join(root, 'sessions'), { recursive: true });
  }
  return resolve(root);
}

/**
 * Crea un directorio temporal con `configs/hooks.json` cuyo contenido se
 * puede personalizar. Usado por tests de `features/hooks` que necesitan
 * una plantilla canónica específica.
 */
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

/**
 * Crea un directorio temporal que satisface solo la validación de statusline.
 * Usado por tests que ejercitan `--statusline` aislado.
 */
export function createValidProxyRootForStatusline(prefix = 'scp-statusline-'): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, 'scripting'), { recursive: true });
  writeFileSync(join(root, 'scripting', 'router-status.ts'), '', 'utf-8');
  mkdirSync(join(root, 'routing', 'providers'), { recursive: true });
  return resolve(root);
}
