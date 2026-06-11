/**
 * Lógica pura de la feature "statusline" para el instalador universal.
 *
 * Patrón seguro (S4): `applyStatuslineUninstall` preserva statusLine ajeno
 * si `force` es false. Solo borra si el comando actual es de SCP o se pasa
 * `--force`.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SMART_CODE_PROXY_ROOT_KEY, type ClaudeSettings } from '../shared/claude-settings.js';
import { buildNpxTsxCommand, resolvePosixAbsolutePath } from '../shared/npx-tsx-command.js';

export { SMART_CODE_PROXY_ROOT_KEY };

const ROUTER_STATUS_SEGMENT = 'scripting/router-status.ts';

export function isSmartCodeStatusLine(command: string | undefined): boolean {
  if (typeof command !== 'string') return false;
  return command.replace(/\\/g, '/').includes(ROUTER_STATUS_SEGMENT);
}

export function buildStatusLineCommand(proxyRoot: string): string {
  return buildNpxTsxCommand(proxyRoot, ROUTER_STATUS_SEGMENT);
}

export function buildStatusLineBlock(command: string): NonNullable<ClaudeSettings['statusLine']> {
  return {
    type: 'command',
    command,
    padding: 0,
  };
}

export function shouldOverwriteStatusLine(
  existingCommand: string | undefined,
  force: boolean,
): { ok: true } | { ok: false; message: string } {
  if (force) return { ok: true };
  if (!existingCommand) return { ok: true };
  if (isSmartCodeStatusLine(existingCommand)) return { ok: true };
  return {
    ok: false,
    message:
      'Ya existe un statusLine que no es de Smart Code Proxy. Use --force para sobrescribirlo.',
  };
}

export function validateProxyRoot(proxyRoot: string): void {
  const root = resolve(proxyRoot);
  const scriptPath = join(root, ROUTER_STATUS_SEGMENT);
  const providersPath = join(root, 'routing', 'providers');
  if (!existsSync(scriptPath)) {
    throw new Error(`No se encontró ${scriptPath}. Ejecute el instalador desde la raíz del proxy.`);
  }
  if (!existsSync(providersPath)) {
    throw new Error(
      `No se encontró ${providersPath}. Compruebe --root o el directorio de trabajo.`,
    );
  }
}

export function applyStatuslineInstall(
  settings: ClaudeSettings,
  proxyRoot: string,
  force: boolean,
): ClaudeSettings | { error: string } {
  const check = shouldOverwriteStatusLine(settings.statusLine?.command, force);
  if (!check.ok) return { error: check.message };
  const command = buildStatusLineCommand(proxyRoot);
  const root = resolvePosixAbsolutePath(proxyRoot);
  const next: ClaudeSettings = { ...settings };
  next.statusLine = buildStatusLineBlock(command);
  if (!next.env) next.env = {};
  next.env[SMART_CODE_PROXY_ROOT_KEY] = root;
  return next;
}

/**
 * Desinstala statusline con preservación de ajeno (S4).
 * Si el comando actual no es de SCP y `force` es false, no toca nada.
 */
export function applyStatuslineUninstall(settings: ClaudeSettings, force: boolean): ClaudeSettings {
  const next: ClaudeSettings = { ...settings };
  const existing = next.statusLine?.command;
  if (existing && !isSmartCodeStatusLine(existing) && !force) {
    return next;
  }
  delete next.statusLine;
  if (next.env) {
    delete next.env[SMART_CODE_PROXY_ROOT_KEY];
    if (Object.keys(next.env).length === 0) delete next.env;
  }
  return next;
}
