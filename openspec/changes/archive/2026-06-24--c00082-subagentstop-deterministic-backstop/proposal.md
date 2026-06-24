## Why

El pipeline AUTO cuenta con un backstop determinista en el hook `Stop` (canónico en
`pipeline-auto-continuation`) que detecta cuando el **orquestador** está congelado
entre fases. Sin embargo, no existe un gate equivalente en el lado del orquestador al
recibir el handoff de un subagente de fase: el orquestador interpreta el JSON de
handoff en prosa, sin validación determinista. Si un subagente planner, implementer o
closer devuelve un handoff malformado —artefactos ausentes, `apply_ready: false`,
schema incorrecto— el orquestador puede avanzar a la siguiente fase con estado
incompleto. Esta laguna es el caso de falla que el cambio cierra.

## What Changes

- El orquestador gana una función de validación de handoff determinista que se ejecuta
  después de cada spawn de subagente de fase y **antes** de avanzar a la siguiente
  fase; el rechazo es hard-stop.
- La función evalúa predicados on-disk — sin tocar `SubagentStop` (prohibición
  canónica vigente) y sin enmendar `pipeline-auto-continuation/spec.md` — siguiendo
  uno de dos enfoques cuya elección queda diferida al diseño:
  - **Enfoque A**: marcadores atómicos de completitud por fase (archivos sentinel
    livianos escritos por el subagente al finalizar) que el orquestador lee en la
    frontera de handoff.
  - **Enfoque B**: predicados on-disk ya existentes — salida de
    `verify-stage-completion` y estado `isChangeArchived` — consumidos por el
    orquestador en la frontera de handoff sin archivos nuevos.
- El JSON de handoff queda tipado y validado contra schema (campos obligatorios:
  `change`, `apply_ready: true`, `artifacts.*: "done"`); cualquier desviación
  estructura una decisión de rechazo, no un avance silencioso.

## Capabilities

### New Capabilities

- `orchestrator-phase-handoff-gate`: Gate determinista que el orquestador ejecuta en
  cada frontera inter-fase para validar el handoff de un subagente antes de avanzar.
  Cubre la función de validación, el schema del handoff, el mecanismo de detección de
  completitud on-disk (A o B, según diseño), y el comportamiento ante rechazo.

### Modified Capabilities

### Non-canonical change

## Impact

- `.claude/skills/orchestrate-specification-delta/SKILL.md` — el orquestador incorpora
  la lógica de validación de handoff (o delega a un helper).
- Posiblemente: archivos sentinel de fase en `openspec/.workbench/` (solo Enfoque A).
- `openspec/specs/orchestrator-phase-handoff-gate/spec.md` — nueva spec canónica.
- No se toca `configs/hooks.json` ni `openspec/specs/pipeline-auto-continuation/spec.md`.
