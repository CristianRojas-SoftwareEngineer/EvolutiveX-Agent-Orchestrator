#!/usr/bin/env tsx

import { readdirSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { formatArchivedChangeName } from './change-id.js';

const EXISTING_C_PREFIX = /^c\d{5}-/;

export type ArchiveRenameKind = 'root' | 'phase';

export interface ArchiveRenameEntry {
  oldName: string;
  newName: string;
  numericId: string;
  slug: string;
  archiveDate: string;
  kind: ArchiveRenameKind;
  pass: 1 | 2;
}

interface ArchivedChangeCandidate {
  kind: ArchiveRenameKind;
  oldRelativePath: string;
  archiveDate: string;
  slug: string;
  parentRootDir?: string;
}

export function parseArchiveLeafName(leafName: string): { archiveDate: string; slug: string } | null {
  const match = leafName.match(/^(\d{4}-\d{2}-\d{2})--(.+)$/);
  if (!match) {
    return null;
  }
  const slug = match[2].replace(EXISTING_C_PREFIX, '');
  return { archiveDate: match[1], slug };
}

function listSubdirectories(parentDir: string): string[] {
  try {
    return readdirSync(parentDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** Recopila changes archivados (raíz + fases L2 bajo phases/). */
export function collectArchivedChanges(archiveDir: string): ArchivedChangeCandidate[] {
  const candidates: ArchivedChangeCandidate[] = [];

  for (const rootName of listSubdirectories(archiveDir)) {
    const rootParts = parseArchiveLeafName(rootName);
    if (!rootParts) {
      throw new Error(`Nombre de archivo raíz no reconocido: ${rootName}`);
    }
    candidates.push({
      kind: 'root',
      oldRelativePath: rootName,
      archiveDate: rootParts.archiveDate,
      slug: rootParts.slug,
    });

    const phasesDir = join(archiveDir, rootName, 'phases');
    if (!statSync(phasesDir, { throwIfNoEntry: false })?.isDirectory()) {
      continue;
    }

    for (const phaseLeaf of listSubdirectories(phasesDir)) {
      const phaseParts = parseArchiveLeafName(phaseLeaf);
      if (!phaseParts) {
        continue;
      }
      candidates.push({
        kind: 'phase',
        oldRelativePath: join(rootName, 'phases', phaseLeaf).replace(/\\/g, '/'),
        archiveDate: phaseParts.archiveDate,
        slug: phaseParts.slug,
        parentRootDir: rootName,
      });
    }
  }

  return candidates;
}

function buildFinalLeafName(archiveDate: string, numericId: string, slug: string): string {
  return formatArchivedChangeName(archiveDate, `${numericId}-${slug}`);
}

/** Genera manifest de reenumeración global con doble guión y c<NNNNN> en raíz y fases. */
export function buildArchiveRenameManifest(archiveDir: string): ArchiveRenameEntry[] {
  const candidates = collectArchivedChanges(archiveDir).sort((a, b) => {
    const dateCmp = a.archiveDate.localeCompare(b.archiveDate);
    if (dateCmp !== 0) {
      return dateCmp;
    }
    return a.slug.localeCompare(b.slug);
  });

  const numbered = candidates.map((entry, index) => {
    const numericId = `c${String(index + 1).padStart(5, '0')}`;
    return { ...entry, numericId };
  });

  const rootFinalNames = new Map<string, string>();
  for (const entry of numbered) {
    if (entry.kind !== 'root') {
      continue;
    }
    rootFinalNames.set(
      entry.oldRelativePath,
      buildFinalLeafName(entry.archiveDate, entry.numericId, entry.slug),
    );
  }

  const manifest: ArchiveRenameEntry[] = [];

  for (const entry of numbered) {
    if (entry.kind === 'phase') {
      const parentOld = entry.parentRootDir!;
      const phaseNewLeaf = buildFinalLeafName(entry.archiveDate, entry.numericId, entry.slug);
      const pass1NewName = join(parentOld, 'phases', phaseNewLeaf).replace(/\\/g, '/');

      if (entry.oldRelativePath !== pass1NewName) {
        manifest.push({
          oldName: entry.oldRelativePath,
          newName: pass1NewName,
          numericId: entry.numericId,
          slug: entry.slug,
          archiveDate: entry.archiveDate,
          kind: 'phase',
          pass: 1,
        });
      }
      continue;
    }

    const rootNewLeaf = rootFinalNames.get(entry.oldRelativePath)!;
    if (entry.oldRelativePath !== rootNewLeaf) {
      manifest.push({
        oldName: entry.oldRelativePath,
        newName: rootNewLeaf,
        numericId: entry.numericId,
        slug: entry.slug,
        archiveDate: entry.archiveDate,
        kind: 'root',
        pass: 2,
      });
    }
  }

  return manifest;
}

function main(): void {
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const archiveDir = join(projectRoot, 'openspec', 'changes', 'archive');
  const manifest = buildArchiveRenameManifest(archiveDir);

  const newNames = new Set(manifest.map((e) => e.newName));
  if (newNames.size !== manifest.length) {
    throw new Error('Colisión de newName en el manifest');
  }

  const outPath = join(dirname(fileURLToPath(import.meta.url)), 'archive-rename-manifest.json');
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const pass1 = manifest.filter((e) => e.pass === 1).length;
  const pass2 = manifest.filter((e) => e.pass === 2).length;

  console.error(`Manifest: ${manifest.length} entradas (${pass1} pass1, ${pass2} pass2) → ${outPath}`);
  console.error('Primeras 5:');
  for (const entry of manifest.slice(0, 5)) {
    console.error(`  [pass${entry.pass}] ${entry.oldName} → ${entry.newName}`);
  }
  console.error('Últimas 5:');
  for (const entry of manifest.slice(-5)) {
    console.error(`  [pass${entry.pass}] ${entry.oldName} → ${entry.newName}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
