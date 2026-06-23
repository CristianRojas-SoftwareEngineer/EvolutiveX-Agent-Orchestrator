import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { renderPostCommitHook, installPostCommitHook } from '../../../scripting/changelog/install-changelog-hook.js';

describe('renderPostCommitHook', () => {
  it('incluye shebang bash', () => {
    const content = renderPostCommitHook('/repo');
    expect(content).toContain('#!/usr/bin/env bash');
  });

  it('incluye guard de recursión con lock', () => {
    const content = renderPostCommitHook('/repo');
    expect(content).toContain('[ -f "$LOCK" ] && exit 0');
    expect(content).toContain('post-commit.lock');
  });

  it('invoca generate-changelog (extensión .ts)', () => {
    const content = renderPostCommitHook('/repo');
    expect(content).toContain('generate-changelog.ts');
  });

  it('invoca git commit --amend --no-edit --no-verify', () => {
    const content = renderPostCommitHook('/repo');
    expect(content).toContain('commit --amend --no-edit --no-verify');
  });

  it('incluye git add CHANGELOG.md', () => {
    const content = renderPostCommitHook('/repo');
    expect(content).toContain('git -C "$REPO_ROOT" add CHANGELOG.md');
  });

  it('usa la ruta del repo como REPO_ROOT', () => {
    const content = renderPostCommitHook('/my/custom/path');
    expect(content).toContain("REPO_ROOT='/my/custom/path'");
  });
});

describe('installPostCommitHook — integración', () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = join(tmpdir(), `hook-test-${Date.now()}`);
    mkdirSync(join(tmpRepo, '.git'), { recursive: true });
    // Configurar git identidad mínima para que funcione
    execSync('git init', { cwd: tmpRepo, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: tmpRepo });
    execSync('git config user.name "Test"', { cwd: tmpRepo });
  });

  afterEach(() => {
    rmSync(tmpRepo, { recursive: true, force: true });
  });

  it('crea .git/hooks/post-commit', () => {
    const { path } = installPostCommitHook(tmpRepo);
    expect(existsSync(path)).toBe(true);
  });

  it('el archivo contiene shebang y la invocación', () => {
    const { hookContent } = installPostCommitHook(tmpRepo);
    expect(hookContent).toContain('#!/usr/bin/env bash');
    expect(hookContent).toContain('generate-changelog');
    expect(hookContent).toContain('commit --amend --no-edit --no-verify');
  });

  it('es idempotente (reemplaza si ya existe)', () => {
    const r1 = installPostCommitHook(tmpRepo);
    expect(existsSync(r1.path)).toBe(true);

    const r2 = installPostCommitHook(tmpRepo);
    expect(r2.path).toBe(r1.path);
    expect(existsSync(r2.path)).toBe(true);
  });
});
