import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { cleanCutLegacySessions } from '../../src/4-api/composition-root.js';

const logger = { info: () => {}, error: () => {} } as never;

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scp-cut-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function exists(rel: string): Promise<boolean> {
  try {
    await fs.access(path.join(dir, rel));
    return true;
  } catch {
    return false;
  }
}

describe('cleanCutLegacySessions', () => {
  it('elimina sesiones con layout legacy (main-agent) y recrea .gitkeep', async () => {
    await fs.mkdir(path.join(dir, 'sess-legacy', 'main-agent'), { recursive: true });
    await fs.writeFile(path.join(dir, 'sess-legacy', 'foo.txt'), 'x');
    await cleanCutLegacySessions(dir, logger);
    expect(await exists('sess-legacy')).toBe(false);
    expect(await exists('.gitkeep')).toBe(true);
  });

  it('es idempotente: no toca un layout causal-workflows-v1', async () => {
    await fs.mkdir(path.join(dir, 'sess-new', 'workflows', '00'), { recursive: true });
    await cleanCutLegacySessions(dir, logger);
    expect(await exists('sess-new/workflows/00')).toBe(true);
  });

  it('no falla si el directorio de sesiones no existe', async () => {
    await fs.rm(dir, { recursive: true, force: true });
    await expect(cleanCutLegacySessions(dir, logger)).resolves.toBeUndefined();
  });

  it('detecta legacy por interaction-sequence.json', async () => {
    await fs.mkdir(path.join(dir, 'sess-legacy'), { recursive: true });
    await fs.writeFile(path.join(dir, 'sess-legacy', 'interaction-sequence.json'), '{}');
    await cleanCutLegacySessions(dir, logger);
    expect(await exists('sess-legacy')).toBe(false);
  });
});
