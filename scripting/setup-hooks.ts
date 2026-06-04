/**
 * Instalador seguro de hooks de SCP con merge selectivo.
 *
 * Instala las 14 entradas de hooks (lifecycle + UX) en `~/.claude/settings.json`
 * con política de preservación:
 * - user-only → se preserva intacto (SCP no toca salvo --force)
 * - scp-only → se reemplaza con versión canónica
 * - mixed → se preservan ajenos, se agregan faltantes de SCP
 *
 * Consumidores: `npm run setup -- --hooks` o `npm run setup:hooks`.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  readClaudeSettings,
  writeClaudeSettings,
  SMART_CODE_PROXY_ROOT_KEY,
  type ClaudeSettings,
} from './shared/claude-settings.js';

// ─── Constantes ──────────────────────────────────────────────────────────────

const HOOKS_JSON_SEGMENT = 'configs/hooks.json';
const POST_HOOK_EVENT_SEGMENT = 'scripting/post-hook-event.ts';
const STOP_HOOK_UX_SEGMENT = 'scripting/stop-hook-ux.ts';
const NOTIFICATIONS_CLI_SEGMENT = 'src/2-services/notifications/cli.ts';
const PLACEHOLDER = '${SMART_CODE_PROXY_ROOT}';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface HookEntry {
  type: string;
  command: string;
  timeout?: number;
  statusMessage?: string;
}

export interface HookBlock {
  matcher?: string;
  hooks: HookEntry[];
}

export type HooksBlock = Record<string, HookBlock[]>;

export interface SetupHooksRunOptions {
  root: string;
  dryRun: boolean;
  force: boolean;
  uninstall: boolean;
}

export type KeyClassification = 'scp-only' | 'user-only' | 'mixed';

// ─── Funciones puras ─────────────────────────────────────────────────────────

/**
 * Reemplaza `${SMART_CODE_PROXY_ROOT}` por la ruta resuelta del repo.
 * Windows-safe: normaliza backslashes a forward slashes antes de comparar.
 */
export function resolveCommandPlaceholders(command: string, scpRoot: string): string {
  return command.split(PLACEHOLDER).join(scpRoot);
}

/**
 * Resuelve todos los placeholders de una plantilla canónica.
 */
export function resolveHooksBlock(hooks: HooksBlock, scpRoot: string): HooksBlock {
  const resolved: HooksBlock = {};
  for (const [key, blocks] of Object.entries(hooks)) {
    resolved[key] = blocks.map(block => ({
      ...block,
      hooks: block.hooks.map(entry => ({
        ...entry,
        command: resolveCommandPlaceholders(entry.command, scpRoot),
      })),
    }));
  }
  return resolved;
}

/**
 * Determina si un comando es gestionado por SCP.
 * Un comando es de SCP si su path normalizado contiene alguno de:
 * - `post-hook-event`
 * - `stop-hook-ux`
 * - `notifications/cli.ts`
 * - La ruta resolved del repo (sin backslash)
 */
export function isScpManagedCommand(command: string | undefined, scpRoot: string): boolean {
  if (typeof command !== 'string') return false;
  const normalized = command.replace(/\\/g, '/');
  const rootNormalized = scpRoot.replace(/\\/g, '/');
  return (
    normalized.includes('post-hook-event') ||
    normalized.includes('stop-hook-ux') ||
    normalized.includes('notifications/cli.ts') ||
    normalized.includes(rootNormalized)
  );
}

/**
 * Clasifica una lista de bloques según cuántos comandos son de SCP.
 * - Todos SCP → 'scp-only'
 * - Ninguno SCP → 'user-only'
 * - Mezcla → 'mixed'
 */
export function classifyKey(blocks: HookBlock[] | undefined, scpRoot: string): KeyClassification {
  if (!blocks || blocks.length === 0) return 'user-only';
  const commands = blocks.flatMap(b => b.hooks.map(h => h.command));
  if (commands.length === 0) return 'user-only';
  const scpCount = commands.filter(c => isScpManagedCommand(c, scpRoot)).length;
  if (scpCount === 0) return 'user-only';
  if (scpCount === commands.length) return 'scp-only';
  return 'mixed';
}

/**
 * Lee y parsea `configs/hooks.json` del repo, reemplazando placeholders.
 * Lanza error si el archivo no existe o es JSON inválido.
 */
export function readCanonicalHooks(scpRoot: string): HooksBlock {
  const hooksJsonPath = resolve(scpRoot, HOOKS_JSON_SEGMENT);
  if (!existsSync(hooksJsonPath)) {
    throw new Error(`No se encontró ${HOOKS_JSON_SEGMENT} en la raíz del proxy`);
  }
  try {
    const raw = readFileSync(hooksJsonPath, 'utf-8');
    const parsed = JSON.parse(raw) as { hooks?: HooksBlock };
    if (!parsed.hooks) throw new Error(`${HOOKS_JSON_SEGMENT} no tiene clave 'hooks'`);
    return resolveHooksBlock(parsed.hooks, scpRoot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Error al leer ${HOOKS_JSON_SEGMENT}: ${msg}`, { cause: err });
  }
}

/**
 * Crea backup de `settings.json` en `~/.claude/settings-backup-<timestamp>.json`.
 * Devuelve la ruta del backup creado.
 */
export function backupSettings(_settings: ClaudeSettings): string {
  const backupDir = join(homedir(), '.claude');
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = join(backupDir, `settings-backup-${timestamp}.json`);
  const settingsPath = join(backupDir, 'settings.json');
  if (existsSync(settingsPath)) {
    copyFileSync(settingsPath, backupPath);
  }
  return backupPath;
}

/**
 * Merge selectivo: integra hooks canónicos de SCP en settings.
 * - user-only: preserva intacto (SCP no toca salvo force)
 * - scp-only: reemplaza
 * - mixed: preserva ajenos + agrega SCP
 */
export function mergeHooks(
  settings: ClaudeSettings,
  canonical: HooksBlock,
  scpRoot: string,
  force: boolean,
): ClaudeSettings {
  const next: ClaudeSettings = { ...settings };
  const nextHooks: Record<string, HookBlock[]> = {
    ...((settings.hooks ?? {}) as Record<string, HookBlock[]>),
  };

  for (const [key, canonicalBlocks] of Object.entries(canonical)) {
    const existing = nextHooks[key];
    // Si la clave no existe, crear con versión canónica
    if (!existing || existing.length === 0) {
      nextHooks[key] = canonicalBlocks;
      continue;
    }
    const classification = classifyKey(existing, scpRoot);

    if (classification === 'user-only' && !force) {
      // preservar intacto, SCP no toca
      continue;
    }
    if (classification === 'scp-only' || force) {
      // reemplazar o forzar
      nextHooks[key] = canonicalBlocks;
    } else {
      // mixed: preservar bloques con comandos ajenos, agregar los de SCP
      const userBlocks = (existing ?? []).filter(
        b => b.hooks.some(h => !isScpManagedCommand(h.command, scpRoot)),
      );
      nextHooks[key] = [...userBlocks, ...canonicalBlocks];
    }
  }

  next.hooks = nextHooks as ClaudeSettings['hooks'];
  if (!next.env) next.env = {};
  next.env[SMART_CODE_PROXY_ROOT_KEY] = scpRoot;
  return next;
}

/**
 * Uninstall selectivo: elimina solo comandos de SCP.
 * - Si tras eliminar quedan comandos ajenos, se preservan.
 * - Si la entrada queda vacía, se elimina la clave.
 */
export function unmergeHooks(
  settings: ClaudeSettings,
  canonical: HooksBlock,
  scpRoot: string,
): ClaudeSettings {
  const next: ClaudeSettings = { ...settings };
  const nextHooks: Record<string, HookBlock[]> = {
    ...((settings.hooks ?? {}) as Record<string, HookBlock[]>),
  };

  for (const key of Object.keys(canonical)) {
    const existing = nextHooks[key];
    if (!existing) continue;
    const filtered = existing.filter(
      b => b.hooks.some(h => !isScpManagedCommand(h.command, scpRoot)),
    );
    if (filtered.length === 0) {
      delete nextHooks[key];
    } else {
      nextHooks[key] = filtered;
    }
  }

  if (Object.keys(nextHooks).length === 0) {
    delete next.hooks;
  } else {
    next.hooks = nextHooks as ClaudeSettings['hooks'];
  }
  return next;
}

/**
 * Valida que existan todos los archivos necesarios de SCP.
 */
export function validateScpRoot(scpRoot: string): void {
  const files = [
    HOOKS_JSON_SEGMENT,
    POST_HOOK_EVENT_SEGMENT,
    STOP_HOOK_UX_SEGMENT,
    NOTIFICATIONS_CLI_SEGMENT,
  ];
  const missing: string[] = [];
  for (const file of files) {
    if (!existsSync(resolve(scpRoot, file))) {
      missing.push(file);
    }
  }
  if (missing.length > 0) {
    throw new Error(`No se encontraron los siguientes archivos en la raíz del proxy: ${missing.join(', ')}`);
  }
}

// ─── Orquestador ─────────────────────────────────────────────────────────────

export function runSetupHooks(options: SetupHooksRunOptions): number {
  const scpRoot = resolve(options.root);
  try {
    validateScpRoot(scpRoot);
  } catch (err) {
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    return 1;
  }
  const canonical = readCanonicalHooks(scpRoot);
  const settings = readClaudeSettings();

  if (options.uninstall) {
    const next = unmergeHooks(settings, canonical, scpRoot);
    if (options.dryRun) {
      console.log(chalk.yellow('[dry-run] Se quitarían los hooks de SCP:'));
      console.log(JSON.stringify({ hooks: next.hooks }, null, 2));
      return 0;
    }
    backupSettings(settings);
    writeClaudeSettings(next);
    console.log(chalk.green('Hooks de SCP desinstalados.'));
    return 0;
  }

  const result = mergeHooks(settings, canonical, scpRoot, options.force);
  if (options.dryRun) {
    console.log(chalk.yellow('[dry-run] Hooks que se escribirían:'));
    console.log(JSON.stringify({ hooks: result.hooks, env: result.env }, null, 2));
    return 0;
  }
  backupSettings(settings);
  writeClaudeSettings(result);
  console.log(chalk.green('Hooks de SCP instalados correctamente.'));
  console.log(chalk.cyan(`  env.${SMART_CODE_PROXY_ROOT_KEY}: ${scpRoot}`));
  return 0;
}

// ─── CLI (commander) ─────────────────────────────────────────────────────────

const program = new Command();

program
  .name('setup-hooks')
  .description('Instala los 14 hooks de SCP en ~/.claude/settings.json (merge selectivo)')
  .option('--root <path>', 'Raíz del repositorio del proxy', process.cwd())
  .option('--dry-run', 'Muestra los valores sin escribir en settings.json')
  .option('--force', 'Sobrescribe configuración ajena (incluye user-only)')
  .option('--uninstall', 'Desinstalar solo los hooks de SCP (preserva ajenos)')
  .action(
    (opts: {
      root?: string;
      dryRun?: boolean;
      force?: boolean;
      uninstall?: boolean;
    }) => {
      const code = runSetupHooks({
        root: opts.root ?? process.cwd(),
        dryRun: Boolean(opts.dryRun),
        force: Boolean(opts.force),
        uninstall: Boolean(opts.uninstall),
      });
      if (code !== 0) process.exit(code);
    },
  );

const entryPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (entryPath === invokedPath) {
  program.parse();
}