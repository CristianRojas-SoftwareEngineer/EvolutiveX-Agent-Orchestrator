## Why

El orquestador del pipeline specification-delta descarta silenciosamente la medicion de duracion por etapa que el harness ya recolecta en `startedAt`/`completedAt`. No existe visibilidad operacional sobre quanto tarda cada fase o cada stage individual, lo que impide diagnosticar cuellos de botella y validar que el pipeline cumple sus invariantes de tiempo.

## What Changes

- Cada subagente de fase escribe un sidecar `openspec/.workbench/<phase>.timings.json` con metricas de duracion por etapa (stage ordinal, slug, startedAt, completedAt, durationMs) antes de retornar.
- El orquestador lee el sidecar al cerrar cada fase e inyecta los tiempos en la plantilla D6 (dos lineas: duracion de fase completa + duracion de etapa actual).
- Se crea un reader unificado `readPhaseSidecar(phase, suffix, mode)` que unifica la lectura de `.done` (modo closed, fail-closed) y `.timings.json` (modo open, fail-open) con un unico punto de entrada.
- El closer elimina los sidecars `.timings.json` durante el freeze.
- El reader existente de `.done` del gate de `c00082` se refactoriza para usar `readPhaseSidecar` en modo closed, sin romper el contrato del gate.

## Capabilities

### New Capabilities

- `orchestrator-stage-timings`: Sidecars observacionales `*.timings.json` escritos por cada subagente de fase con metricas de duracion por etapa (stage ordinal, slug, startedAt, completedAt, durationMs). Reader unificado `readPhaseSidecar` que soporta modo `'closed'` para `.done` y modo `'open'` para `.timings.json`. Inyeccion de duraciones en plantilla D6. Cleanup de sidecars en el freeze del closer.

## Impact

- Afecta `scripting/openspec/read-phase-marker.ts` (refactorizacion del reader `.done`).
- Afecta el orquestador (lectura de sidecars e inyeccion en plantilla D6).
- Afecta los 4 subagentes de fase (instrumentacion de escritura de `.timings.json`).
- Afecta el closer (cleanup de sidecars).
- Nueva suite de tests `tests/scripting/openspec/orchestrator-stage-timings.test.ts`.