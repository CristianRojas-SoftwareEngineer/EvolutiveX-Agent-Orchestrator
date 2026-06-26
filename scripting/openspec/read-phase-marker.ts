/**
 * Protocolo de escritura atomica del marcador de fase
 * =====================================================
 *
 * Cada subagente de fase (explorer, planner, implementer) escribe su marcador
 * atomico siguiendo este protocolo de dos pasos:
 *
 *   1. writeFileSync(".workbench/<phase>.done.tmp", JSON.stringify({ change, completedAt }))
 *   2. renameSync(".workbench/<phase>.done.tmp", ".workbench/<phase>.done")
 *
 * writeFileSync + renameSync sobre el mismo inode garantiza atomicidad a nivel de SO:
 * hasta el rename, el archivo .done no existe o contiene el marcador de la ejecucion
 * anterior. Esto evita que el orquestador lea un archivo a medio escribir.
 *
 * El closer NO escribe marcador; su senal de completitud es isChangeArchived.
 */

import * as fs from "fs";
import * as path from "path";

/**
 * Sidecar de duracion de fase. Usado por el reader unificado readPhaseSidecar.
 * Para archivos `.done`, `stages` esta ausente y `completedAt` esta presente.
 * Para `.timings.json`, `stages` esta presente y `completedAt` esta ausente.
 */
export interface PhaseSidecar {
  change: string;
  stages?: StageTiming[];
  completedAt?: string;
}

export interface StageTiming {
  stage: number;
  slug: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  iterations?: LoopIteration[];
}

export interface LoopIteration {
  applyMs: number;
  verifyMs: number;
  passed: boolean;
}

/**
 * Errores tipados emitidos por readPhaseMarker.
 * Fail-closed: cualquier condicion de error produce una excepcion tipada,
 * nunca un retorno ambiguo.
 */
export class MarkerAbsent extends Error {
  readonly code = "ABSENT" as const;
  constructor(phase: string) {
    super(`Marcador de fase '${phase}' ausente (ENOENT)`);
    this.name = "MarkerAbsent";
  }
}

export class MarkerCorrupt extends Error {
  readonly code = "CORRUPT" as const;
  constructor(phase: string, reason: string) {
    super(`Marcador de fase '${phase}' corrupto: ${reason}`);
    this.name = "MarkerCorrupt";
  }
}

export class MarkerEmpty extends Error {
  readonly code = "EMPTY" as const;
  constructor(phase: string) {
    super(`Marcador de fase '${phase}' vacio`);
    this.name = "MarkerEmpty";
  }
}

export class MarkerWrongChange extends Error {
  readonly code = "WRONG_CHANGE" as const;
  constructor(
    phase: string,
    expected: string,
    found: string
  ) {
    super(
      `Marcador de fase '${phase}' tiene change '${found}' pero se esperaba '${expected}'`
    );
    this.name = "MarkerWrongChange";
  }
}

export interface PhaseMarker {
  change: string;
  completedAt: string;
}

/**
 * SidecarMode: controla la politica de error del reader unificado.
 * - 'closed': MarkerAbsent, MarkerCorrupt, MarkerEmpty lanzan excepcion (fail-closed).
 * - 'open':   MarkerAbsent, MarkerCorrupt, MarkerEmpty retornan null (fail-open).
 */
type SidecarMode = "closed" | "open";

/**
 * Lee un sidecar de fase (`.done` o `.timings.json`) con politica de error configurable.
 *
 * @param phase       - Nombre de la fase: "explorer" | "planner" | "implementer"
 * @param suffix      - '.done' | '.timings.json'
 * @param mode        - 'closed' (excepcion) | 'open' (retorna null)
 * @param workbenchRoot - Directorio base de workbench (default: openspec/.workbench)
 * @returns PhaseSidecar | null (null solo en modo 'open' ante error)
 * @throws MarkerAbsent   - modo closed, archivo inexistente (ENOENT)
 * @throws MarkerCorrupt  - modo closed, directorio (EISDIR), JSON invalido, o estructura invalida
 * @throws MarkerEmpty    - modo closed, archivo existe pero esta vacio
 * @throws Error          - ENOSPC, EACCES u otro error de E/S propagado tal cual (ambos modos)
 */
export function readPhaseSidecar(
  phase: string,
  suffix: ".done" | ".timings.json",
  mode: SidecarMode,
  workbenchRoot = path.join(process.cwd(), "openspec", ".workbench")
): PhaseSidecar | null {
  const markerPath = path.join(workbenchRoot, `${phase}${suffix}`);

  let content: string;
  try {
    content = fs.readFileSync(markerPath, "utf8");
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      if (mode === "open") return null;
      throw new MarkerAbsent(phase);
    }
    if (code === "EISDIR") {
      if (mode === "open") return null;
      throw new MarkerCorrupt(phase, "es un directorio");
    }
    throw err;
  }

  if (content.length === 0) {
    if (mode === "open") return null;
    throw new MarkerEmpty(phase);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    if (mode === "open") return null;
    throw new MarkerCorrupt(phase, "JSON invalido");
  }

  if (typeof parsed !== "object" || parsed === null) {
    if (mode === "open") return null;
    throw new MarkerCorrupt(phase, "no es un objeto");
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.change !== "string" || obj.change.length === 0) {
    if (mode === "open") return null;
    throw new MarkerCorrupt(phase, "campo 'change' debe ser string no vacio");
  }

  // Schema differs by suffix:
  // - .done:        requiere completedAt, stages debe estar ausente
  // - .timings.json: requiere stages (array), completedAt debe estar ausente
  if (suffix === ".done") {
    if (typeof obj.completedAt !== "string") {
      if (mode === "open") return null;
      throw new MarkerCorrupt(phase, "campo 'completedAt' debe ser string");
    }
    if (obj.stages !== undefined) {
      if (mode === "open") return null;
      throw new MarkerCorrupt(phase, "archivo .done no debe contener campo 'stages'");
    }
    return { change: obj.change as string, completedAt: obj.completedAt as string };
  }

  // .timings.json: requiere stages array
  if (!Array.isArray(obj.stages)) {
    if (mode === "open") return null;
    throw new MarkerCorrupt(phase, "campo 'stages' debe ser array");
  }

  // Validate each stage entry
  for (let i = 0; i < obj.stages.length; i++) {
    const stage = obj.stages[i] as Record<string, unknown>;
    if (typeof stage !== "object" || stage === null) {
      if (mode === "open") return null;
      throw new MarkerCorrupt(phase, `stages[${i}] no es un objeto`);
    }
    if (typeof stage.stage !== "number" || !Number.isInteger(stage.stage) || stage.stage < 1) {
      if (mode === "open") return null;
      throw new MarkerCorrupt(phase, `stages[${i}].stage debe ser entero >= 1`);
    }
    if (typeof stage.slug !== "string" || stage.slug.length === 0) {
      if (mode === "open") return null;
      throw new MarkerCorrupt(phase, `stages[${i}].slug debe ser string no vacio`);
    }
    if (typeof stage.startedAt !== "string") {
      if (mode === "open") return null;
      throw new MarkerCorrupt(phase, `stages[${i}].startedAt debe ser string`);
    }
    if (typeof stage.completedAt !== "string") {
      if (mode === "open") return null;
      throw new MarkerCorrupt(phase, `stages[${i}].completedAt debe ser string`);
    }
    if (typeof stage.durationMs !== "number" || !Number.isFinite(stage.durationMs)) {
      if (mode === "open") return null;
      throw new MarkerCorrupt(phase, `stages[${i}].durationMs debe ser numero finito`);
    }
    if (stage.durationMs < 0) {
      if (mode === "open") return null;
      throw new MarkerCorrupt(phase, `stages[${i}].durationMs no puede ser negativo`);
    }
    if (stage.durationMs > 86400000) {
      if (mode === "open") return null;
      throw new MarkerCorrupt(phase, `stages[${i}].durationMs no puede exceder 24h (86400000ms)`);
    }
    // Validate iterations if present
    if (stage.iterations !== undefined) {
      if (!Array.isArray(stage.iterations)) {
        if (mode === "open") return null;
        throw new MarkerCorrupt(phase, `stages[${i}].iterations debe ser array`);
      }
      for (let j = 0; j < stage.iterations.length; j++) {
        const iter = stage.iterations[j] as Record<string, unknown>;
        if (typeof iter !== "object" || iter === null) {
          if (mode === "open") return null;
          throw new MarkerCorrupt(phase, `stages[${i}].iterations[${j}] no es un objeto`);
        }
        if (typeof iter.applyMs !== "number" || !Number.isFinite(iter.applyMs) || iter.applyMs < 0) {
          if (mode === "open") return null;
          throw new MarkerCorrupt(phase, `stages[${i}].iterations[${j}].applyMs debe ser numero finito no negativo`);
        }
        if (typeof iter.verifyMs !== "number" || !Number.isFinite(iter.verifyMs) || iter.verifyMs < 0) {
          if (mode === "open") return null;
          throw new MarkerCorrupt(phase, `stages[${i}].iterations[${j}].verifyMs debe ser numero finito no negativo`);
        }
        if (typeof iter.passed !== "boolean") {
          if (mode === "open") return null;
          throw new MarkerCorrupt(phase, `stages[${i}].iterations[${j}].passed debe ser booleano`);
        }
      }
    }
  }

  return {
    change: obj.change as string,
    stages: obj.stages as StageTiming[],
  };
}

/**
 * Lee el marcador de completitud de una fase en modo fail-closed.
 * Delegacion pura a readPhaseSidecar para mantener backward compatibility.
 *
 * @param phase - Nombre de la fase: "explorer" | "planner" | "implementer"
 * @param workbenchRoot - Directorio base de workbench (default: openspec/.workbench)
 * @returns El objeto marcador { change, completedAt }
 * @throws MarkerAbsent     - Archivo inexistente (ENOENT)
 * @throws MarkerCorrupt   - Es un directorio (EISDIR), JSON invalido, o estructura invalida
 * @throws MarkerEmpty     - Archivo existe pero esta vacio
 * @throws MarkerWrongChange - El campo change no coincide con el valor esperado (llamador debe verificar)
 * @throws Error           - ENOSPC, EACCES u otro error de E/S propagado tal cual
 */
export function readPhaseMarker(
  phase: string,
  workbenchRoot = path.join(process.cwd(), "openspec", ".workbench")
): PhaseMarker {
  const sidecar = readPhaseSidecar(phase, ".done", "closed", workbenchRoot) as PhaseMarker;
  return { change: sidecar.change, completedAt: sidecar.completedAt };
}

/**
 * Verifica que el marcador de una fase corresponde al change esperado.
 * Utilizada por el orquestador para validar el handoff.
 *
 * @throws MarkerAbsent, MarkerCorrupt, MarkerEmpty - cualquiera de readPhaseMarker
 * @throws MarkerWrongChange - el change del marcador no coincide
 */
export function validatePhaseMarker(
  phase: string,
  expectedChange: string,
  workbenchRoot?: string
): PhaseMarker {
  const marker = readPhaseMarker(phase, workbenchRoot);
  if (marker.change !== expectedChange) {
    throw new MarkerWrongChange(phase, expectedChange, marker.change);
  }
  return marker;
}

/**
 * Escritura atomica del marcador de completitud de fase.
 * Protocolo: writeFileSync(tmp) + renameSync(final) sobre el mismo inode.
 * Garantiza que el orquestador nunca lee un archivo a medio escribir.
 *
 * @param phase  - Nombre de la fase: "explorer" | "planner" | "implementer"
 * @param change - ID del change (ej: "c00087-fix-ci-all-runners")
 * @param workbenchRoot - Directorio base de workbench (default: openspec/.workbench)
 * @throws Error - fase "closer" no debe escribir marcador (su senal es isChangeArchived)
 * @throws Error - ENOSPC, EACCES u otro error de E/S propagado tal cual
 */
export function writePhaseMarker(
  phase: string,
  change: string,
  workbenchRoot = path.join(process.cwd(), "openspec", ".workbench")
): void {
  if (phase === "closer") {
    throw new Error(
      "El subagente closer no escribe marcador de fase — " +
      "su senal de completitud es isChangeArchived en .openspec.yaml"
    );
  }
  const markerPath = path.join(workbenchRoot, `${phase}.done`);
  const tmpPath = markerPath + ".tmp";
  const obj: PhaseMarker = {
    change,
    completedAt: new Date().toISOString(),
  };
  fs.writeFileSync(tmpPath, JSON.stringify(obj), "utf8");
  fs.renameSync(tmpPath, markerPath);
}
