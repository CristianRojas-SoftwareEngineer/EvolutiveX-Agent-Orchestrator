import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';

const existsSyncMock = vi.hoisted(() => vi.fn());

vi.mock('fs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    existsSync: existsSyncMock,
  };
});

describe('resolveEventImagePath', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'event-img-'));
    process.env['LOCALAPPDATA'] = tmpDir;
    vi.resetModules();
    existsSyncMock.mockImplementation((p: string) => {
      return p.includes('events') && p.endsWith('stop.png');
    });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('prioriza la ruta estable sobre el repo', async () => {
    const stableDir = join(tmpDir, 'AIAssistant', 'events');
    mkdirSync(stableDir, { recursive: true });
    const stableFile = join(stableDir, 'stop.png');
    writeFileSync(stableFile, 'x');
    existsSyncMock.mockImplementation((p: string) => p === stableFile || p.includes('assets/notifications/events/stop.png'));

    const { resolveEventImagePath } = await import(
      '../../../src/2-services/notifications/event-image-paths.js'
    );
    expect(resolveEventImagePath('stop.png')).toBe(stableFile);
  });
});
