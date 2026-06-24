## Why

El orquestador multiagente `orchestrate-specification-delta` (modo AUTO) carece de un
mecanismo de red de seguridad determinista: el hook `Stop` del harness no toma ninguna
decisión; si el orquestador cede el turno antes de completar las cuatro fases, el
pipeline AUTO se interrumpe sin que nadie lo bloquee. La continuidad depende únicamente
de la disciplina del modelo, no del harness.

Este delta porta el backstop funcional del repo hermano (Workbench, commit 32c22d2) y lo
adapta al sentinel de doble nivel (`phase` + `stage` + `lastProgressKey`) que introdujo
el refactor multiagente c00080.

## What Changes

- **NUEVO** `scripting/openspec/enforce-auto-pipeline.mts` — script del hook `Stop`:
  función pura `decideAutoPipeline(input): Decision` con cinco ramas de decisión
  (sin sentinel, halt presente, change archivado, loop-guard, pipeline en vuelo);
  el envoltorio aplica efectos (borrar sentinel, escribir halt, persistir), la función
  pura nunca lanza ni tiene efectos secundarios.
- **NUEVO** `tests/scripting/openspec/enforce-auto-pipeline.test.ts` — suite vitest que
  cubre los ~9 casos de la matriz de Workbench más los casos nuevos del doble nivel
  (progreso vía `phase` vs. vía `stage`, verificación de no interferencia con
  `SubagentStop`, halt diagnóstico con `reason`).
- **EDIT** `configs/hooks.json` — entrada aditiva en el array `Stop` invocando el nuevo
  script (mismo patrón `npx --prefix tsx` que las demás entradas). El array
  `SubagentStop` no se toca.
- **EDIT** `.gitignore` — se añade `openspec/.workbench/` (estado efímero no
  versionado; hallazgo de esta exploración).
- **EDIT** `.claude/agents/orchestrate-specification-delta.md` — actualización de
  `<sentinel_schema>` (campo `lastProgressKey`, su ownership) y de `<backstop>`
  (estado "implementado", referencia al nuevo script).
- **EDIT** `.claude/agents/*-specification-delta.md` (subagentes de fase) — sección
  `<sentinel_writes>`: documentar escritura atómica de `lastProgressKey` junto con
  `stage`.
- **NUEVO** `openspec/specs/pipeline-auto-continuation/spec.md` — spec canónica de la
  capability (requisitos del backstop, la matriz de decisión, el contrato del sentinel
  de doble nivel).

## Capabilities

### New Capabilities

- `pipeline-auto-continuation`: Mecanismo de enforcement por harness (hook `Stop`)
  que bloquea la cesión prematura del turno durante un pipeline AUTO, con loop-guard
  basado en clave compuesta `phase#stage` y halt diagnóstico diferenciado por causa.

### Modified Capabilities

_(ninguna)_

### Non-canonical change

_(ninguna)_

## Impact

- **`configs/hooks.json`**: el array `Stop` pasa de 1 a 2 entradas; latencia del hook
  aumenta en el tiempo de arranque de `tsx` (cold-start, estimado < 500 ms).
- **`.gitignore`**: `openspec/.workbench/` deja de versionarse; los sentinels AUTO
  son estado de sesión, no histórico.
- **`.claude/agents/`**: documentación de contrato del sentinel actualizada; sin cambio
  en comportamiento de los agentes hasta que el implementer aplique los cambios.
- **No hay cambio en la API externa**: el hook es un detalle interno del harness.
- **Dependencia de runtime**: `tsx` (ya presente como devDependency).
