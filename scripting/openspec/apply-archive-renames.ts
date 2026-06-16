#!/usr/bin/env tsx

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import type { ArchiveRenameEntry } from './build-archive-rename-manifest.js';

function gitMvOrFallback(from: string, to: string, projectRoot: string): void {
  const fromPosix = from.replace(/\\/g, '/');
  const toPosix = to.replace(/\\/g, '/');
  try {
    execSync(`git mv "${fromPosix}" "${toPosix}"`, { cwd: projectRoot, stdio: 'pipe' });
    return;
  } catch {
    // Windows: git mv a veces falla con Permission denied; copiar y registrar en git.
    const fromEsc = from.replace(/'/g, "''");
    const toEsc = to.replace(/'/g, "''");
    execSync(
      `powershell -NoProfile -Command "Copy-Item -Recurse -Force '${fromEsc}' '${toEsc}'; Remove-Item -Recurse -Force '${fromEsc}'"`,
      { cwd: projectRoot, stdio: 'inherit' },
    );
    execSync(`git add "${toPosix}"`, { cwd: projectRoot, stdio: 'inherit' });
    execSync(`git rm -r "${fromPosix}"`, { cwd: projectRoot, stdio: 'inherit' });
  }
}

function applyPass(
  manifest: ArchiveRenameEntry[],
  pass: 1 | 2,
  archiveDir: string,
  projectRoot: string,
): number {
  const toApply = manifest
    .filter((entry) => entry.pass === pass && entry.oldName !== entry.newName)
    .sort((a, b) => b.oldName.length - a.oldName.length);

  let applied = 0;
  for (const entry of toApply) {
    const from = join(archiveDir, entry.oldName);
    const to = join(archiveDir, entry.newName);
    if (!existsSync(from)) {
      if (existsSync(to)) {
        console.error(`SKIP (ya renombrado): ${entry.oldName}`);
        continue;
      }
      throw new Error(`No existe: ${from}`);
    }
    if (existsSync(to)) {
      throw new Error(`Destino ya existe: ${to}`);
    }
    gitMvOrFallback(from, to, projectRoot);
    applied++;
  }

  return applied;
}

function main(): void {
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const archiveDir = join(projectRoot, 'openspec', 'changes', 'archive');
  const manifestPath = join(dirname(fileURLToPath(import.meta.url)), 'archive-rename-manifest.json');

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ArchiveRenameEntry[];

  const pass1 = applyPass(manifest, 1, archiveDir, projectRoot);
  const pass2 = applyPass(manifest, 2, archiveDir, projectRoot);

  console.error(`Renombres aplicados: pass1=${pass1}, pass2=${pass2}, total=${pass1 + pass2}`);
}

main();
