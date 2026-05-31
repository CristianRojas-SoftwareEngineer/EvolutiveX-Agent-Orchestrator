import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { JsonValue } from '../../1-domain/types/json.types.js';

/** Escritura atómica: temp + rename. */
export async function writeFileAtomic(filePath: string, data: Buffer | string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, filePath);
}

/** Serializa JSON con indentación y escribe de forma atómica. */
export async function writeJsonAtomic(filePath: string, obj: JsonValue): Promise<void> {
  return writeFileAtomic(filePath, Buffer.from(`${JSON.stringify(obj, null, 2)}\n`, 'utf8'));
}
