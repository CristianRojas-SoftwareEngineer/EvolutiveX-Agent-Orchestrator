import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  readPhaseSidecar,
  readPhaseMarker,
  MarkerCorrupt,
  MarkerEmpty,
  MarkerAbsent,
} from "../../../scripting/openspec/read-phase-marker.js";

const WORKBENCH = "tests/scripting/openspec/_test_workbench_timings";

function timingsPath(phase: string) {
  return path.join(WORKBENCH, `${phase}.timings.json`);
}

function donePath(phase: string) {
  return path.join(WORKBENCH, `${phase}.done`);
}

function cleanWorkbench() {
  if (fs.existsSync(WORKBENCH)) {
    fs.rmSync(WORKBENCH, { recursive: true, force: true });
  }
  fs.mkdirSync(WORKBENCH, { recursive: true });
}

beforeEach(() => {
  cleanWorkbench();
});

afterEach(() => {
  cleanWorkbench();
});

// ---------------------------------------------------------------------------
// Helper: valid timings sidecar factory
// ---------------------------------------------------------------------------
function validTimings(overrides: Record<string, unknown> = {}) {
  return {
    change: "c00083-test",
    stages: [
      {
        stage: 1,
        slug: "explore-specification-delta",
        startedAt: "2026-06-24T10:00:00.000Z",
        completedAt: "2026-06-24T10:00:45.000Z",
        durationMs: 45000,
      },
      {
        stage: 7,
        slug: "apply-specification-delta",
        startedAt: "2026-06-24T10:00:45.000Z",
        completedAt: "2026-06-24T10:01:00.000Z",
        durationMs: 15000,
        iterations: [
          { applyMs: 15000, verifyMs: 30000, passed: true },
        ],
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// T1: sidecar .timings.json valido y completo
// ---------------------------------------------------------------------------
describe("T1: sidecar .timings.json valido y completo", () => {
  it("parseo correcto, todos los campos", () => {
    fs.writeFileSync(timingsPath("explorer"), JSON.stringify(validTimings()));

    const result = readPhaseSidecar("explorer", ".timings.json", "open", WORKBENCH);

    expect(result).not.toBeNull();
    expect(result!.change).toBe("c00083-test");
    expect(result!.stages).toHaveLength(2);
    expect(result!.stages![0].stage).toBe(1);
    expect(result!.stages![0].slug).toBe("explore-specification-delta");
    expect(result!.stages![0].durationMs).toBe(45000);
    expect(result!.stages![1].iterations).toHaveLength(1);
    expect(result!.stages![1].iterations![0].applyMs).toBe(15000);
    expect(result!.stages![1].iterations![0].verifyMs).toBe(30000);
    expect(result!.stages![1].iterations![0].passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T2: sidecar .timings.json ausente
// ---------------------------------------------------------------------------
describe("T2: sidecar .timings.json ausente", () => {
  it("readPhaseSidecar retorna null en modo open", () => {
    const result = readPhaseSidecar("explorer", ".timings.json", "open", WORKBENCH);
    expect(result).toBeNull();
  });

  it("readPhaseSidecar lanza MarkerAbsent en modo closed", () => {
    expect(() =>
      readPhaseSidecar("explorer", ".timings.json", "closed", WORKBENCH)
    ).toThrow(MarkerAbsent);
  });
});

// ---------------------------------------------------------------------------
// T3: sidecar .timings.json corrupto (JSON invalido)
// ---------------------------------------------------------------------------
describe("T3: sidecar .timings.json corrupto (JSON invalido)", () => {
  it("null en modo open", () => {
    fs.writeFileSync(timingsPath("explorer"), "{ invalid json");

    const result = readPhaseSidecar("explorer", ".timings.json", "open", WORKBENCH);
    expect(result).toBeNull();
  });

  it("excepcion en modo closed", () => {
    fs.writeFileSync(timingsPath("explorer"), "{ invalid json");

    expect(() =>
      readPhaseSidecar("explorer", ".timings.json", "closed", WORKBENCH)
    ).toThrow(MarkerCorrupt);
  });
});

// ---------------------------------------------------------------------------
// T4: sidecar .timings.json vacio
// ---------------------------------------------------------------------------
describe("T4: sidecar .timings.json vacio", () => {
  it("null en modo open", () => {
    fs.writeFileSync(timingsPath("explorer"), "");

    const result = readPhaseSidecar("explorer", ".timings.json", "open", WORKBENCH);
    expect(result).toBeNull();
  });

  it("excepcion en modo closed", () => {
    fs.writeFileSync(timingsPath("explorer"), "");

    expect(() =>
      readPhaseSidecar("explorer", ".timings.json", "closed", WORKBENCH)
    ).toThrow(MarkerEmpty);
  });
});

// ---------------------------------------------------------------------------
// T5: sidecar con NaN en durationMs
// ---------------------------------------------------------------------------
describe("T5: sidecar con NaN en durationMs", () => {
  it("null en modo open", () => {
    const data = validTimings({
      stages: [
        {
          stage: 1,
          slug: "explore-specification-delta",
          startedAt: "2026-06-24T10:00:00.000Z",
          completedAt: "2026-06-24T10:00:45.000Z",
          durationMs: NaN,
        },
      ],
    });
    fs.writeFileSync(timingsPath("explorer"), JSON.stringify(data));

    const result = readPhaseSidecar("explorer", ".timings.json", "open", WORKBENCH);
    expect(result).toBeNull();
  });

  it("excepcion en modo closed", () => {
    const data = validTimings({
      stages: [
        {
          stage: 1,
          slug: "explore-specification-delta",
          startedAt: "2026-06-24T10:00:00.000Z",
          completedAt: "2026-06-24T10:00:45.000Z",
          durationMs: NaN,
        },
      ],
    });
    fs.writeFileSync(timingsPath("explorer"), JSON.stringify(data));

    expect(() =>
      readPhaseSidecar("explorer", ".timings.json", "closed", WORKBENCH)
    ).toThrow(MarkerCorrupt);
  });
});

// ---------------------------------------------------------------------------
// T6: sidecar con duracion negativa
// ---------------------------------------------------------------------------
describe("T6: sidecar con durationMs negativo", () => {
  it("null en modo open", () => {
    const data = validTimings({
      stages: [
        {
          stage: 1,
          slug: "explore-specification-delta",
          startedAt: "2026-06-24T10:00:45.000Z",
          completedAt: "2026-06-24T10:00:00.000Z",
          durationMs: -1000,
        },
      ],
    });
    fs.writeFileSync(timingsPath("explorer"), JSON.stringify(data));

    const result = readPhaseSidecar("explorer", ".timings.json", "open", WORKBENCH);
    expect(result).toBeNull();
  });

  it("excepcion en modo closed", () => {
    const data = validTimings({
      stages: [
        {
          stage: 1,
          slug: "explore-specification-delta",
          startedAt: "2026-06-24T10:00:45.000Z",
          completedAt: "2026-06-24T10:00:00.000Z",
          durationMs: -1000,
        },
      ],
    });
    fs.writeFileSync(timingsPath("explorer"), JSON.stringify(data));

    expect(() =>
      readPhaseSidecar("explorer", ".timings.json", "closed", WORKBENCH)
    ).toThrow(MarkerCorrupt);
  });
});

// ---------------------------------------------------------------------------
// T7: sidecar con durationMs > 24h (86400000ms)
// ---------------------------------------------------------------------------
describe("T7: sidecar con durationMs > 24h", () => {
  it("null en modo open", () => {
    const data = validTimings({
      stages: [
        {
          stage: 1,
          slug: "explore-specification-delta",
          startedAt: "2026-06-24T10:00:00.000Z",
          completedAt: "2026-06-24T10:00:00.000Z",
          durationMs: 86400001,
        },
      ],
    });
    fs.writeFileSync(timingsPath("explorer"), JSON.stringify(data));

    const result = readPhaseSidecar("explorer", ".timings.json", "open", WORKBENCH);
    expect(result).toBeNull();
  });

  it("excepcion en modo closed", () => {
    const data = validTimings({
      stages: [
        {
          stage: 1,
          slug: "explore-specification-delta",
          startedAt: "2026-06-24T10:00:00.000Z",
          completedAt: "2026-06-24T10:00:00.000Z",
          durationMs: 86400001,
        },
      ],
    });
    fs.writeFileSync(timingsPath("explorer"), JSON.stringify(data));

    expect(() =>
      readPhaseSidecar("explorer", ".timings.json", "closed", WORKBENCH)
    ).toThrow(MarkerCorrupt);
  });
});

// ---------------------------------------------------------------------------
// T8: iterations validas (1 iteracion)
// ---------------------------------------------------------------------------
describe("T8: iterations validas (1 iteracion)", () => {
  it("iterations[0] con applyMs, verifyMs, passed", () => {
    const data = validTimings({
      stages: [
        {
          stage: 7,
          slug: "apply-specification-delta",
          startedAt: "2026-06-24T10:00:00.000Z",
          completedAt: "2026-06-24T10:01:00.000Z",
          durationMs: 60000,
          iterations: [
            { applyMs: 60000, verifyMs: 120000, passed: true },
          ],
        },
      ],
    });
    fs.writeFileSync(timingsPath("implementer"), JSON.stringify(data));

    const result = readPhaseSidecar("implementer", ".timings.json", "open", WORKBENCH);

    expect(result).not.toBeNull();
    expect(result!.stages![0].iterations).toHaveLength(1);
    expect(result!.stages![0].iterations![0]).toEqual({
      applyMs: 60000,
      verifyMs: 120000,
      passed: true,
    });
  });
});

// ---------------------------------------------------------------------------
// T9: iterations vacias []
// ---------------------------------------------------------------------------
describe("T9: iterations vacias []", () => {
  it("parseo correcto, array vacio", () => {
    const data = validTimings({
      stages: [
        {
          stage: 7,
          slug: "apply-specification-delta",
          startedAt: "2026-06-24T10:00:00.000Z",
          completedAt: "2026-06-24T10:01:00.000Z",
          durationMs: 60000,
          iterations: [],
        },
      ],
    });
    fs.writeFileSync(timingsPath("implementer"), JSON.stringify(data));

    const result = readPhaseSidecar("implementer", ".timings.json", "open", WORKBENCH);

    expect(result).not.toBeNull();
    expect(result!.stages![0].iterations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T10: iterations con valores absurdos (NaN, negativos)
// ---------------------------------------------------------------------------
describe("T10: iterations con valores absurdos", () => {
  it("null en modo open cuando applyMs es NaN", () => {
    const data = validTimings({
      stages: [
        {
          stage: 7,
          slug: "apply-specification-delta",
          startedAt: "2026-06-24T10:00:00.000Z",
          completedAt: "2026-06-24T10:01:00.000Z",
          durationMs: 60000,
          iterations: [{ applyMs: NaN, verifyMs: 30000, passed: true }],
        },
      ],
    });
    fs.writeFileSync(timingsPath("implementer"), JSON.stringify(data));

    const result = readPhaseSidecar("implementer", ".timings.json", "open", WORKBENCH);
    expect(result).toBeNull();
  });

  it("null en modo open cuando verifyMs es negativo", () => {
    const data = validTimings({
      stages: [
        {
          stage: 7,
          slug: "apply-specification-delta",
          startedAt: "2026-06-24T10:00:00.000Z",
          completedAt: "2026-06-24T10:01:00.000Z",
          durationMs: 60000,
          iterations: [{ applyMs: 30000, verifyMs: -5000, passed: true }],
        },
      ],
    });
    fs.writeFileSync(timingsPath("implementer"), JSON.stringify(data));

    const result = readPhaseSidecar("implementer", ".timings.json", "open", WORKBENCH);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T11: reader modo closed sobre .done (comportamiento identico a readPhaseMarker)
// ---------------------------------------------------------------------------
describe("T11: reader unificado modo closed sobre .done", () => {
  it("lanza MarkerCorrupt cuando .done no tiene completedAt", () => {
    fs.writeFileSync(donePath("explorer"), JSON.stringify({ change: "c00083-test" }));

    expect(() =>
      readPhaseSidecar("explorer", ".done", "closed", WORKBENCH)
    ).toThrow(MarkerCorrupt);
  });

  it("lanza MarkerCorrupt cuando .done tiene campo stages (no permitido)", () => {
    fs.writeFileSync(donePath("explorer"), JSON.stringify({
      change: "c00083-test",
      completedAt: "2026-06-24T10:00:00.000Z",
      stages: [{ stage: 1 }],
    }));

    expect(() =>
      readPhaseSidecar("explorer", ".done", "closed", WORKBENCH)
    ).toThrow(MarkerCorrupt);
  });

  it("retorna null en modo open cuando .done tiene campo stages", () => {
    fs.writeFileSync(donePath("explorer"), JSON.stringify({
      change: "c00083-test",
      completedAt: "2026-06-24T10:00:00.000Z",
      stages: [{ stage: 1 }],
    }));

    const result = readPhaseSidecar("explorer", ".done", "open", WORKBENCH);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T12: refactor preserva contrato c00082 — readPhaseMarker sigue funcionando igual
// ---------------------------------------------------------------------------
describe("T12: refactor preserva contrato c00082", () => {
  it("readPhaseMarker devuelve el objeto {change, completedAt} cuando el archivo .done es valido", () => {
    const marker = { change: "c00082-refactor", completedAt: "2026-06-24T10:00:00.000Z" };
    fs.writeFileSync(donePath("explorer"), JSON.stringify(marker));

    const result = readPhaseMarker("explorer", WORKBENCH);

    expect(result).toEqual(marker);
  });

  it("readPhaseMarker lanza MarkerAbsent cuando el archivo no existe", () => {
    expect(() => readPhaseMarker("explorer", WORKBENCH)).toThrow(MarkerAbsent);
  });

  it("readPhaseMarker lanza MarkerEmpty cuando el archivo esta vacio", () => {
    fs.writeFileSync(donePath("explorer"), "");

    expect(() => readPhaseMarker("explorer", WORKBENCH)).toThrow(MarkerEmpty);
  });

  it("readPhaseMarker lanza MarkerCorrupt cuando JSON es invalido", () => {
    fs.writeFileSync(donePath("explorer"), "{ invalid");

    expect(() => readPhaseMarker("explorer", WORKBENCH)).toThrow(MarkerCorrupt);
  });

  it("readPhaseMarker lanza MarkerCorrupt cuando falta completedAt", () => {
    fs.writeFileSync(donePath("explorer"), JSON.stringify({ change: "c00082-test" }));

    expect(() => readPhaseMarker("explorer", WORKBENCH)).toThrow(MarkerCorrupt);
  });

  it("readPhaseMarker lanza MarkerCorrupt cuando completedAt no es string", () => {
    fs.writeFileSync(donePath("explorer"), JSON.stringify({ change: "c00082-test", completedAt: 123 }));

    expect(() => readPhaseMarker("explorer", WORKBENCH)).toThrow(MarkerCorrupt);
  });
});
