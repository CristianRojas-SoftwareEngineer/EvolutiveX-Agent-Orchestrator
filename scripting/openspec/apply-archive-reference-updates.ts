#!/usr/bin/env tsx

import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import type { ArchiveRenameEntry } from './build-archive-rename-manifest.js';

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const TEXT_EXTENSIONS = new Set(['.md', '.ts', '.yaml', '.yml', '.json']);

function walkFiles(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) {
      continue;
    }
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkFiles(full, files);
    } else if (TEXT_EXTENSIONS.has(name.slice(name.lastIndexOf('.')))) {
      files.push(full);
    }
  }
  return files;
}

function applyReplacements(content: string, manifest: ArchiveRenameEntry[]): string {
  let result = content;
  const sorted = [...manifest].sort((a, b) => b.oldName.length - a.oldName.length);

  for (const entry of sorted) {
    if (entry.oldName === entry.newName) {
      continue;
    }
    const oldLeaf = entry.oldName.split('/').pop() ?? entry.oldName;
    const newLeaf = entry.newName.split('/').pop() ?? entry.newName;
    const variants: [string, string][] = [
      [`openspec/changes/archive/${entry.oldName}`, `openspec/changes/archive/${entry.newName}`],
      [`openspec\\changes\\archive\\${entry.oldName}`, `openspec\\changes\\archive\\${entry.newName}`],
      [entry.oldName, entry.newName],
    ];
    if (oldLeaf !== entry.oldName && oldLeaf !== newLeaf) {
      variants.push([oldLeaf, newLeaf]);
      variants.push([`phases/${oldLeaf}`, `phases/${newLeaf}`]);
    }
    for (const [from, to] of variants) {
      if (result.includes(from)) {
        result = result.split(from).join(to);
      }
    }
  }
  return result;
}

function main(): void {
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const manifestPath = join(dirname(fileURLToPath(import.meta.url)), 'archive-rename-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ArchiveRenameEntry[];

  const files = walkFiles(projectRoot);
  let updated = 0;

  for (const file of files) {
    const normalized = file.replace(/\\/g, '/');
    if (normalized.endsWith('archive-rename-manifest.json')) {
      continue;
    }
    if (normalized.includes('tests/scripting/openspec/change-id.test.ts')) {
      continue;
    }
    const original = readFileSync(file, 'utf8');
    const next = applyReplacements(original, manifest);
    if (next !== original) {
      writeFileSync(file, next, 'utf8');
      updated++;
    }
  }

  console.error(`Archivos actualizados: ${updated}`);
}

main();
