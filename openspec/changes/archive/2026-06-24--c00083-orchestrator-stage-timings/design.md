## Context

El pipeline specification-delta (10 etapas, 4 fases) carece de visibilidad operacional
sobre cuanto tarda cada fase y cada etapa individual. El harness del Agent tool
recolecta `startedAt`/`completedAt` en cada invocacion, pero el orquestador descarta
esos valores. No existe un mecanismo para persistir, leer ni presentar esas metricas.

El gate de `c00082` ya utiliza marcadores `.done` en `openspec/.workbench/` con un
protocolo de escritura atomica (writeFileSync a `.tmp` + renameSync) que garantiza
consistencia. Ese mismo patron se reutiliza para los sidecars `.timings.json`.

## Goals / Non-Goals

**Goals:**
- Persistir metricas de duracion por fase y por etapa en sidecars `.timings.json`.
- Presentar los tiempos en la plantilla D6 (dos lineas: duracion de fase completa
  + duracion de etapa actual).
- Crear un reader unificado `readPhaseSidecar(phase, suffix, mode)` que cubra tanto
  `.done` (modo closed, fail-closed) como `.timings.json` (modo open, fail-open).
- Refactorizar `readPhaseMarker` de `c00082` para usar el reader unificado, sin
  romper el contrato del gate.
- Mantener 0 regresiones en los tests existentes de `c00082`.

**Non-Goals:**
- No alterar el comportamiento funcional del pipeline (el pipe sigue funcionando
  igual sin los sidecars).
- No agregar nuevas invariantes de tiempo ni SLAs.
- No modificar `configs/hooks.json`.
- No enmendar `openspec/specs/pipeline-auto-continuation/spec.md`.

## Decisions

### D1: Estructura del sidecar `.timings.json`

**Decision:** Cada subagente de fase escribe un archivo
`openspec/.workbench/<phase>.timings.json` con el siguiente schema:

```json
{
  "change": "c00083-orchestrator-stage-timings",
  "stages": [
    {
      "stage": 1,
      "slug": "explore-specification-delta",
      "startedAt": "2026-06-24T10:00:00.000Z",
      "completedAt": "2026-06-24T10:00:45.000Z",
      "durationMs": 45000
    },
    {
      "stage": 2,
      "slug": "create-specification-delta",
      "startedAt": "2026-06-24T10:00:45.000Z",
      "completedAt": "2026-06-24T10:00:50.000Z",
      "durationMs": 5000
    }
  ]
}
```

Los campos `phaseStartedAt`, `phaseCompletedAt` y `phaseDurationMs` **no** son obligatorios en el sidecar. El orquestador los calcula al recibir el handoff a partir de `stages[]` y del `duration_ms` del harness del `Agent(...)` (disponible en `tool_result.usage.duration_ms`).

**Alternativa considerada:** Incluir solo `phaseDurationMs` sin granularidad por etapa.
Rechazada porque no permite identificar cual etapa especificica es el cuello de botella.

**Alternativa considerada:** Escribir directamente al change dir (`openspec/changes/<id>/`).
Rechazada porque mezcla artefactos de planificacion con metricas operacionales y
complica el cleanup del closer.

### D2: Iteraciones del loop apply/verify

**Decision:** El sidecar del implementer incluye un campo `iterations` en cada entrada
de `stages[]` para los stages 7 (apply) y 8 (verify), modelado como array anidado.
Entrada ausente se representa como `iterations: []` (array vacio), no como ausencia
del campo. Schema para apply/verify:

```json
{
  "stage": 7,
  "slug": "apply-specification-delta",
  "startedAt": "2026-06-24T10:02:00.000Z",
  "completedAt": "2026-06-24T10:03:00.000Z",
  "durationMs": 60000,
  "iterations": [
    {
      "applyMs": 60000,
      "verifyMs": 120000,
      "passed": true
    }
  ]
}
```

**Alternativa considerada:** No incluir el campo cuando no hay iteraciones (omitir la
clave). Rechazada porque rompe la homogeneidad del schema y complica el codigo del
reader que espera la clave presente.

### D3: Reader unificado `readPhaseSidecar(phase, suffix, mode)`

**Decision:** Crear una unica funcion exportada desde `read-phase-marker.ts`:

```typescript
type SidecarMode = 'closed' | 'open';

export interface PhaseSidecar {
  change: string;
  stages: StageTiming[];
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

export function readPhaseSidecar(
  phase: string,
  suffix: '.done' | '.timings.json',
  mode: SidecarMode,
  workbenchRoot?: string
): PhaseSidecar | null;
```

Donde `mode` controla la politica de error:
- `'closed'`: MarkerAbsent, MarkerCorrupt, MarkerEmpty lanzan excepcion (mismo
  comportamiento que `readPhaseMarker` actual). Usado por el gate de `c00082`.
- `'open'`: MarkerAbsent, MarkerCorrupt, MarkerEmpty retornan `null` (fail-open).
  Usado para `.timings.json`.

La funcion `readPhaseMarker` se reescribe como delegacion pura al reader unificado:

```typescript
export function readPhaseMarker(
  phase: string,
  workbenchRoot?: string
): PhaseMarker {
  return readPhaseSidecar(phase, '.done', 'closed', workbenchRoot) as PhaseMarker;
}
```

### D4: Campo `iterations` ausente vs array vacio

**Decision:** Cuando el implementer aun no ha ejecutado ninguna iteracion del loop
apply/verify (es decir, en la primera invocacion de apply antes del primer verify),
el sidecar incluye `"iterations": []`. El campo nunca se omite. Esto mantiene la
homogeneidad del schema y evita que el reader tenga que verificar existencia de la
clave.

## Migration Plan

1. **Fase 1 — Refactor del reader unificado.**
   - En `scripting/openspec/read-phase-marker.ts`, agregar `PhaseSidecar`,
     `StageTiming`, `LoopIteration` y `readPhaseSidecar`.
   - Reescribir `readPhaseMarker` como delegacion a `readPhaseSidecar(..., '.done', 'closed')`.
   - Verificar que los tests existentes de `c00082` siguen pasando con la nueva
     implementacion interna.
   - Archivo: `scripting/openspec/read-phase-marker.ts`.

2. **Fase 2 — Instrumentacion de los 4 subagentes.**
   - Cada subagente de fase recibe la logica para escribir su `.timings.json`
     atomicamente (writeFileSync a `.tmp` + renameSync) antes de retornar.
   - Los tiempos de cada stage se computan a partir del `startedAt`/`completedAt`
     del contexto del Agent tool (delivered por el harness en cada invocacion).
   - Archivos: cada subagente en su definicion.

3. **Fase 3 — Integracion en plantilla D6.**
   - El orquestador lee el sidecar al cerrar cada fase usando
     `readPhaseSidecar(phase, '.timings.json', 'open')`.
   - Calcula `phaseStartedAt`, `phaseCompletedAt` y `phaseDurationMs`:
     - `phaseStartedAt = stages[0].startedAt` si existe; si no, usa `startedAt` del harness del `Agent(...)` si esta disponible; si no, `null`.
     - `phaseCompletedAt = stages[stages.length-1].completedAt` si existe; si no, `null`.
     - `phaseDurationMs = phaseCompletedAt - phaseStartedAt` si ambos estan disponibles; si no, usa `duration_ms` del harness del `Agent(...)`.
   - Inyecta en la plantilla D6:
     - Linea de fase completa: `**Fase duracion:** 5m 30s (completada en 330123ms)`
     - Linea de etapa actual: `**Etapa actual:** Stage 4/10 design-specification-delta (45s)`
   - Si el sidecar esta ausente o corrupto, las lineas muestran "—" (fail-open).

4. **Fase 4 — Cleanup en closer.**
   - El closer elimina `openspec/.workbench/*.timings.json` de los 4 phases
     durante el freeze, junto con los marcadores `.done`.

5. **Fase 5 — Tests.**
   - Nueva suite `tests/scripting/openspec/orchestrator-stage-timings.test.ts`
     con los casos listados en la seccion de tests.

6. **Fase 6 — Regresion completa.**
   - `npm test` del proyecto completo. 0 regresiones.

## Risks / Trade-offs

- **R1 — Overhead de escritura.** Cada subagente escribe un archivo adicional al
  finalizar. Impacto estimado <1ms (ESM writeFileSync + renameSync sobre archivo
  pequeno). No se espera degradacion medible.

- **R2 — Desincronizacion entre sidecar y realidad.** Si un subagente retorna sin
  escribir el sidecar (crash, senal before returning), la plantilla D6 muestra "—"
  para esa fase. El pipeline NO se bloquea (fail-open). Este es el comportamiento
  deseado por diseño.

- **R3 — Schema drift entre versiones.** Si un subagente escribe con un schema
  diferente al esperado por el reader, el parsing en modo open retorna `null` y la
  plantilla muestra "—". Solucion: mantener backward compatibility en el reader
  (ignorar campos desconocidos) y versionar el schema si se necesitan cambios
  rupture.

- **R4 — Contenido sensible en sidecar.** Los sidecars `.timings.json` contienen
  rutas de archivo y nombres de delta. No contienen secretos ni tokens. Son
  apropiados para persistir en el workbench gitignored.

## Tests

Nueva suite `tests/scripting/openspec/orchestrator-stage-timings.test.ts`:

| #  | Caso                                              | Esperado                              |
|----|---------------------------------------------------|---------------------------------------|
| T1 | Sidecar `.timings.json` valido y completo         | Parseo correcto, todos los campos     |
| T2 | Sidecar `.timings.json` ausente                   | `readPhaseSidecar` retorna `null` en modo open |
| T3 | Sidecar `.timings.json` corrupto (JSON invalido)  | `null` en modo open; excepcion en modo closed |
| T4 | Sidecar `.timings.json` vacio                     | `null` en modo open; excepcion en modo closed |
| T5 | Sidecar con `durationMs` negativo                 | `null` en modo open; excepcion en modo closed |
| T6 | Sidecar con `durationMs` > 24h (86400000ms)       | `null` en modo open; excepcion en modo closed |
| T7 | Sidecar con valores NaN en `durationMs`           | `null` en modo open; excepcion en modo closed |
| T8 | Iteraciones del loop apply/verify (1 iteracion)   | `iterations[0]` con `applyMs`, `verifyMs`, `passed` |
| T9 | Iteraciones vacias `[]`                           | parseo correcto, array vacio          |
| T10| Iteraciones con valores absurdos (NaN, negativos) | `null` en modo open                   |
| T11| Reader unificado modo closed sobre `.done`        | Comportamiento identico a `readPhaseMarker` actual |
| T12| Refactor: `readPhaseMarker` delega a unificado    | Tests de `c00082` pasan sin cambios   |