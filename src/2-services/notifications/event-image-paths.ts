// Resolución de rutas absolutas a PNG por evento (cache ASCII → repo).
import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { resolve as resolvePath } from 'path';
import { STABLE_EVENTS_DIR } from './asset-paths.js';

export function getRepoEventsDir(): string {
  return resolvePath(
    resolvePath(fileURLToPath(import.meta.url), '..'),
    '../../..',
    'assets/notifications/events',
  );
}

export function resolveEventImagePath(filename: string): string | undefined {
  const stablePath = join(STABLE_EVENTS_DIR, filename);
  if (existsSync(stablePath)) {
    return stablePath;
  }
  const repoPath = join(getRepoEventsDir(), filename);
  if (existsSync(repoPath)) {
    return repoPath;
  }
  return undefined;
}
