import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setClaudeDirForTests } from '../../../scripting/session-manager/shared/paths.js';
import { projectPathToSlug } from '../../../scripting/session-manager/shared/project-slug.js';
import {
  archiveSession,
  deleteSession,
  restoreSession,
  SessionManagerError,
} from '../../../scripting/session-manager/archive.js';
import { readJsonFile } from '../../../scripting/session-manager/shared/json-io.js';

const PROJECT_WIN = 'C:\\Test\\DemoProject';
const SESSION_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeJsonlLine(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'user',
    sessionId: SESSION_ID,
    timestamp: '2026-01-01T12:00:00.000Z',
    cwd: '/c/Test/DemoProject',
    message: { role: 'user', content: 'Hola mundo de prueba' },
    ...extra,
  });
}

describe('session-manager archive/delete/restore', () => {
  let claudeDir: string;
  let projectDir: string;
  let projectPath: string;

  beforeEach(() => {
    claudeDir = mkdtempSync(join(tmpdir(), 'scp-claude-'));
    setClaudeDirForTests(claudeDir);

    const slug = projectPathToSlug(PROJECT_WIN);
    projectDir = join(claudeDir, 'projects', slug);
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(join(claudeDir, 'sessions'), { recursive: true });
    mkdirSync(join(claudeDir, 'archived-sessions'), { recursive: true });

    writeFileSync(join(projectDir, `${SESSION_ID}.jsonl`), makeJsonlLine() + '\n', 'utf-8');
    writeFileSync(
      join(projectDir, 'sessions-index.json'),
      JSON.stringify({
        entries: [
          {
            sessionId: SESSION_ID,
            firstPrompt: 'Hola',
            messageCount: 1,
            created: '2026-01-01T12:00:00.000Z',
            modified: '2026-01-01T12:00:00.000Z',
          },
        ],
      }),
      'utf-8',
    );

    projectPath = PROJECT_WIN;
  });

  afterEach(() => {
    setClaudeDirForTests(undefined);
    rmSync(claudeDir, { recursive: true, force: true });
  });

  it('no archiva sesión activa', async () => {
    writeFileSync(
      join(claudeDir, 'sessions', 'active.json'),
      JSON.stringify({ sessionId: SESSION_ID }),
      'utf-8',
    );

    await expect(archiveSession(SESSION_ID, projectPath)).rejects.toMatchObject({
      code: 'active',
    } satisfies Partial<SessionManagerError>);
  });

  it('archiva y restaura actualizando índice', async () => {
    const archived = await archiveSession(SESSION_ID, projectPath);
    expect(existsSync(archived.destination)).toBe(true);
    expect(existsSync(join(projectDir, `${SESSION_ID}.jsonl`))).toBe(false);

    const indexAfterArchive = readJsonFile<{ entries: unknown[] }>(
      join(projectDir, 'sessions-index.json'),
    );
    expect(indexAfterArchive?.entries?.length ?? 0).toBe(0);

    const restored = await restoreSession(SESSION_ID);
    expect(existsSync(restored.destination)).toBe(true);
    expect(existsSync(join(claudeDir, 'archived-sessions', `${SESSION_ID}.jsonl`))).toBe(false);

    const indexAfterRestore = readJsonFile<{ entries: Array<{ sessionId: string }> }>(
      join(projectDir, 'sessions-index.json'),
    );
    expect(indexAfterRestore?.entries?.some((e) => e.sessionId === SESSION_ID)).toBe(true);
  });

  it('elimina sesión (delete)', async () => {
    await deleteSession(SESSION_ID, projectPath);
    expect(existsSync(join(projectDir, `${SESSION_ID}.jsonl`))).toBe(false);
    const index = readJsonFile<{ entries: unknown[] }>(join(projectDir, 'sessions-index.json'));
    expect(index?.entries?.length ?? 0).toBe(0);
  });

  it('preserva línea malformada en sanitize vía archivo de sesión', () => {
    const jsonl = readFileSync(join(projectDir, `${SESSION_ID}.jsonl`), 'utf-8');
    expect(jsonl).toContain('Hola mundo');
  });
});
