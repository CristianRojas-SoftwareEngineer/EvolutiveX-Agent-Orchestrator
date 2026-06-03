// Resolución de rutas absolutas a PNG por evento (cache ASCII → repo).
import { createHash } from 'crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { resolve as resolvePath } from 'path';
import { STABLE_EVENTS_DIR } from './asset-paths.js';

/** Permite sustituir el directorio repo en tests (ESM no intercepta llamadas internas a exports). */
export const repoEventsDirProvider = {
  get(): string {
    return resolvePath(
      resolvePath(fileURLToPath(import.meta.url), '..'),
      '../../..',
      'assets/notifications/events',
    );
  },
};

export function getRepoEventsDir(): string {
  return repoEventsDirProvider.get();
}

function fileSha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * Recopia desde el repo al cache ASCII cuando el hash difiere (p. ej. tras
 * actualizar PNG en el repo sin volver a ejecutar `register --install`).
 */
export function syncEventImageFromRepoIfStale(filename: string): void {
  if (process.platform !== 'win32') {
    return;
  }
  const repoPath = join(getRepoEventsDir(), filename);
  if (!existsSync(repoPath)) {
    return;
  }
  mkdirSync(STABLE_EVENTS_DIR, { recursive: true });
  const stablePath = join(STABLE_EVENTS_DIR, filename);
  if (!existsSync(stablePath) || fileSha256(repoPath) !== fileSha256(stablePath)) {
    copyFileSync(repoPath, stablePath);
  }
}

export function resolveEventImagePath(filename: string): string | undefined {
  const stablePath = join(STABLE_EVENTS_DIR, filename);
  const repoPath = join(getRepoEventsDir(), filename);

  if (existsSync(repoPath)) {
    syncEventImageFromRepoIfStale(filename);
  }

  if (existsSync(stablePath)) {
    return stablePath;
  }
  if (existsSync(repoPath)) {
    return repoPath;
  }
  return undefined;
}
