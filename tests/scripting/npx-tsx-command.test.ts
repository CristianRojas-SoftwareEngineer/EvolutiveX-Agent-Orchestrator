import { describe, it, expect, afterEach } from 'vitest';
import {
  buildNpxTsxCommand,
  resolvePosixAbsolutePath,
} from '../../scripting/shared/npx-tsx-command.js';

describe('resolvePosixAbsolutePath', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('usa separadores / en Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const abs = resolvePosixAbsolutePath('C:\\Program Files\\Smart Code Proxy', 'src/cli.ts');
    expect(abs).toBe('C:/Program Files/Smart Code Proxy/src/cli.ts');
    expect(abs).not.toContain('\\');
  });

  it('no emite backslashes (shell POSIX)', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const abs = resolvePosixAbsolutePath('/home/user/Smart Code Proxy', 'src/cli.ts');
    expect(abs).not.toContain('\\');
    expect(abs).toContain('/Smart Code Proxy/src/cli.ts');
  });
});

describe('buildNpxTsxCommand', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('genera rutas absolutas con / en el comando (Windows)', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const cmd = buildNpxTsxCommand('C:\\Proxy', 'scripting/provider/router-status.ts', ['--flag']);
    expect(cmd).toMatch(
      /^npx --prefix "C:\/Proxy" tsx "C:\/Proxy\/scripting\/provider\/router-status\.ts" --flag$/,
    );
  });

  it('cita con comillas simples y sin backslashes (Unix)', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const cmd = buildNpxTsxCommand('/home/user/Proxy', 'scripting/provider/router-status.ts');
    expect(cmd).not.toContain('\\');
    expect(cmd).not.toContain('"');
    expect(cmd).toMatch(/^npx --prefix '[^']+' tsx '[^']+\/scripting\/provider\/router-status\.ts'$/);
  });
});
