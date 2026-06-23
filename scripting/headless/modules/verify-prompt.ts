import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectsDir, projectPathToSlug } from '../../shared/claude-paths.js';

interface TranscriptLine {
  type?: string;
  lastPrompt?: string;
  message?: { role?: string; content?: string };
}

/** Ruta del transcript .jsonl más reciente del proyecto en ~/.claude/projects. */
export function findLatestTranscriptPath(projectRoot: string, minMtimeMs?: number): string | null {
  const slug = projectPathToSlug(projectRoot);
  const dir = join(getProjectsDir(), slug);
  if (!existsSync(dir)) return null;

  let latest: { path: string; mtime: number } | null = null;

  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.jsonl')) continue;
    const fullPath = join(dir, name);
    const mtime = statSync(fullPath).mtimeMs;
    if (minMtimeMs !== undefined && mtime < minMtimeMs) continue;
    if (!latest || mtime > latest.mtime) {
      latest = { path: fullPath, mtime };
    }
  }

  return latest?.path ?? null;
}

/** Extrae el último prompt de usuario registrado en el transcript (last-prompt o mensaje user). */
export function extractLastUserPrompt(transcriptPath: string): string | null {
  if (!existsSync(transcriptPath)) return null;

  const lines = readFileSync(transcriptPath, 'utf-8').split('\n');
  let lastUser: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as TranscriptLine;
      if (row.type === 'last-prompt' && typeof row.lastPrompt === 'string') {
        return row.lastPrompt;
      }
      if (row.type === 'user' && typeof row.message?.content === 'string') {
        lastUser = row.message.content;
      }
    } catch {
      // Ignorar líneas corruptas
    }
  }

  return lastUser;
}

/** true si el transcript refleja el prompt esperado (detecta truncamiento por shell en Windows). */
export function verifyPromptInTranscript(transcriptPath: string, expectedPrompt: string): boolean {
  const actual = extractLastUserPrompt(transcriptPath);
  return actual === expectedPrompt;
}
