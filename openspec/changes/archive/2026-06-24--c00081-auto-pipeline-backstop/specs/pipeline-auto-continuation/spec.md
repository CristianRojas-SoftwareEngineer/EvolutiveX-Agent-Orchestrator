## ADDED Requirements

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
El script SHALL exportar una función pura `decideAutoPipeline(input): Decision` que
evalúa el estado del sentinel y retorna `{ action: "allow" }` o
`{ action: "block", reason: string }`. La función SHALL ser pura (sin efectos
secundarios, sin lecturas de filesystem), determinista y envuelta en la capa de
efectos del script que SÍ tiene acceso a filesystem. El envoltorio SHALL envolver toda
la ejecución en un try/catch y NUNCA relanzar; ante cualquier error SHALL retornar
`{ action: "allow" }` por defecto.

#### Scenario: Error interno del hook permite el paso sin lanzar
- **WHEN** ocurre cualquier excepción durante la evaluación
- **THEN** el hook emite `{ "decision": "allow" }` por stdout y sale con código 0

#### Scenario: Función retorna bloqueo con reason cuando el pipeline está en vuelo
- **WHEN** la función recibe un input válido con pipeline en progreso (rama e)
- **THEN** retorna `{ action: "block", reason: "<nombre de la próxima fase>" }`

### Requirement: Matriz de decisión de cinco ramas en orden estricto
La función `decideAutoPipeline` SHALL evaluar las cinco ramas en el siguiente orden
sin cortocircuito fuera de secuencia:

- **(a)** Sin sentinel AUTO presente → `allow`
- **(b)** Halt presente (`openspec/.workbench/auto-pipeline.halt.json`) → `allow`
- **(c)** Change ya bajo `openspec/changes/archive/` (incluye prefijo de fecha
  `YYYY-MM-DD--<change>`) → `allow` + el envoltorio borra el sentinel
- **(d)** Loop-guard: `stopHookActive && lastProgressKey === "${phase}#${stage}"`
  → incrementa `stuckCount`; si supera umbral (3 intentos) → `allow` + el envoltorio
  escribe halt diagnóstico con `{ reason: "loop-guard", releasedAt, phase, stage }`
- **(e)** Cualquier otro caso → `block`; el reason NOMBRA LA PRÓXIMA FASE; el
  envoltorio persiste sentinel con `stuckCount` y `lastProgressKey` actualizados

#### Scenario: Sin sentinel el hook permite el paso
- **WHEN** `openspec/.workbench/auto-pipeline.json` no existe
- **THEN** la rama (a) se activa y el hook retorna `{ "decision": "allow" }`

#### Scenario: Halt presente permite el paso
- **WHEN** existe `openspec/.workbench/auto-pipeline.halt.json`
- **THEN** la rama (b) se activa y el hook retorna `{ "decision": "allow" }`

#### Scenario: Change archivado permite el paso y borra el sentinel
- **WHEN** el change del sentinel aparece bajo `openspec/changes/archive/` (con o sin
  prefijo de fecha)
- **THEN** la rama (c) activa `allow` y el envoltorio elimina el archivo sentinel

#### Scenario: Loop-guard bloquea y lleva cuenta de intentos congelados
- **WHEN** `lastProgressKey` no cambia entre dos invocaciones consecutivas del hook
  `Stop` y `stopHookActive` es true
- **THEN** la rama (d) incrementa `stuckCount` en el sentinel persistido

#### Scenario: Loop-guard libera tras superar el umbral de congelamiento
- **WHEN** `stuckCount` supera 3 y `lastProgressKey` sigue congelado
- **THEN** la rama (d) retorna `allow` y el envoltorio escribe halt con
  `reason: "loop-guard"`

#### Scenario: Pipeline en vuelo bloquea la cesión del turno
- **WHEN** el sentinel existe, no hay halt, el change no está archivado y hay progreso
  real (lastProgressKey avanzó)
- **THEN** la rama (e) retorna `block` con reason que nombra la próxima fase

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
- **THEN** `stuckCount` se reinicia a 0 y el hook retorna `block` (rama e)

#### Scenario: Progreso vía cambio de stage reinicia stuckCount
- **WHEN** entre dos invocaciones del hook `Stop`, `stage` cambia (aunque `phase`
  permanezca igual)
- **THEN** `stuckCount` se reinicia a 0 y el hook retorna `block` (rama e)

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
