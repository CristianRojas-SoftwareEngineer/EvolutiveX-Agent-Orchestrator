# orchestrator-phase-handoff-gate

## ADDED Requirements

### Requirement: El orquestador valida el handoff de cada subagente antes de avanzar de fase
El orquestador SHALL ejecutar una función de validación determinista inmediatamente
después de recibir el JSON de handoff de un subagente de fase y ANTES de invocar el
siguiente subagente de fase. Si la validación falla, el orquestador SHALL detener el
pipeline y reportar el motivo al usuario; NO avanzará a la siguiente fase.

#### Scenario: Handoff válido permite el avance de fase
- **WHEN** el orquestador recibe un handoff JSON estructuralmente correcto (`change`
  presente, `apply_ready: true`, todos los campos de `artifacts` con valor `"done"`)
  y los predicados on-disk confirman la completitud de la fase
- **THEN** el orquestador avanza a la siguiente fase sin interrupción

#### Scenario: Handoff malformado bloquea el avance de fase
- **WHEN** el orquestador recibe un handoff JSON que viola el schema (campo ausente,
  `apply_ready` distinto de `true`, o cualquier artefacto con valor distinto de
  `"done"`)
- **THEN** el orquestador emite un diagnóstico que nombra el campo o condición que
  falló y detiene el pipeline sin avanzar de fase

### Requirement: El schema del handoff define los campos obligatorios y sus invariantes
El handoff SHALL ser un objeto JSON que cumpla:
- `change` (string): identificador de la forma `c<NNNNN>-<slug>`, presente y no vacío.
- `apply_ready` (boolean): SHALL ser exactamente `true`; el valor `false` es rechazo
  determinista independientemente de los demás campos.
- `artifacts` (object): SHALL contener una entrada por cada artefacto del delta (al
  menos `proposal`, `specs`, `design`, `tasks` para el planner; al menos `apply` para
  el implementer; al menos `archive` para el closer). El valor de cada entrada SHALL
  ser la cadena `"done"`; cualquier otro valor (incluido un mensaje de error) es
  rechazo determinista.

#### Scenario: apply_ready false provoca rechazo independiente del resto
- **WHEN** el handoff contiene `"apply_ready": false` con los demás campos correctos
- **THEN** la validación falla, el orquestador emite un diagnóstico y no avanza

#### Scenario: Artefacto con status distinto de "done" provoca rechazo
- **WHEN** cualquier entrada de `artifacts` tiene un valor distinto de `"done"` (p. ej.
  un mensaje de error o la cadena `"pending"`)
- **THEN** la validación falla, el orquestador emite un diagnóstico que nombra el
  artefacto afectado y no avanza

#### Scenario: Campo change ausente provoca rechazo
- **WHEN** el handoff no contiene el campo `change` o su valor es una cadena vacía
- **THEN** la validación falla y el orquestador no avanza

### Requirement: El gate evalúa predicados on-disk para confirmar completitud de fase
Tras la validación estructural del schema, el orquestador SHALL evaluar al menos un
predicado on-disk que confirme independientemente que el subagente de fase completó su
trabajo. El predicado específico (marcadores atómicos por fase o predicados fuertes
existentes como `verify-stage-completion`) SHALL ser determinado en `design.md`. El
gate SHALL considerar la fase incompleta si el predicado y el handoff son
inconsistentes entre sí.

#### Scenario: Predicado on-disk inconsistente con handoff bloquea el avance
- **WHEN** el handoff declara `apply_ready: true` pero el predicado on-disk indica que
  la fase no está completa (p. ej. artefactos ausentes en disco, gate de completitud
  con salida no-cero)
- **THEN** el orquestador rechaza el handoff, emite diagnóstico con la discrepancia y
  no avanza de fase

#### Scenario: Predicado on-disk coherente con handoff permite el avance
- **WHEN** tanto el handoff como el predicado on-disk concuerdan en que la fase está
  completa
- **THEN** el orquestador avanza a la siguiente fase

### Requirement: El diagnóstico de rechazo es legible y nombra la causa exacta
Cuando la validación falla (structural o on-disk), el orquestador SHALL producir un
mensaje de diagnóstico en español dirigido al usuario que incluya: el nombre de la fase
rechazada, el campo o predicado que falló, y el valor observado vs. el esperado. El
diagnóstico SHALL ser emitido antes de detener el pipeline.

#### Scenario: Diagnóstico nombra campo y valor observado
- **WHEN** el rechazo se origina en un campo del schema (p. ej. `apply_ready: false`)
- **THEN** el diagnóstico menciona el nombre del campo y el valor recibido

#### Scenario: Diagnóstico nombra el predicado on-disk fallido
- **WHEN** el rechazo se origina en un predicado on-disk (p. ej. gate de completitud
  con salida no-cero)
- **THEN** el diagnóstico nombra el predicado y la condición que no se cumplió
