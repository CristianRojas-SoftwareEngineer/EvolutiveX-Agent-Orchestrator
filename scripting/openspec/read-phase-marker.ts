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
 * Lee el marcador de completitud de una fase en modo fail-closed.
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
  const markerPath = path.join(workbenchRoot, `${phase}.done`);

  let content: string;
  try {
    // El flag 'utf8' hace que readFileSync lance ENOENT si no existe
    // y EISDIR si es un directorio
    content = fs.readFileSync(markerPath, "utf8");
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new MarkerAbsent(phase);
    }
    if (code === "EISDIR") {
      throw new MarkerCorrupt(phase, "es un directorio");
    }
    // Propagar ENOSPC, EACCES y cualquier otro error de E/S tal cual
    throw err;
  }

  if (content.length === 0) {
    throw new MarkerEmpty(phase);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new MarkerCorrupt(phase, "JSON invalido");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("change" in parsed) ||
    !("completedAt" in parsed)
  ) {
    throw new MarkerCorrupt(
      phase,
      "falta campo 'change' o 'completedAt'"
    );
  }

  const marker = parsed as { change: unknown; completedAt: unknown };

  if (
    typeof marker.change !== "string" ||
    marker.change.length === 0
  ) {
    throw new MarkerCorrupt(
      phase,
      "campo 'change' debe ser string no vacio"
    );
  }

  if (typeof marker.completedAt !== "string") {
    throw new MarkerCorrupt(
      phase,
      "campo 'completedAt' debe ser string"
    );
  }

  return { change: marker.change, completedAt: marker.completedAt };
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
