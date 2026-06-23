#!/usr/bin/env tsx

import {
  collectChangeDirectories,
  findDuplicateChangeIds,
  parseChangeNumericId,
  resolveDefaultChangesDir,
} from './change-id.js';

function parseArgs(argv: string[]): { changeName: string | null } {
  let changeName: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--change' && argv[i + 1]) {
      changeName = argv[++i];
    } else if (arg.startsWith('--change=')) {
      changeName = arg.slice('--change='.length);
    }
  }
  return { changeName };
}

const { changeName } = parseArgs(process.argv.slice(2));

if (!changeName) {
  console.error('Uso: npm run openspec:verify-change-id -- --change <cNNNNN-slug>');
  process.exit(1);
}

const changesDir = resolveDefaultChangesDir();
const numericId = parseChangeNumericId(changeName);

if (numericId === null) {
  console.error(`El nombre "${changeName}" no contiene un prefijo c<NNNNN> válido.`);
  process.exit(1);
}

const duplicates = findDuplicateChangeIds(changesDir);
const conflict = duplicates.find((group) => group.numericId === numericId);

if (conflict) {
  console.error(
    `CRITICAL: el identificador c${String(numericId).padStart(5, '0')} aparece en ${conflict.entries.length} directorios:`,
  );
  for (const entry of conflict.entries) {
    console.error(`  - ${entry.relativePath}`);
  }
  process.exit(1);
}

// Verificar que el change solicitado existe en el filesystem
const all = collectChangeDirectories(changesDir);
const exists = all.some(
  (entry) => entry.normalizedName === changeName || entry.rawName === changeName,
);

if (!exists) {
  console.error(
    `Advertencia: no se encontró el directorio del change "${changeName}" bajo ${changesDir}`,
  );
  process.exit(1);
}

process.exit(0);
