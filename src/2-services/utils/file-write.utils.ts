import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { JsonValue } from '../../1-domain/types/json.types.js';

/** Escritura atómica: temp + rename con retry en EPERM (Windows AV/indexador). */
export async function writeFileAtomic(filePath: string, data: Buffer | string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, data);
  try {
    await fs.rename(tmp, filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EPERM') {
      await fs.unlink(tmp).catch(() => {});
      throw err;
    }
    let lastErr: unknown = err;
    for (let i = 1; i <= 3; i++) {
      await new Promise<void>((r) => setTimeout(r, 50 * i));
      try {
        await fs.rename(tmp, filePath);
        lastErr = null;
        break;
      } catch (retryErr) {
        lastErr = retryErr;
      }
    }
    if (lastErr) {
      await fs.unlink(tmp).catch(() => {});
      throw lastErr;
    }
  }
}

/** Serializa JSON con indentación y escribe de forma atómica. */
export async function writeJsonAtomic(filePath: string, obj: JsonValue): Promise<void> {
  return writeFileAtomic(filePath, Buffer.from(`${JSON.stringify(obj, null, 2)}\n`, 'utf8'));
}
