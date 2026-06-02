import chalk from 'chalk';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { getActiveSessionIds, isActiveSession } from './shared/active-sessions.js';
import {
  formatFileSize,
  formatLocalDate,
  getSessionTitle,
  parseCwdFromJsonl,
  parseFirstPrompt,
} from './shared/jsonl-meta.js';
import { getArchiveDir, getProjectsDir } from './shared/paths.js';
import { projectPathToSlug, posixToWindows, resolveProjectDir } from './shared/project-slug.js';
import { removeFromIndex, upsertSessionIndexEntry } from './shared/sessions-index.js';
import { removeFromSessionTags } from './shared/session-tags.js';
import { readJsonFile } from './shared/json-io.js';
import { printSessionTable, type SessionRow } from './shared/output.js';
import type { SessionsIndexEntry } from './shared/sessions-index.js';

interface SessionsIndexFile {
  entries?: SessionsIndexEntry[];
}

export class SessionManagerError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'active'
      | 'not_found'
      | 'ambiguous'
      | 'io'
      | 'project'
      | 'usage' = 'io',
  ) {
    super(message);
    this.name = 'SessionManagerError';
  }
}

function resolveSessionIdInProject(projectDir: string, partialOrFull: string): string {
  const exact = join(projectDir, `${partialOrFull}.jsonl`);
  if (existsSync(exact)) return partialOrFull;

  const files = readdirSync(projectDir).filter(
    (f) => f.endsWith('.jsonl') && f.startsWith(partialOrFull),
  );
  if (files.length === 1) return files[0]!.replace(/\.jsonl$/, '');
  if (files.length > 1) {
    throw new SessionManagerError(
      `Varias sesiones coinciden con '${partialOrFull}'. Usa el ID completo.`,
      'ambiguous',
    );
  }
  throw new SessionManagerError(`No se encontró sesión: ${partialOrFull}`, 'not_found');
}

export async function listSessions(projectPath: string): Promise<void> {
  const projDir = resolveProjectDir(projectPath);
  const indexPath = join(projDir, 'sessions-index.json');
  const index = readJsonFile<SessionsIndexFile>(indexPath);

  if (!index?.entries?.length) {
    printSessionTable([], 'No hay sesiones en este proyecto.');
    return;
  }

  const activeIds = getActiveSessionIds();
  const entries = [...index.entries].sort((a, b) => {
    const da = a.created ? Date.parse(a.created) : 0;
    const db = b.created ? Date.parse(b.created) : 0;
    return db - da;
  });

  const rows: SessionRow[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    const sid = e.sessionId;
    const jsonlPath = join(projDir, `${sid}.jsonl`);
    const stat = existsSync(jsonlPath) ? statSync(jsonlPath) : null;
    const size = stat ? formatFileSize(stat.size) : '?';

    let title = existsSync(jsonlPath) ? await getSessionTitle(jsonlPath) : null;
    if (!title) {
      const fp = e.firstPrompt?.replace(/[|\r\n]/g, ' ') ?? '';
      title = fp.length > 80 ? `${fp.slice(0, 80)}...` : fp || '(vacía)';
    }

    rows.push({
      index: i + 1,
      sessionId: sid,
      title,
      messages: e.messageCount != null ? String(e.messageCount) : '?',
      size,
      created: formatLocalDate(e.created),
      modified: formatLocalDate(e.modified),
      active: activeIds.has(sid),
    });
  }

  printSessionTable(rows);
}

export async function archiveSession(
  sessionId: string,
  projectPath: string,
): Promise<{ sessionId: string; destination: string }> {
  const projDir = resolveProjectDir(projectPath);
  const sid = resolveSessionIdInProject(projDir, sessionId);

  if (isActiveSession(sid)) {
    throw new SessionManagerError('No se puede archivar la sesión activa', 'active');
  }

  const jsonlPath = join(projDir, `${sid}.jsonl`);
  if (!existsSync(jsonlPath)) {
    throw new SessionManagerError(`No se encontró el archivo: ${sid}.jsonl`, 'not_found');
  }

  const archiveDir = getArchiveDir();
  if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });

  const destination = join(archiveDir, `${sid}.jsonl`);
  try {
    renameSync(jsonlPath, destination);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('EBUSY') || msg.includes('in use')) {
      throw new SessionManagerError('Archivo en uso por otro proceso', 'io');
    }
    throw new SessionManagerError(msg, 'io');
  }

  removeFromIndex(projDir, sid);
  removeFromSessionTags(sid);

  return { sessionId: sid, destination };
}

export async function deleteSession(sessionId: string, projectPath: string): Promise<void> {
  const projDir = resolveProjectDir(projectPath);
  const sid = resolveSessionIdInProject(projDir, sessionId);

  if (isActiveSession(sid)) {
    throw new SessionManagerError('No se puede eliminar la sesión activa', 'active');
  }

  const jsonlPath = join(projDir, `${sid}.jsonl`);
  if (!existsSync(jsonlPath)) {
    throw new SessionManagerError(`No se encontró el archivo: ${sid}.jsonl`, 'not_found');
  }

  try {
    unlinkSync(jsonlPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SessionManagerError(msg, 'io');
  }

  removeFromIndex(projDir, sid);
  removeFromSessionTags(sid);
}

export async function listArchivedSessions(): Promise<void> {
  const archiveDir = getArchiveDir();
  if (!existsSync(archiveDir)) {
    printSessionTable([], 'No hay sesiones archivadas.');
    return;
  }

  const files = readdirSync(archiveDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => {
      const full = join(archiveDir, f);
      return { name: f, full, stat: statSync(full) };
    })
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

  if (files.length === 0) {
    printSessionTable([], 'No hay sesiones archivadas.');
    return;
  }

  const rows: SessionRow[] = [];
  for (let i = 0; i < files.length; i++) {
    const { full, stat } = files[i]!;
    const sid = files[i]!.name.replace(/\.jsonl$/, '');
    let title = await getSessionTitle(full);
    if (!title) title = await parseFirstPrompt(full);

    rows.push({
      index: i + 1,
      sessionId: sid,
      title,
      messages: '?',
      size: formatFileSize(stat.size),
      created: formatLocalDate(stat.birthtime.toISOString()),
      modified: formatLocalDate(stat.mtime.toISOString()),
      active: false,
    });
  }

  printSessionTable(rows);
}

function resolveArchivedSessionId(partialOrFull: string): { sid: string; path: string } {
  const archiveDir = getArchiveDir();
  const exact = join(archiveDir, `${partialOrFull}.jsonl`);
  if (existsSync(exact)) return { sid: partialOrFull, path: exact };

  if (!existsSync(archiveDir)) {
    throw new SessionManagerError('No existe el directorio de archivo', 'not_found');
  }

  const matches = readdirSync(archiveDir).filter(
    (f) => f.endsWith('.jsonl') && f.startsWith(partialOrFull),
  );
  if (matches.length === 1) {
    const sid = matches[0]!.replace(/\.jsonl$/, '');
    return { sid, path: join(archiveDir, matches[0]!) };
  }
  if (matches.length > 1) {
    throw new SessionManagerError(
      `Varias sesiones archivadas coinciden con '${partialOrFull}'. Usa el ID completo.`,
      'ambiguous',
    );
  }
  throw new SessionManagerError(`No se encontró sesión archivada: ${partialOrFull}`, 'not_found');
}

export async function restoreSession(
  sessionId: string,
): Promise<{ sessionId: string; project: string; destination: string }> {
  const { sid, path: archivedPath } = resolveArchivedSessionId(sessionId);

  const cwd = await parseCwdFromJsonl(archivedPath);
  if (!cwd) {
    throw new SessionManagerError(
      'No se pudo determinar el proyecto de origen desde el JSONL',
      'io',
    );
  }

  const winPath = posixToWindows(cwd);
  const dirName = projectPathToSlug(winPath);
  const targetDir = join(getProjectsDir(), dirName);
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

  const destination = join(targetDir, `${sid}.jsonl`);
  try {
    renameSync(archivedPath, destination);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SessionManagerError(msg, 'io');
  }

  await upsertSessionIndexEntry(targetDir, sid);

  return { sessionId: sid, project: cwd, destination };
}

export function parseSessionIds(idsArg: string | undefined, positional: string[]): string[] {
  const fromFlag = idsArg
    ? idsArg
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  return [...fromFlag, ...positional];
}

export function handleArchiveError(err: unknown): never {
  if (err instanceof SessionManagerError) {
    switch (err.code) {
      case 'active':
        console.error(chalk.red(err.message));
        break;
      case 'not_found':
        console.error(chalk.yellow(err.message));
        break;
      default:
        console.error(chalk.red(err.message));
    }
    process.exit(err.code === 'not_found' ? 2 : 1);
  }
  if (err instanceof Error) {
    console.error(chalk.red(err.message));
    process.exit(1);
  }
  throw err;
}
