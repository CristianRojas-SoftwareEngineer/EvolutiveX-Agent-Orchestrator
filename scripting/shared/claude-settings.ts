/**
 * Acceso centralizado a `~/.claude/settings.json` (settings global de Claude Code).
 *
 * Claude Code inyecta el bloque `env` de ese archivo como variables de entorno en sus
 * subprocess (API, hooks, statusline). No sustituye al shell del usuario: es la fuente
 * canónica que usan `configure-provider`, `install-statusline` y `router-status`.
 *
 * Responsabilidad de este módulo: solo lectura/escritura del JSON en disco. El merge de
 * claves (`ANTHROPIC_*`, `statusLine`, `SMART_CODE_PROXY_ROOT`, etc.) lo hace cada script
 * antes de llamar a `writeClaudeSettings`, para no pisar configuración ajena.
 *
 * Consumidores:
 * - `configure-provider.ts` — bloque `env` (proveedor upstream / proxy)
 * - `install-statusline.ts` — `statusLine` + `env.SMART_CODE_PROXY_ROOT`
 * - `router-status.ts` — lectura de `env` (auth, modelos, resolución de rutas del proxy)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

/** Ruta por defecto del settings global de Claude Code en el perfil del usuario. */
export const CLAUDE_SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');

/**
 * Clave en `settings.env` con la ruta absoluta del repositorio Smart Code Proxy.
 * La escribe `install-statusline`; la lee `router-status` vía `resolveProjectRoot`.
 */
export const SMART_CODE_PROXY_ROOT_KEY = 'SMART_CODE_PROXY_ROOT';

/**
 * Subconjunto tipado de `settings.json` que manipulan los scripts de este repo.
 * Otras claves de primer nivel (p. ej. permisos) se conservan al reescribir el objeto completo
 * solo si el caller hace spread del objeto leído antes de mutar.
 */
export interface ClaudeSettings {
  /** Variables que Claude Code expone al subprocess; strings planos. */
  env?: Record<string, string>;
  /** Comando del statusline (`type: "command"`, `command`, `padding`). */
  statusLine?: {
    type?: string;
    command?: string;
    padding?: number;
  };
  [key: string]: unknown;
}

/**
 * Ruta alternativa para tests (Vitest). No usar en runtime ni desde CLI.
 * Permite probar instalación/dry-run sin modificar el `settings.json` real del usuario.
 */
let settingsPathOverride: string | undefined;

/** Redirige `readClaudeSettings` / `writeClaudeSettings` a un archivo temporal. Pasar `undefined` para restaurar. */
export function setClaudeSettingsPathForTests(path: string | undefined): void {
  settingsPathOverride = path;
}

/** Ruta activa: override de test si está definido; si no, el settings global del usuario. */
function effectiveSettingsPath(): string {
  return settingsPathOverride ?? CLAUDE_SETTINGS_PATH;
}

/**
 * Lee el settings global. Si el archivo no existe o el JSON es inválido, devuelve `{}`
 * (mismo criterio tolerante que tenía `configure-provider` antes de la extracción).
 */
export function readClaudeSettings(): ClaudeSettings {
  const path = effectiveSettingsPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ClaudeSettings;
  } catch {
    return {};
  }
}

/**
 * Persiste el objeto completo en settings.json. Crea `~/.claude` (o el directorio padre
 * del override de test) si no existe. Formato: JSON con indentación de 2 espacios y salto
 * de línea final, coherente con la escritura histórica del proyecto.
 */
export function writeClaudeSettings(settings: ClaudeSettings): void {
  const path = effectiveSettingsPath();
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}
