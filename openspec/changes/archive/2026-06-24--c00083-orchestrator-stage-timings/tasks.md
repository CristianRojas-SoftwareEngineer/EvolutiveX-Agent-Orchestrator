## 1. Refactor del reader unificado

- [x] 1.1 Agregar tipos `PhaseSidecar`, `StageTiming`, `LoopIteration` en `scripting/openspec/read-phase-marker.ts`
- [x] 1.2 Implementar `readPhaseSidecar(phase, suffix, mode, workbenchRoot?)` con modo `'closed'` (excepcion) y `'open'` (retorna null)
- [x] 1.3 Reescribir `readPhaseMarker` como delegacion pura a `readPhaseSidecar(phase, '.done', 'closed')`
- [x] 1.4 Verificar que `npm test` de `c00082` pasa sin cambios en los tests existentes

## 2. Instrumentacion de subagentes de fase

- [x] 2.1 Instrumentar `explorer-specification-delta` para escribir `openspec/.workbench/explorer.timings.json` atomicamente antes de retornar
- [x] 2.2 Instrumentar `planner-specification-delta` para escribir `openspec/.workbench/planner.timings.json` atomicamente antes de retornar
- [x] 2.3 Instrumentar `implementer-specification-delta` para escribir `openspec/.workbench/implementer.timings.json` atomicamente antes de retornar (con `iterations[]` para apply/verify)
- [x] 2.4 Instrumentar `closer-specification-delta` para escribir `openspec/.workbench/closer.timings.json` atomicamente antes de retornar

## 3. Integracion en plantilla D6

- [x] 3.1 Agregar lectura fail-open de `*.timings.json` en el orquestador (entre cada fase, tras recibir el handoff)
- [x] 3.2 Calcular `phaseStartedAt`/`phaseCompletedAt`/`phaseDurationMs` desde `stages[]` o `duration_ms` del harness del `Agent(...)`
- [x] 3.3 Inyectar lineas de duracion en la plantilla D6: fase completa + etapa actual (mostrar "—" si sidecar ausente o corrupto)

## 4. Cleanup en closer

- [x] 4.1 Agregar eliminacion de `openspec/.workbench/*.timings.json` en el freeze del closer (junto con `.done` y sentinel AUTO)

## 5. Suite de tests

- [x] 5.1 Crear `tests/scripting/openspec/orchestrator-stage-timings.test.ts` con los 12 casos de test del design.md (T1-T12)
- [x] 5.2 Ejecutar la suite completa del proyecto con `npm test` para confirmar 0 regresiones