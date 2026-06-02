import { statSync } from 'node:fs';
import { join } from 'node:path';
import { readJsonFile, writeJsonAtomic } from './json-io.js';
import { buildIndexEntryFromJsonl, type IndexEntryMetadata } from './jsonl-meta.js';

export interface SessionsIndexEntry {
  sessionId: string;
  fullPath?: string;
  fileMtime?: number;
  firstPrompt?: string;
  summary?: string;
  messageCount?: number;
  created?: string;
  modified?: string;
  gitBranch?: string;
  projectPath?: string;
  isSidechain?: boolean;
}

interface SessionsIndexFile {
  entries?: SessionsIndexEntry[];
}

export function removeFromIndex(projectDir: string, sessionId: string): void {
  const indexPath = join(projectDir, 'sessions-index.json');
  const index = readJsonFile<SessionsIndexFile>(indexPath);
  if (!index?.entries) return;

  index.entries = index.entries.filter((e) => e.sessionId !== sessionId);
  writeJsonAtomic(indexPath, index);
}

function metaToIndexEntry(meta: IndexEntryMetadata): SessionsIndexEntry {
  return {
    sessionId: meta.sessionId,
    fullPath: meta.fullPath,
    fileMtime: meta.fileMtime,
    firstPrompt: meta.firstPrompt,
    summary: meta.firstPrompt,
    messageCount: meta.messageCount,
    created: meta.created,
    modified: meta.modified,
    gitBranch: meta.gitBranch,
    projectPath: meta.projectPath,
    isSidechain: meta.isSidechain,
  };
}

function upsertIndexEntrySync(projectDir: string, meta: IndexEntryMetadata): void {
  const indexPath = join(projectDir, 'sessions-index.json');
  let index = readJsonFile<SessionsIndexFile>(indexPath);
  if (!index) index = { entries: [] };
  if (!index.entries) index.entries = [];

  const entry = metaToIndexEntry(meta);
  const idx = index.entries.findIndex((e) => e.sessionId === meta.sessionId);
  if (idx >= 0) {
    index.entries[idx] = entry;
  } else {
    index.entries.push(entry);
  }

  index.entries.sort((a, b) => {
    const da = a.created ? Date.parse(a.created) : 0;
    const db = b.created ? Date.parse(b.created) : 0;
    return db - da;
  });

  writeJsonAtomic(indexPath, index);
}

export async function upsertSessionIndexEntry(
  projectDir: string,
  sessionId: string,
): Promise<void> {
  const jsonlPath = join(projectDir, `${sessionId}.jsonl`);
  const fileStat = statSync(jsonlPath);
  const meta = await buildIndexEntryFromJsonl(jsonlPath, sessionId, {
    mtimeMs: fileStat.mtimeMs,
    birthtimeMs: fileStat.birthtimeMs,
  });
  if (!meta) {
    throw new Error(`No se pudo extraer metadata del JSONL: ${jsonlPath}`);
  }
  upsertIndexEntrySync(projectDir, meta);
}
