import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';

describe('resolveEventImagePath', () => {
  let tmpDir: string;
  let stableDir: string;
  let repoDir: string;
  const originalPlatform = process.platform;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'event-img-'));
    repoDir = mkdtempSync(join(tmpdir(), 'event-img-repo-'));
    process.env['LOCALAPPDATA'] = tmpDir;
    stableDir = join(tmpDir, 'AIAssistant', 'events');
    mkdirSync(stableDir, { recursive: true });
    vi.resetModules();
    Object.defineProperty(process, 'platform', { value: 'win32' });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('devuelve la ruta estable cuando existe', async () => {
    const stableFile = join(stableDir, 'stop.png');
    writeFileSync(stableFile, 'stable');
    const eventImagePaths = await import(
      '../../../src/2-services/notifications/event-image-paths.js'
    );
    expect(eventImagePaths.resolveEventImagePath('stop.png')).toBe(stableFile);
  });

  it('en Windows recopia del repo al cache cuando el hash difiere', async () => {
    const repoFile = join(repoDir, 'stop.png');
    const stableFile = join(stableDir, 'stop.png');
    writeFileSync(repoFile, 'repo-new');
    writeFileSync(stableFile, 'stable-old');

    const eventImagePaths = await import(
      '../../../src/2-services/notifications/event-image-paths.js'
    );
    eventImagePaths.repoEventsDirProvider.get = () => repoDir;

    eventImagePaths.syncEventImageFromRepoIfStale('stop.png');

    expect(readFileSync(stableFile, 'utf8')).toBe('repo-new');
    expect(eventImagePaths.resolveEventImagePath('stop.png')).toBe(stableFile);
  });
});
