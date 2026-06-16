import { readdirSync, statSync } from 'fs';
import { join } from 'path';

/** Prefijo de fecha en archivados: YYYY-MM-DD-- */
const ARCHIVE_DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})--(.+)$/;

/** Identificador numérico incremental: c + dígitos al inicio del nombre normalizado */
const CHANGE_NUMERIC_ID = /^c(\d+)/;

/** Segmento de directorio archivado con prefijo de fecha canónico */
const ARCHIVE_LEAF_NAME = /^\d{4}-\d{2}-\d{2}--/;

const SKIP_ACTIVE_ENTRIES = new Set(['archive', '.gitkeep']);

export interface ChangeDirectoryEntry {
  rawName: string;
  normalizedName: string;
  numericId: number | null;
  relativePath: string;
}

/** Compone el nombre de directorio archivado: YYYY-MM-DD--<change-name>. */
export function formatArchivedChangeName(archiveDate: string, changeName: string): string {
  return `${archiveDate}--${changeName}`;
}

/** Quita el prefijo YYYY-MM-DD-- del nombre de directorio archivado. */
export function stripArchiveDatePrefix(dirName: string): string {
  const match = dirName.match(ARCHIVE_DATE_PREFIX);
  return match ? match[2] : dirName;
}

/** Extrae el entero del prefijo c<NNNNN> o null si no aplica. */
export function parseChangeNumericId(dirName: string): number | null {
  const normalized = stripArchiveDatePrefix(dirName);
  const match = normalized.match(CHANGE_NUMERIC_ID);
  return match ? Number.parseInt(match[1], 10) : null;
}

function listSubdirectories(parentDir: string): string[] {
  try {
    return readdirSync(parentDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function pushArchiveEntry(
  entries: ChangeDirectoryEntry[],
  archiveDir: string,
  leafName: string,
  relativePathSuffix: string,
): void {
  entries.push({
    rawName: leafName,
    normalizedName: stripArchiveDatePrefix(leafName),
    numericId: parseChangeNumericId(leafName),
    relativePath: join(archiveDir, relativePathSuffix),
  });
}

/** Recopila entradas de changes activos y archivados bajo changesDir. */
export function collectChangeDirectories(changesDir: string): ChangeDirectoryEntry[] {
  const entries: ChangeDirectoryEntry[] = [];

  for (const name of listSubdirectories(changesDir)) {
    if (SKIP_ACTIVE_ENTRIES.has(name)) {
      continue;
    }
    entries.push({
      rawName: name,
      normalizedName: stripArchiveDatePrefix(name),
      numericId: parseChangeNumericId(name),
      relativePath: join(changesDir, name),
    });
  }

  const archiveDir = join(changesDir, 'archive');
  for (const name of listSubdirectories(archiveDir)) {
    pushArchiveEntry(entries, archiveDir, name, name);

    const phasesDir = join(archiveDir, name, 'phases');
    for (const phaseName of listSubdirectories(phasesDir)) {
      if (!ARCHIVE_LEAF_NAME.test(phaseName)) {
        continue;
      }
      pushArchiveEntry(entries, archiveDir, phaseName, join(name, 'phases', phaseName));
    }
  }

  return entries;
}

/** Deriva el siguiente identificador c<NNNNN> (sin slug). */
export function computeNextChangeId(changesDir: string): string {
  const entries = collectChangeDirectories(changesDir);
  const maxId = entries.reduce((max, entry) => {
    if (entry.numericId === null) {
      return max;
    }
    return Math.max(max, entry.numericId);
  }, 0);

  const next = maxId + 1;
  return `c${String(next).padStart(5, '0')}`;
}

export interface DuplicateChangeIdGroup {
  numericId: number;
  entries: ChangeDirectoryEntry[];
}

/** Agrupa directorios que comparten el mismo entero c<NNNNN>. Solo devuelve grupos con >1 entrada. */
export function findDuplicateChangeIds(changesDir: string): DuplicateChangeIdGroup[] {
  const byId = new Map<number, ChangeDirectoryEntry[]>();

  for (const entry of collectChangeDirectories(changesDir)) {
    if (entry.numericId === null) {
      continue;
    }
    const group = byId.get(entry.numericId) ?? [];
    group.push(entry);
    byId.set(entry.numericId, group);
  }

  return [...byId.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([numericId, group]) => ({ numericId, entries: group }));
}

/** Resuelve changesDir por defecto (openspec/changes relativo al cwd). */
export function resolveDefaultChangesDir(cwd: string = process.cwd()): string {
  const candidate = join(cwd, 'openspec', 'changes');
  if (statSync(candidate, { throwIfNoEntry: false })?.isDirectory()) {
    return candidate;
  }
  throw new Error(`No se encontró openspec/changes en ${cwd}`);
}
