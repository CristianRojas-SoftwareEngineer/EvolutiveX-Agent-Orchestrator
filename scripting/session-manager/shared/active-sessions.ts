import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSessionsDir } from './paths.js';

export function getActiveSessionIds(): Set<string> {
  const activeIds = new Set<string>();
  const sessionsDir = getSessionsDir();
  if (!existsSync(sessionsDir)) return activeIds;

  for (const name of readdirSync(sessionsDir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const data = JSON.parse(readFileSync(join(sessionsDir, name), 'utf-8')) as {
        sessionId?: string;
      };
      if (data.sessionId) activeIds.add(data.sessionId);
    } catch {
      /* ignore */
    }
  }
  return activeIds;
}

export function isActiveSession(sessionId: string): boolean {
  return getActiveSessionIds().has(sessionId);
}
