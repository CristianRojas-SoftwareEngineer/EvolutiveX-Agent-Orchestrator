## 1. Core Infrastructure

- [x] 1.1 Crear script `scripting/openspec/read-phase-marker.ts` con lectura fail-closed del marcador: lanzar en ENOENT, EISDIR, archivo vacio, JSON corrupto
- [x] 1.2 Documentar el protocolo de escritura atomica (writeFileSync + renameSync) en el mismo archivo como comentarios

## 2. Subagent Instrumentation

- [x] 2.1 Instrumentar el subagente explorer para escribir `openspec/.workbench/explorer.done` justo antes de retornar el handoff JSON
- [x] 2.2 Instrumentar el subagente planner para escribir `openspec/.workbench/planner.done` justo antes de retornar el handoff JSON
- [x] 2.3 Instrumentar el subagente implementer para escribir `openspec/.workbench/implementer.done` justo antes de retornar el handoff JSON
- [x] 2.4 Verificar que el closer NO escribe marcador (su senal es isChangeArchived)

## 3. Testing

- [x] 3.1 Crear suite `tests/scripting/openspec/orchestrator-phase-handoff-gate.test.ts`: marcador valido permite avance, marcador ausente rechaza, marcador corrupto rechaza, marcador de fase equivocada rechaza
- [x] 3.2 Testear comportamiento con ENOSPC y EACCES en la escritura del marcador
- [x] 3.3 Verificar que el hook Stop fail-open no es afectado por el nuevo gate fail-closed

## 4. Orchestrator Integration

- [x] 4.1 Integrar la validacion de marcador en el orquestador: leer `openspec/.workbench/<phase>.done` antes de invocar siguiente fase
- [x] 4.2 Emitir diagnostico legible en español cuando el marcador falla: nombrar fase y causa (ABSENT/CORRUPT/WRONG_CHANGE)
- [x] 4.3 Integrar la limpieza de marcadores en el freeze del closer (eliminar explorer.done, planner.done, implementer.done junto con sentinel AUTO)
- [x] 4.4 Documentar la politica de huérfanos: marcadores de runs anteriores no afectan pipelines nuevos
