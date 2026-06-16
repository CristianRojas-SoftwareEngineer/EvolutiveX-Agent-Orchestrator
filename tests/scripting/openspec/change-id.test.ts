import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  collectChangeDirectories,
  computeNextChangeId,
  findDuplicateChangeIds,
  formatArchivedChangeName,
  parseChangeNumericId,
  stripArchiveDatePrefix,
} from '../../../scripting/openspec/change-id.js';

describe('formatArchivedChangeName', () => {
  it('compone YYYY-MM-DD--<change-name>', () => {
    expect(formatArchivedChangeName('2026-06-16', 'c00068-fix-change-id-increment')).toBe(
      '2026-06-16--c00068-fix-change-id-increment',
    );
  });
});

describe('stripArchiveDatePrefix', () => {
  it('quita YYYY-MM-DD-- de nombres archivados canónicos', () => {
    expect(stripArchiveDatePrefix('2026-06-16--c00069-remove-log-http-level')).toBe(
      'c00069-remove-log-http-level',
    );
  });

  it('no normaliza nombres con guión simple tras la fecha', () => {
    expect(stripArchiveDatePrefix('2026-06-16-c00058-remove-log-http-level')).toBe(
      '2026-06-16-c00058-remove-log-http-level',
    );
    expect(parseChangeNumericId('2026-06-16-c00058-remove-log-http-level')).toBeNull();
  });

  it('deja intactos nombres sin prefijo de fecha', () => {
    expect(stripArchiveDatePrefix('c00068-fix-change-id-increment')).toBe(
      'c00068-fix-change-id-increment',
    );
  });
});

describe('parseChangeNumericId', () => {
  it('extrae el entero tras normalizar fecha con doble guión', () => {
    expect(parseChangeNumericId('2026-06-16--c00067-agentkanban-board-mirror')).toBe(67);
  });

  it('devuelve null si el nombre no empieza por c tras normalizar', () => {
    expect(parseChangeNumericId('2026-06-01-gateway-migration')).toBeNull();
    expect(parseChangeNumericId('add-auth')).toBeNull();
  });
});

describe('computeNextChangeId', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function makeChangesTree(structure: {
    active?: string[];
    archive?: string[];
    phases?: Record<string, string[]>;
  }): string {
    tempDir = mkdtempSync(join(tmpdir(), 'openspec-change-id-'));
    const changesDir = join(tempDir, 'openspec', 'changes');
    mkdirSync(join(changesDir, 'archive'), { recursive: true });

    for (const name of structure.active ?? []) {
      mkdirSync(join(changesDir, name));
    }
    for (const name of structure.archive ?? []) {
      mkdirSync(join(changesDir, 'archive', name));
    }
    for (const [parent, phaseNames] of Object.entries(structure.phases ?? {})) {
      const phasesDir = join(changesDir, 'archive', parent, 'phases');
      mkdirSync(phasesDir, { recursive: true });
      for (const phaseName of phaseNames) {
        mkdirSync(join(phasesDir, phaseName));
      }
    }

    return changesDir;
  }

  it('devuelve c00001 cuando no hay directorios con prefijo c', () => {
    const changesDir = makeChangesTree({
      archive: ['2026-06-01-gateway-migration'],
    });
    expect(computeNextChangeId(changesDir)).toBe('c00001');
  });

  it('cuenta archivos con prefijo de fecha para el máximo', () => {
    const changesDir = makeChangesTree({
      archive: ['2026-06-16--c00069-remove-log-http-level'],
    });
    expect(computeNextChangeId(changesDir)).toBe('c00070');
  });

  it('cuenta fases anidadas bajo archive/*/phases/', () => {
    const changesDir = makeChangesTree({
      archive: ['2026-06-01--c00012-gateway-migration'],
      phases: {
        '2026-06-01--c00012-gateway-migration': ['2026-05-29--c00008-gateway-g4-audit-projection'],
      },
    });
    expect(computeNextChangeId(changesDir)).toBe('c00013');
  });

  it('ignora directorios activos sin prefijo c', () => {
    const changesDir = makeChangesTree({
      active: ['add-auth', 'c00001-foo'],
      archive: [],
    });
    expect(computeNextChangeId(changesDir)).toBe('c00002');
  });

  it('contraejemplo: sin normalizar fecha el prefijo c no se detectaría', () => {
    const archived = '2026-06-16--c00001-foo';
    expect(archived.match(/^c(\d+)/)).toBeNull();
    expect(parseChangeNumericId(archived)).toBe(1);
  });
});

describe('findDuplicateChangeIds', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('detecta colisión del mismo c<NNNNN> en archive', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'openspec-dup-'));
    const changesDir = join(tempDir, 'openspec', 'changes');
    mkdirSync(join(changesDir, 'archive', '2026-06-16--c00001-foo'), { recursive: true });
    mkdirSync(join(changesDir, 'archive', '2026-06-16--c00001-bar'), { recursive: true });

    const duplicates = findDuplicateChangeIds(changesDir);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].numericId).toBe(1);
    expect(duplicates[0].entries).toHaveLength(2);
  });

  it('detecta colisión entre raíz y fase anidada', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'openspec-dup-phase-'));
    const changesDir = join(tempDir, 'openspec', 'changes');
    const parent = '2026-06-01--c00099-gateway-migration';
    mkdirSync(join(changesDir, 'archive', parent, 'phases', '2026-05-29--c00012-other'), {
      recursive: true,
    });
    mkdirSync(join(changesDir, 'archive', '2026-06-02--c00012-foo'), { recursive: true });

    const duplicates = findDuplicateChangeIds(changesDir);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].numericId).toBe(12);
    expect(duplicates[0].entries).toHaveLength(2);
  });

  it('no reporta duplicados cuando los enteros difieren', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'openspec-nodup-'));
    const changesDir = join(tempDir, 'openspec', 'changes');
    mkdirSync(join(changesDir, 'archive', '2026-06-16--c00001-foo'), { recursive: true });
    mkdirSync(join(changesDir, 'archive', '2026-06-16--c00002-bar'), { recursive: true });

    expect(findDuplicateChangeIds(changesDir)).toHaveLength(0);
  });
});

describe('collectChangeDirectories', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('excluye archive de activos', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'openspec-collect-'));
    const changesDir = join(tempDir, 'openspec', 'changes');
    mkdirSync(join(changesDir, 'archive'), { recursive: true });
    mkdirSync(join(changesDir, 'c00003-active'));

    const names = collectChangeDirectories(changesDir).map((e) => e.rawName);
    expect(names).toContain('c00003-active');
    expect(names).not.toContain('archive');
  });

  it('incluye fases bajo archive/*/phases/', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'openspec-collect-phases-'));
    const changesDir = join(tempDir, 'openspec', 'changes');
    const parent = '2026-06-01--c00012-gateway-migration';
    const phaseName = '2026-05-29--c00008-gateway-g4-audit-projection';
    mkdirSync(join(changesDir, 'archive', parent, 'phases', phaseName), { recursive: true });

    const phaseEntries = collectChangeDirectories(changesDir).filter((e) => e.rawName === phaseName);
    expect(phaseEntries).toHaveLength(1);
    expect(phaseEntries[0].numericId).toBe(8);
  });
});
