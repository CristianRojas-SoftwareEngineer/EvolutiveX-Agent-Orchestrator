import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('resolveEventImagePath', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'event-image-test-'));
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true });
    vi.restoreAllMocks();
  });

  it('devuelve la ruta del repo cuando el PNG existe', async () => {
    const pngPath = join(repoDir, 'stop.png');
    writeFileSync(pngPath, 'data');
    const mod = await import('../../../src/2-services/notifications/event-image-paths.js');
    mod.repoEventsDirProvider.get = () => repoDir;
    expect(mod.resolveEventImagePath('stop.png')).toBe(pngPath);
  });

  it('devuelve undefined cuando el PNG no existe', async () => {
    const mod = await import('../../../src/2-services/notifications/event-image-paths.js');
    mod.repoEventsDirProvider.get = () => repoDir;
    expect(mod.resolveEventImagePath('stop.png')).toBeUndefined();
  });

  it('comportamiento idéntico en win32, darwin y linux', async () => {
    const pngPath = join(repoDir, 'stop.png');
    writeFileSync(pngPath, 'data');
    const originalPlatform = process.platform;

    for (const platform of ['win32', 'darwin', 'linux'] as NodeJS.Platform[]) {
      Object.defineProperty(process, 'platform', { value: platform, configurable: true });
      vi.resetModules();
      const mod = await import('../../../src/2-services/notifications/event-image-paths.js');
      mod.repoEventsDirProvider.get = () => repoDir;
      expect(mod.resolveEventImagePath('stop.png')).toBe(pngPath);
    }

    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });
});
