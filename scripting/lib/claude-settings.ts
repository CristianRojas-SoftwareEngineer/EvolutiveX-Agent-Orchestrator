import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export const CLAUDE_SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');

export const SMART_CODE_PROXY_ROOT_KEY = 'SMART_CODE_PROXY_ROOT';

export interface ClaudeSettings {
  env?: Record<string, string>;
  statusLine?: {
    type?: string;
    command?: string;
    padding?: number;
  };
  [key: string]: unknown;
}

/** Solo tests: redirige lectura/escritura a un settings.json temporal. */
let settingsPathOverride: string | undefined;

export function setClaudeSettingsPathForTests(path: string | undefined): void {
  settingsPathOverride = path;
}

function effectiveSettingsPath(): string {
  return settingsPathOverride ?? CLAUDE_SETTINGS_PATH;
}

export function readClaudeSettings(): ClaudeSettings {
  const path = effectiveSettingsPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ClaudeSettings;
  } catch {
    return {};
  }
}

export function writeClaudeSettings(settings: ClaudeSettings): void {
  const path = effectiveSettingsPath();
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}
