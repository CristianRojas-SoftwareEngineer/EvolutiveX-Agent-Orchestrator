import {
  copyFileSync,
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';

export function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf-8').replace(/^\uFEFF/, '');
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJsonAtomic(path: string, data: unknown): void {
  const tempPath = `${path}.tmp`;
  const json = JSON.stringify(data, null, 2) + '\n';
  writeFileSync(tempPath, json, 'utf-8');
  if (existsSync(path)) {
    const backupPath = `${path}.backup`;
    if (existsSync(backupPath)) {
      try {
        unlinkSync(backupPath);
      } catch {
        /* ignore */
      }
    }
    copyFileSync(path, backupPath);
  }
  renameSync(tempPath, path);
}
