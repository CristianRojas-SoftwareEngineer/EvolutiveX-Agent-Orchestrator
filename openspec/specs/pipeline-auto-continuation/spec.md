# Spec: pipeline-auto-continuation

> Capability canónica — promovida desde `c00081-auto-pipeline-backstop`.

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

### Requirement: El hook Stop invoca el backstop de continuidad AUTO
El harness SHALL registrar una entrada en el array `Stop` de `configs/hooks.json` que
invoque `scripting/openspec/enforce-auto-pipeline.mts` mediante `tsx`. Esta entrada es
ADITIVA: el logger `post-hook-event.ts` SHALL permanecer en el mismo array. El array
`SubagentStop` NO SHALL ser modificado.

#### Scenario: El hook Stop ejecuta enforce-auto-pipeline al finalizar un turno
- **WHEN** el orquestador finaliza su turno (evento `Stop`)
- **THEN** el harness ejecuta `enforce-auto-pipeline.mts` antes de ceder el control al usuario

#### Scenario: SubagentStop no está afectado
- **WHEN** un subagente de fase finaliza su turno (evento `SubagentStop`)
- **THEN** `enforce-auto-pipeline.mts` NO es ejecutado y el control regresa al orquestador normalmente

### Requirement: Función pura decideAutoPipeline evalúa la decisión de bloqueo
El script SHALL exportar una función pura `decideAutoPipeline(input: DecisionInput): Decision`
que evalúa el estado del sentinel y retorna un valor de tipo
`Decision { block: boolean, reason?: string, effect: DecisionEffect, nextSentinel?: AutoPipelineSentinel }`.
Cuando `block` es `false` el hook permite la cesión; cuando `block` es `true` el hook escribe
`{ "decision": "block", "reason": "..." }` en stdout. La función SHALL ser pura (sin efectos
secundarios, sin lecturas de filesystem), determinista y envuelta en la capa de efectos del
script que SÍ tiene acceso a filesystem. El envoltorio SHALL envolver toda la ejecución en un
try/catch y NUNCA relanzar; ante cualquier error SHALL retornar
`Decision { block: false, effect: 'none' }` por defecto (cesión permitida).

#### Scenario: Error interno del hook permite el paso sin lanzar
- **WHEN** ocurre cualquier excepción durante la evaluación
- **THEN** el hook sale con código 0 sin emitir bloqueo por stdout

#### Scenario: Función retorna bloqueo con reason cuando el pipeline está en vuelo
- **WHEN** la función recibe un input válido con pipeline en progreso (rama e)
- **THEN** retorna `Decision { block: true, reason: string, effect: 'persistSentinel', nextSentinel: AutoPipelineSentinel }`
  donde `reason` describe el estado del pipeline (change, fase, etapa actuales) e instruye a continuar

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

### Requirement: Clave compuesta phase#stage como señal de progreso del loop-guard
El sentinel SHALL incluir el campo `lastProgressKey` con formato `"${phase}#${stage}"`.
El subagente de fase activo SHALL escribir `lastProgressKey` ATÓMICAMENTE junto con su
actualización de `stage` (write-to-tmp + rename). El orquestador NO SHALL escribir
`lastProgressKey`. La función SHALL considerar que hubo progreso si cambió `phase` O
`stage` entre dos invocaciones del hook; el `stuckCount` SHALL reiniciarse si avanzó
cualquiera de los dos componentes, y solo SHALL crecer si AMBOS quedaron congelados.

#### Scenario: Progreso vía cambio de phase reinicia stuckCount
- **WHEN** entre dos invocaciones del hook `Stop`, `phase` cambia (aunque `stage`
  permanezca igual)
- **THEN** `stuckCount` se reinicia a 0 y el hook retorna `Decision { block: true }` (rama e)

#### Scenario: Progreso vía cambio de stage reinicia stuckCount
- **WHEN** entre dos invocaciones del hook `Stop`, `stage` cambia (aunque `phase`
  permanezca igual)
- **THEN** `stuckCount` se reinicia a 0 y el hook retorna `Decision { block: true }` (rama e)

#### Scenario: Congelamiento de phase Y stage acumula stuckCount
- **WHEN** ni `phase` ni `stage` cambian entre dos invocaciones consecutivas del hook
- **THEN** `stuckCount` se incrementa en 1

### Requirement: Halt diagnóstico diferenciado por causa
El halt SHALL ser un archivo JSON `openspec/.workbench/auto-pipeline.halt.json` con al
menos los campos `reason`, `releasedAt`, `phase` y `stage`. El campo `reason` SHALL
diferenciar la causa de terminación: el loop-guard escribe `"loop-guard"`; el
orquestador puede escribir cualquier otro valor descriptivo (p. ej.
`"design-decision"`) al ceder voluntariamente el turno. El hook `Stop` SOLO escribe
halt con `reason: "loop-guard"` (rama d); no distingue ni interpreta otros valores.

#### Scenario: Halt del loop-guard incluye reason loop-guard
- **WHEN** la rama (d) supera el umbral de congelamiento
- **THEN** `auto-pipeline.halt.json` contiene `{ "reason": "loop-guard", "releasedAt": "<ISO>", "phase": "<phase>", "stage": <number> }`

#### Scenario: Halt externo con reason arbitrario es respetado por el hook
- **WHEN** el halt fue escrito externamente con `reason: "design-decision"` u otro valor
- **THEN** la rama (b) se activa (halt presente) y el hook no sobreescribe el halt

### Requirement: El sentinel de doble nivel documenta la propiedad de cada campo
El contrato del sentinel (`openspec/.workbench/auto-pipeline.json`) SHALL especificar
el dueño de cada campo:
- `change`, `mode`, `startedAt` → orquestador (escribe al iniciar el pipeline)
- `phase` → orquestador (escribe antes de cada spawn de subagente de fase)
- `stage`, `lastProgressKey` → subagente de fase activo (escritura atómica conjunta)
- `stuckCount` → hook `Stop` vía envoltorio (persiste en rama d/e)

#### Scenario: El subagente escribe stage y lastProgressKey juntos
- **WHEN** el subagente activo avanza a un nuevo stage
- **THEN** escribe atómicamente `{ ..., stage: N, lastProgressKey: "${phase}#${N}" }`
  mediante write-to-tmp + rename al sentinel

#### Scenario: El orquestador no escribe lastProgressKey
- **WHEN** el orquestador actualiza `phase` antes de spawnar un subagente
- **THEN** el sentinel contiene el nuevo `phase` pero `lastProgressKey` permanece con
  el valor que escribió el último subagente (o el valor inicial)
