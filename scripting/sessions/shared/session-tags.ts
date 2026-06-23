import { existsSync } from 'node:fs';
import { getSessionTagsPath } from '../../shared/claude-paths.js';
import { readJsonFile, writeJsonAtomic } from './json-io.js';

interface SessionTagsFile {
  sessions?: Array<{ sessionId?: string }>;
}

/** Limpia entrada en session-tags.json si el archivo existe (metadato legacy opcional). */
export function removeFromSessionTags(sessionId: string): void {
  const tagsPath = getSessionTagsPath();
  if (!existsSync(tagsPath)) return;

  const tags = readJsonFile<SessionTagsFile>(tagsPath);
  if (!tags?.sessions) return;

  tags.sessions = tags.sessions.filter((s) => s.sessionId !== sessionId);
  writeJsonAtomic(tagsPath, tags);
}
