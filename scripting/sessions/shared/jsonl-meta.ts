import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function formatLocalDate(utcStr: string | undefined): string {
  if (!utcStr) return '?';
  try {
    return new Date(utcStr).toLocaleString('sv-SE', { hour12: false }).slice(0, 16);
  } catch {
    return '?';
  }
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b): b is { type?: string; text?: string } => typeof b === 'object' && b !== null)
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join(' ');
  }
  return '';
}

/** custom-title > ai-title */
export async function getSessionTitle(jsonlPath: string): Promise<string | null> {
  let customTitle: string | null = null;
  let aiTitle: string | null = null;

  const rl = createInterface({ input: createReadStream(jsonlPath, { encoding: 'utf-8' }) });
  try {
    for await (const line of rl) {
      if (!line.includes('"custom-title"') && !line.includes('"ai-title"')) continue;
      try {
        const entry = JSON.parse(line) as {
          type?: string;
          customTitle?: string;
          aiTitle?: string;
        };
        if (entry.type === 'custom-title' && entry.customTitle) customTitle = entry.customTitle;
        if (entry.type === 'ai-title' && entry.aiTitle) aiTitle = entry.aiTitle;
      } catch {
        /* ignore */
      }
    }
  } finally {
    rl.close();
  }

  return customTitle ?? aiTitle ?? null;
}

export async function parseFirstPrompt(jsonlPath: string): Promise<string> {
  const rl = createInterface({ input: createReadStream(jsonlPath, { encoding: 'utf-8' }) });
  let linesRead = 0;
  try {
    for await (const line of rl) {
      linesRead++;
      if (linesRead > 50) break;
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as {
          type?: string;
          message?: { content?: unknown };
        };
        if (entry.type !== 'user' || !entry.message?.content) continue;
        const text = extractText(entry.message.content).trim();
        if (text && !text.startsWith('<')) {
          return text.length > 100 ? `${text.slice(0, 100)}...` : text;
        }
      } catch {
        /* ignore */
      }
    }
  } finally {
    rl.close();
  }
  return '(sin prompt)';
}

export async function parseCwdFromJsonl(jsonlPath: string): Promise<string | null> {
  const rl = createInterface({ input: createReadStream(jsonlPath, { encoding: 'utf-8' }) });
  let linesRead = 0;
  try {
    for await (const line of rl) {
      linesRead++;
      if (linesRead > 20) break;
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as { cwd?: string };
        if (entry.cwd) return entry.cwd;
      } catch {
        /* ignore */
      }
    }
  } finally {
    rl.close();
  }
  return null;
}

export interface IndexEntryMetadata {
  sessionId: string;
  firstPrompt: string;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch: string;
  projectPath: string;
  isSidechain: boolean;
  fullPath: string;
  fileMtime: number;
}

/** Metadata para upsert en sessions-index.json (alineado con rebuild_sessions_index.py). */
export async function buildIndexEntryFromJsonl(
  jsonlPath: string,
  sessionId: string,
  fileStat: { mtimeMs: number; birthtimeMs: number },
): Promise<IndexEntryMetadata | null> {
  let firstPrompt: string | null = null;
  let _lastPrompt: string | null = null;
  let messageCount = 0;
  let createdTs: string | null = null;
  let modifiedTs: string | null = null;
  let gitBranch: string | null = null;
  let projectPath: string | null = null;
  let isSidechain = false;
  let foundSessionId: string | null = null;

  const rl = createInterface({ input: createReadStream(jsonlPath, { encoding: 'utf-8' }) });
  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }

      const entrySessionId = entry.sessionId as string | undefined;
      if (entrySessionId === undefined) continue;

      if (foundSessionId === null) foundSessionId = entrySessionId;

      if (gitBranch === null && typeof entry.gitBranch === 'string') gitBranch = entry.gitBranch;
      if (projectPath === null && typeof entry.cwd === 'string') projectPath = entry.cwd;
      if (typeof entry.isSidechain === 'boolean') isSidechain = entry.isSidechain;

      const tsStr = entry.timestamp as string | undefined;
      if (tsStr) {
        if (createdTs === null) createdTs = tsStr;
        modifiedTs = tsStr;
      }

      const entryType = entry.type as string | undefined;
      if (entryType === 'user') {
        const msg = entry.message as { content?: unknown } | undefined;
        const text = extractText(msg?.content).trim();
        if (text && !text.startsWith('<')) {
          messageCount++;
          const slice = text.slice(0, 200);
          if (firstPrompt === null) firstPrompt = slice;
          _lastPrompt = slice;
        }
      } else if (entryType === 'assistant') {
        messageCount++;
      }
    }
  } finally {
    rl.close();
  }

  if (foundSessionId === null) return null;

  const fallbackCreated = new Date(fileStat.birthtimeMs).toISOString();
  const fallbackModified = new Date(fileStat.mtimeMs).toISOString();

  return {
    sessionId,
    fullPath: jsonlPath,
    fileMtime: Math.floor(fileStat.mtimeMs),
    firstPrompt: firstPrompt ?? '',
    messageCount,
    created: createdTs ?? fallbackCreated,
    modified: modifiedTs ?? fallbackModified,
    gitBranch: gitBranch ?? 'HEAD',
    projectPath: projectPath ?? '',
    isSidechain,
  };
}
