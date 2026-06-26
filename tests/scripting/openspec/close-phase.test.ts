/**
 * Tests para scripting/openspec/close-phase.ts
 *
 * Prueba la lógica de validación de --duration-ms, escritura del marcador,
 * escritura del sidecar de timings, y limpieza del workbench para --phase=closer.
 *
 * Se invocan directamente las funciones exportadas del módulo (si las hubiera)
 * o se verifica el comportamiento vía execFileSync sobre el CLI.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

const WORKBENCH = 'tests/scripting/openspec/_test_workbench_close_phase';
const CHANGE = 'c00091-test-close-phase';

function cleanWorkbench() {
  if (fs.existsSync(WORKBENCH)) {
    fs.rmSync(WORKBENCH, { recursive: true, force: true });
  }
  fs.mkdirSync(WORKBENCH, { recursive: true });
}

function runClosePhase(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const cli = path.join(process.cwd(), 'scripting', 'openspec', 'close-phase.ts');
  try {
    const stdout = execFileSync(
      process.execPath,
      [
        '--import',
        'tsx/esm',
        cli,
        `--change`,
        CHANGE,
        ...args,
        // Apunta al workbench de tests en vez del real
        // (close-phase.ts lee cwd + openspec/.workbench;
        //  para tests sobreescribimos pasando el path mediante env)
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, CLOSE_PHASE_WORKBENCH_OVERRIDE: WORKBENCH },
        cwd: process.cwd(),
      },
    );
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.status ?? 1,
    };
  }
}

beforeEach(() => {
  cleanWorkbench();
});

afterEach(() => {
  cleanWorkbench();
});

// ---------------------------------------------------------------------------
// Validación de --duration-ms
// ---------------------------------------------------------------------------

describe('close-phase --duration-ms validation', () => {
  it('falla con exit 1 cuando --duration-ms es un string no numérico', () => {
    const result = runClosePhase(['--phase', 'explorer', '--duration-ms', 'abc']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/número finito|finito/i);
  });

  it('falla con exit 1 cuando --duration-ms es NaN explícito', () => {
    const result = runClosePhase(['--phase', 'explorer', '--duration-ms', 'NaN']);
    expect(result.exitCode).toBe(1);
  });

  it('falla con exit 1 cuando --duration-ms es negativo', () => {
    const result = runClosePhase(['--phase', 'explorer', '--duration-ms', '-1']);
    expect(result.exitCode).toBe(1);
  });

  it('falla con exit 1 cuando --duration-ms está ausente', () => {
    const result = runClosePhase(['--phase', 'explorer']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/duration-ms/i);
  });

  it('acepta --duration-ms 0 (emite advertencia pero no falla)', () => {
    const result = runClosePhase(['--phase', 'explorer', '--duration-ms', '0']);
    // Puede ser exit 0 con advertencia a stderr
    expect(result.exitCode).toBe(0);
  });

  it('acepta --duration-ms como entero positivo', () => {
    const result = runClosePhase(['--phase', 'explorer', '--duration-ms', '174911']);
    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Sidecar de timings: durationMs es número, no string
// ---------------------------------------------------------------------------

describe('close-phase sidecar durationMs es número', () => {
  it('escribe durationMs como número (no string) en el sidecar', () => {
    const result = runClosePhase(['--phase', 'planner', '--duration-ms', '174911']);
    expect(result.exitCode).toBe(0);

    const sidecaPath = path.join(WORKBENCH, 'planner.timings.json');
    expect(fs.existsSync(sidecaPath)).toBe(true);

    const raw = fs.readFileSync(sidecaPath, 'utf8');
    const parsed = JSON.parse(raw) as { durationMs: unknown };
    expect(typeof parsed.durationMs).toBe('number');
    expect(parsed.durationMs).toBe(174911);
  });

  it('el sidecar contiene los campos canónicos (change, phase, durationMs, completedAt)', () => {
    runClosePhase(['--phase', 'implementer', '--duration-ms', '60000']);
    const raw = fs.readFileSync(path.join(WORKBENCH, 'implementer.timings.json'), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.change).toBe(CHANGE);
    expect(parsed.phase).toBe('implementer');
    expect(typeof parsed.durationMs).toBe('number');
    expect(typeof parsed.completedAt).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Marcador de fase: escrito atómicamente para fases no-closer
// ---------------------------------------------------------------------------

describe('close-phase marcador de fase', () => {
  it('escribe el marcador .done para --phase explorer', () => {
    const result = runClosePhase(['--phase', 'explorer', '--duration-ms', '5000']);
    expect(result.exitCode).toBe(0);

    const markerPath = path.join(WORKBENCH, 'explorer.done');
    expect(fs.existsSync(markerPath)).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(markerPath, 'utf8')) as {
      change: string;
      completedAt: string;
    };
    expect(parsed.change).toBe(CHANGE);
    expect(typeof parsed.completedAt).toBe('string');
  });

  it('no escribe .done para --phase closer (el closer no tiene marcador)', () => {
    runClosePhase(['--phase', 'closer', '--duration-ms', '5000']);
    const markerPath = path.join(WORKBENCH, 'closer.done');
    expect(fs.existsSync(markerPath)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Limpieza de workbench para --phase=closer
// ---------------------------------------------------------------------------

describe('close-phase limpieza del workbench (--phase closer)', () => {
  it('elimina los marcadores y sidecars de fases anteriores', () => {
    // Crear archivos simulados
    const files = [
      'explorer.done',
      'planner.done',
      'implementer.done',
      'explorer.timings.json',
      'planner.timings.json',
      'implementer.timings.json',
      'closer.timings.json',
      'auto-pipeline.json',
    ];
    for (const f of files) {
      fs.writeFileSync(path.join(WORKBENCH, f), '{}');
    }

    const result = runClosePhase(['--phase', 'closer', '--duration-ms', '30000']);
    expect(result.exitCode).toBe(0);

    for (const f of files) {
      expect(fs.existsSync(path.join(WORKBENCH, f))).toBe(false);
    }
  });
});
