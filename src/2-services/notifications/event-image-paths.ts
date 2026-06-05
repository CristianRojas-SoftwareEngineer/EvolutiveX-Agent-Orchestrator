import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { resolve as resolvePath } from 'path';

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

export function resolveEventImagePath(filename: string): string | undefined {
  const repoPath = join(getRepoEventsDir(), filename);
  return existsSync(repoPath) ? repoPath : undefined;
}
