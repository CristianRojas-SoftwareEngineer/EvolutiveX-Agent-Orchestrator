#!/usr/bin/env tsx

/**
 * close-phase.ts — Cierre canónico de fase del pipeline specification-delta.
 *
 * Encapsula los tres efectos de cierre que cada subagente de fase debe producir:
 *   1. Escritura atómica del marcador de completitud (<phase>.done).
 *   2. Escritura atómica del sidecar de timings (<phase>.timings.json).
 *   3. Limpieza del workbench (solo cuando --phase=closer).
 *
 * Uso:
 *   npm run openspec:close-phase -- --phase <explorer|planner|implementer|closer> \
 *                                   --change <cNNNNN-slug> \
 *                                   --duration-ms <n>
 *
 * Reglas de validación de --duration-ms:
 *   - Debe ser un número entero finito >= 0.
 *   - Si no es un número finito (NaN, Infinity, string no numérico): exit 1.
 *   - Si es 0 y la fase tuvo duración real no nula, emite advertencia a stderr
 *     (el script no puede detectarlo; la responsabilidad es del invocador).
 */

import * as fs from 'fs';
import * as path from 'path';

import { writePhaseMarker } from './read-phase-marker.js';

// ---------------------------------------------------------------------------
// Fases válidas
// ---------------------------------------------------------------------------

const VALID_PHASES = ['explorer', 'planner', 'implementer', 'closer'] as const;
type Phase = (typeof VALID_PHASES)[number];

// ---------------------------------------------------------------------------
// Parseo de argumentos
// ---------------------------------------------------------------------------

interface Args {
  phase: Phase;
  change: string;
  durationMs: number;
}

function parseArgs(argv: string[]): Args {
  let phase: string | null = null;
  let change: string | null = null;
  let durationMsRaw: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--phase' && argv[i + 1]) {
      phase = argv[++i];
    } else if (arg.startsWith('--phase=')) {
      phase = arg.slice('--phase='.length);
    } else if (arg === '--change' && argv[i + 1]) {
      change = argv[++i];
    } else if (arg.startsWith('--change=')) {
      change = arg.slice('--change='.length);
    } else if (arg === '--duration-ms' && argv[i + 1]) {
      durationMsRaw = argv[++i];
    } else if (arg.startsWith('--duration-ms=')) {
      durationMsRaw = arg.slice('--duration-ms='.length);
    }
  }

  if (!phase || !VALID_PHASES.includes(phase as Phase)) {
    console.error(
      `Error: --phase es obligatorio y debe ser uno de: ${VALID_PHASES.join(', ')}.`,
    );
    process.exit(1);
  }
  if (!change || change.trim().length === 0) {
    console.error('Error: --change es obligatorio y no puede estar vacío.');
    process.exit(1);
  }
  if (durationMsRaw === null) {
    console.error('Error: --duration-ms es obligatorio.');
    process.exit(1);
  }

  // Validar durationMs: debe ser número finito >= 0.
  const durationMs = Number(durationMsRaw);
  if (!Number.isFinite(durationMs)) {
    console.error(
      `Error: --duration-ms "${durationMsRaw}" no es un número finito. ` +
        'Debe ser un entero >= 0 proveniente del harness (tool_result.usage.duration_ms).',
    );
    process.exit(1);
  }
  if (durationMs < 0) {
    console.error(
      `Error: --duration-ms "${durationMsRaw}" es negativo. Debe ser >= 0.`,
    );
    process.exit(1);
  }
  if (durationMs === 0) {
    console.warn(
      `Advertencia: --duration-ms es 0. Si la fase tuvo duración real no nula, ` +
        'pasa el valor correcto de tool_result.usage.duration_ms.',
    );
  }

  return { phase: phase as Phase, change: change.trim(), durationMs };
}

// ---------------------------------------------------------------------------
// Escritura atómica del sidecar de timings
// ---------------------------------------------------------------------------

function writeTimingsSidecar(
  phase: Phase,
  change: string,
  durationMs: number,
  workbenchRoot: string,
): void {
  const completedAt = new Date().toISOString();
  const obj = {
    change,
    phase,
    durationMs,
    completedAt,
  };
  const sidecaPath = path.join(workbenchRoot, `${phase}.timings.json`);
  const tmpPath = sidecaPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(obj), 'utf8');
  fs.renameSync(tmpPath, sidecaPath);
  console.log(`Sidecar de timings escrito: ${sidecaPath}`);
}

// ---------------------------------------------------------------------------
// Limpieza del workbench (solo --phase=closer)
// ---------------------------------------------------------------------------

function cleanWorkbench(workbenchRoot: string): void {
  const filesToRemove = [
    'explorer.done',
    'planner.done',
    'implementer.done',
    'explorer.timings.json',
    'planner.timings.json',
    'implementer.timings.json',
    'closer.timings.json',
    'auto-pipeline.json',
    'auto-pipeline.halt.json',
  ];
  for (const file of filesToRemove) {
    const fullPath = path.join(workbenchRoot, file);
    try {
      fs.rmSync(fullPath, { force: true });
    } catch (err) {
      // Silencioso si el archivo no existe (force:true ya lo maneja, pero
      // en algunos entornos rmSync puede lanzar incluso con force).
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.warn(`Advertencia al limpiar "${fullPath}": ${(err as Error).message}`);
      }
    }
  }
  console.log('Workbench limpiado (phase=closer).');
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

const { phase, change, durationMs } = parseArgs(process.argv.slice(2));

const workbenchRoot =
  process.env['CLOSE_PHASE_WORKBENCH_OVERRIDE'] ??
  path.join(process.cwd(), 'openspec', '.workbench');

// Garantizar que el directorio workbench existe.
fs.mkdirSync(workbenchRoot, { recursive: true });

// 1. Escribir el marcador de completitud.
//    writePhaseMarker lanza si phase === 'closer'; el closer no escribe marcador .done.
if (phase !== 'closer') {
  writePhaseMarker(phase, change, workbenchRoot);
  console.log(`Marcador de fase escrito: ${phase}.done (change=${change})`);
}

// 2. Escribir el sidecar de timings.
writeTimingsSidecar(phase, change, durationMs, workbenchRoot);

// 3. Limpiar workbench si --phase=closer.
if (phase === 'closer') {
  cleanWorkbench(workbenchRoot);
}
