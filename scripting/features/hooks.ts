/**
 * Lógica pura de la feature "hooks" para el instalador universal.
 *
 * Cubre el conjunto indivisible de 13 entradas declaradas en
 * `configs/hooks.json`:
 * - 12 eventos: `scripting/post-hook-event.ts`
 * - `SessionEnd`: `scripting/hooks/session-end-hook.ts` (node directo síncrono)
 *
 * Las funciones aquí definidas son puras (no escriben en disco). El
 * orquestador `scripting/setup.ts` se encarga de la I/O (S2 backup, S3
 * lectura/escritura única).
 *
 * Patrón seguro promovido desde el commit 66cc38e (proxy-hooks-safe-setup):
 * - S1: `validateScpRoot` para validación previa.
 * - S4: `mergeHooks` con clasificación `scp-only / user-only / mixed` y
 *   `unmergeHooks` que solo quita comandos SCP.
 * - S5: `isScpManagedCommand` normaliza backslashes.
 */
import { existsSync, readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT_KEY, type ClaudeSettings } from '../shared/claude-settings.js';

export { EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT_KEY };

const HOOKS_JSON_SEGMENT = 'configs/hooks.json';
const POST_HOOK_EVENT_SEGMENT = 'scripting/post-hook-event.ts';
const SESSION_END_HOOK_SEGMENT = 'scripting/hooks/session-end-hook.ts';
const PLACEHOLDER = '${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}';

export interface HookEntry {
  type: string;
  command: string;
  timeout?: number;
  statusMessage?: string;
  async?: boolean;
}

export interface HookBlock {
  matcher?: string;
  hooks: HookEntry[];
}

export type HooksBlock = Record<string, HookBlock[]>;

export type KeyClassification = 'scp-only' | 'user-only' | 'mixed';

/**
 * Reemplaza `${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}` por la ruta resuelta del repo.
 * Windows-safe: usa `String.split.join` (literal, no regex).
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
    resolved[key] = blocks.map((block) => ({
      ...block,
      hooks: block.hooks.map((entry) => ({
        ...entry,
        command: resolveCommandPlaceholders(entry.command, scpRoot),
      })),
    }));
  }
  return resolved;
}

/**
 * Determina si un comando es gestionado por SCP.
 * Un comando es de SCP si su path normalizado contiene:
 * - `post-hook-event`
 * - `session-end-hook`
 * - `detached-session-end-relay` (legacy; conservado solo para limpiar
 *   instalaciones previas en la reinstalación/uninstall)
 * - La ruta resolved del repo (sin backslash)
 */
export function isScpManagedCommand(command: string | undefined, scpRoot: string): boolean {
  if (typeof command !== 'string') return false;
  const normalized = command.replace(/\\/g, '/');
  const rootNormalized = scpRoot.replace(/\\/g, '/');
  return (
    normalized.includes('post-hook-event') ||
    normalized.includes('session-end-hook') ||
    normalized.includes('detached-session-end-relay') ||
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
  const commands = blocks.flatMap((b) => b.hooks.map((h) => h.command));
  if (commands.length === 0) return 'user-only';
  const scpCount = commands.filter((c) => isScpManagedCommand(c, scpRoot)).length;
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
      const userBlocks = (existing ?? []).filter((b) =>
        b.hooks.some((h) => !isScpManagedCommand(h.command, scpRoot)),
      );
      nextHooks[key] = [...userBlocks, ...canonicalBlocks];
    }
  }

  next.hooks = nextHooks as ClaudeSettings['hooks'];
  if (!next.env) next.env = {};
  next.env[EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT_KEY] = scpRoot;
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
    const filtered = existing.filter((b) =>
      b.hooks.some((h) => !isScpManagedCommand(h.command, scpRoot)),
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
 * Valida que existan todos los archivos necesarios de SCP para la feature hooks.
 * Lanza error si falta alguno.
 */
export function validateScpRoot(scpRoot: string): void {
  const files = [HOOKS_JSON_SEGMENT, POST_HOOK_EVENT_SEGMENT, SESSION_END_HOOK_SEGMENT];
  const missing: string[] = [];
  for (const file of files) {
    if (!existsSync(resolve(scpRoot, file))) {
      missing.push(file);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `No se encontraron los siguientes archivos en la raíz del proxy: ${missing.join(', ')}`,
    );
  }
}
