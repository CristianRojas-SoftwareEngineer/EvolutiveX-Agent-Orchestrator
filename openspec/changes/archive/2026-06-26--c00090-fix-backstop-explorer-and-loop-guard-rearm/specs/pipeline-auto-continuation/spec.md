## ADDED Requirements

### Requirement: readSentinel acepta sentinel con change null en fase explorer
El envoltorio SHALL parsear y aceptar el sentinel como válido cuando `change` es `null`
(o ausente) siempre que `mode === 'auto'` y `phase` y `stage` sean valores válidos.
El campo `change` SHALL ser obligatorio únicamente a partir de la fase 2 en adelante
(cuando el id ya fue minteado). Rechazar el sentinel por `change: null` durante la
fase explorer desactiva el backstop en esa fase, que es un agujero de seguridad.

#### Scenario: Sentinel con change null en fase explorer es aceptado
- **WHEN** el sentinel contiene `{ mode: "auto", phase: "explorer", stage: 1, change: null }`
- **THEN** `readSentinel` retorna el sentinel como válido y el backstop opera normalmente

#### Scenario: Sentinel con change null en fase planner o posterior es rechazado
- **WHEN** el sentinel contiene `{ mode: "auto", phase: "planner", stage: 2, change: null }`
- **THEN** `readSentinel` retorna null (sentinel inválido) y el backstop permite el paso sin bloquear

## MODIFIED Requirements

### Requirement: Matriz de decisión de cinco ramas en orden estricto
La función `decideAutoPipeline` SHALL evaluar las cinco ramas en el siguiente orden
sin cortocircuito fuera de secuencia:

- **(a)** Sin sentinel AUTO presente → `Decision { block: false, effect: 'none' }`
- **(b)** Halt presente (`openspec/.workbench/auto-pipeline.halt.json`) → `Decision { block: false, effect: 'none' }`
- **(c)** Change ya bajo `openspec/changes/archive/` (incluye prefijo de fecha
  `YYYY-MM-DD--<change>`) → `Decision { block: false, effect: 'deleteSentinel' }` + el envoltorio borra el sentinel
- **(d)** Loop-guard: `stopHookActive && lastProgressKey === "${phase}#${stage}"`
  → incrementa `stuckCount`; si supera umbral (3 intentos) → `Decision { block: false, effect: 'writeHalt' }` + el envoltorio
  escribe halt diagnóstico con `{ reason: "loop-guard", releasedAt, phase, stage }` **y borra el sentinel**,
  de modo que el siguiente turno caiga en la rama (a) y el backstop se rearme cuando el orquestador reescriba el sentinel.
- **(e)** Cualquier otro caso → `Decision { block: true, effect: 'persistSentinel', nextSentinel: ... }`; el envoltorio
  persiste sentinel con `stuckCount` y `lastProgressKey` actualizados

#### Scenario: Sin sentinel el hook permite el paso
- **WHEN** `openspec/.workbench/auto-pipeline.json` no existe
- **THEN** la rama (a) se activa y el hook retorna `Decision { block: false, effect: 'none' }`

#### Scenario: Halt presente permite el paso
- **WHEN** existe `openspec/.workbench/auto-pipeline.halt.json`
- **THEN** la rama (b) se activa y el hook retorna `Decision { block: false, effect: 'none' }`

#### Scenario: Change archivado permite el paso y borra el sentinel
- **WHEN** el change del sentinel aparece bajo `openspec/changes/archive/` (con o sin
  prefijo de fecha)
- **THEN** la rama (c) activa `Decision { block: false, effect: 'deleteSentinel' }` y el envoltorio elimina el archivo sentinel

#### Scenario: Loop-guard bloquea y lleva cuenta de intentos congelados
- **WHEN** `lastProgressKey` no cambia entre dos invocaciones consecutivas del hook
  `Stop` y `stopHookActive` es true
- **THEN** la rama (d) incrementa `stuckCount` en el sentinel persistido

#### Scenario: Loop-guard libera tras superar el umbral y borra el sentinel
- **WHEN** `stuckCount` supera 3 y `lastProgressKey` sigue congelado
- **THEN** la rama (d) retorna `Decision { block: false, effect: 'writeHalt' }`, el envoltorio escribe halt con
  `reason: "loop-guard"` **y borra el sentinel** (`auto-pipeline.json`), dejando solo `auto-pipeline.halt.json`

#### Scenario: Tras writeHalt el sentinel queda ausente y el siguiente turno permite sin halt permanente
- **WHEN** la rama (d) disparó writeHalt en el turno anterior (sentinel borrado, halt presente)
- **THEN** la siguiente invocación del hook: si el halt aún existe activa rama (b); si el halt fue borrado
  por el orquestador y éste reescribió el sentinel, activa rama (e) normalmente — el backstop se rearma

#### Scenario: Pipeline en vuelo bloquea la cesión del turno
- **WHEN** el sentinel existe, no hay halt, el change no está archivado y hay progreso
  real (lastProgressKey avanzó)
- **THEN** la rama (e) retorna `Decision { block: true, ... }` y el hook escribe
  `{ "decision": "block", "reason": "..." }` en stdout nombrando el estado actual del pipeline
