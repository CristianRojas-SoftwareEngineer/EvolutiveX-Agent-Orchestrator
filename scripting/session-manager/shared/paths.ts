import { homedir } from 'node:os';
import { join } from 'node:path';

let claudeDirOverride: string | undefined;

/** Redirige `~/.claude` para tests. */
export function setClaudeDirForTests(dir: string | undefined): void {
  claudeDirOverride = dir;
}

export function getClaudeDir(): string {
  return claudeDirOverride ?? join(homedir(), '.claude');
}

export function getProjectsDir(): string {
  return join(getClaudeDir(), 'projects');
}

export function getArchiveDir(): string {
  return join(getClaudeDir(), 'archived-sessions');
}

export function getSessionsDir(): string {
  return join(getClaudeDir(), 'sessions');
}

export function getSessionTagsPath(): string {
  return join(getClaudeDir(), 'session-tags.json');
}
