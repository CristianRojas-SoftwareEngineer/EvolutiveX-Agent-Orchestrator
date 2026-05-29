## ADDED Requirements

### Requirement: Trazabilidad 1:1 a §43

La migración del gateway SHALL dividirse en fases identificadas 1:1 con el [catálogo §43](../../../../docs/proposals/gateway-design.md#43-fases-de-implementación): bloques C (C0–C3), G (G1–G5) y P (P0–P2). Cada fase SHALL tener un identificador canónico (`c0`, `c1`, `c2`, `c3`, `g1`, `g2`, `g3`, `g4`, `g5`, `p0`, `p1`, `p2`) referenciable en el registro del orquestador.

#### Scenario: Verificación de trazabilidad del registro

- **GIVEN** el registro de fases en `design.md` del orquestador
- **WHEN** se listan todas las entradas del registro
- **THEN** SHALL existir exactamente 12 fases: C0, C1, C2, C3, G1, G2, G3, G4, G5, P0, P1, P2
- **AND** cada fase SHALL tener definidos: bloque (C/G/P), dependencia según §43, gate de validación, docs a actualizar y legacy a retirar

---

### Requirement: Materialización por change de segundo nivel

Cada fase de implementación (C1–C3, G1–G5, P0–P2) SHALL materializarse como un change OpenSpec de segundo nivel independiente, nombrado `gateway-<faseid>-<slug>` (p. ej. `gateway-c1-wire-agent-headers`). La fase C0 (diseño documentado) es excepción: se considera validada al completar el orquestador.

#### Scenario: Nomenclatura y back-reference del change hijo

- **GIVEN** que se va a iniciar la fase C1
- **WHEN** se crea el change de segundo nivel para C1
- **THEN** el nombre del change SHALL seguir el patrón `gateway-c1-<slug>`
- **AND** el `proposal.md` del change hijo SHALL incluir una back-reference explícita al orquestador `gateway-migration`

#### Scenario: Creación incremental — no se crean de golpe

- **GIVEN** el registro del orquestador que enumera los 11 changes hijos posibles
- **WHEN** se inicia la fase C1 (primera fase implementable)
- **THEN** SHALL existir únicamente el change hijo de C1 en `openspec/changes/`
- **AND** los changes hijos de C2–P2 NO SHALL existir todavía

---

### Requirement: Definición de Hecho por fase

Una fase SHALL considerarse completa si y solo si se cumplen las tres condiciones siguientes:
(a) el gate de validación técnica de esa fase ha sido superado con éxito,
(b) la documentación afectada ha sido actualizada al estado real posterior a la fase,
(c) el legacy reemplazado por la fase ha sido eliminado o marcado explícitamente como deprecado.

#### Scenario: Gate técnico — bloque G

- **GIVEN** una fase del bloque G completada (p. ej. G1)
- **WHEN** se ejecuta `npm run test:quick`
- **THEN** lint, typecheck y tests unitarios SHALL pasar sin errores
- **AND** la fase G1 NO SHALL marcarse como validada hasta que este comando pase

#### Scenario: Gate técnico — bloque P

- **GIVEN** una fase del bloque P completada (p. ej. P1)
- **WHEN** se ejecuta `npm run test` y el checklist §37b (20 casos)
- **THEN** build, lint, typecheck y tests SHALL pasar
- **AND** los 20 casos del [checklist E2E §37b](../../../../docs/proposals/gateway-design.md#37b-checklist-de-aceptación-e2e-del-layout) SHALL estar verificados

#### Scenario: Fase sin docs actualizadas

- **GIVEN** una fase cuyo gate técnico ha pasado
- **WHEN** `README.md` o `docs/session-audit-model.md` aún reflejan el estado anterior a la fase
- **THEN** la fase NO SHALL marcarse como validada
- **AND** las docs afectadas SHALL actualizarse antes de proceder

---

### Requirement: Gate de dependencias §43

Una fase dependiente SHALL iniciarse únicamente si todas sus fases prerrequisito (según [§43](../../../../docs/proposals/gateway-design.md#43-fases-de-implementación)) tienen estado `validada` o `archivada` en el registro del orquestador.

#### Scenario: Intento de iniciar fase con prerequisito pendiente

- **GIVEN** que la fase C1 está en estado `pendiente`
- **WHEN** se intenta iniciar la fase C2 (que depende de C1)
- **THEN** el skill `migration-phase-gate` SHALL reportar el gate de dependencias como CRITICAL
- **AND** la fase C2 NO SHALL iniciarse hasta que C1 esté `validada` o `archivada`

#### Scenario: Fases sin dependencia pueden iniciarse en paralelo

- **GIVEN** las fases G5 y C1 que ambas tienen dependencia `—` en §43
- **WHEN** se verifica el gate de dependencias de G5
- **THEN** G5 SHALL poder iniciarse independientemente del estado de C1

---

### Requirement: Registro de estados del orquestador

El orquestador SHALL mantener en su `design.md` un registro de fases con el estado de cada una. Los estados válidos son: `pendiente`, `en-curso`, `validada`, `archivada`. Una fase SHALL progresar en ese orden sin saltarse estados.

#### Scenario: Actualización de estado tras gate superado

- **GIVEN** el registro del orquestador con la fase C1 en estado `en-curso`
- **WHEN** el gate de validación de C1 es superado (DoD completo)
- **THEN** el estado de C1 en el registro SHALL actualizarse a `validada`
- **AND** posteriormente al archivar el change hijo, SHALL actualizarse a `archivada`

---

### Requirement: Sincronización documental tras cada fase

Tras completar cada fase, los documentos `README.md`, `docs/session-audit-model.md` y `docs/proposals/gateway-design.md` SHALL reflejar el estado real del sistema (lo implementado). Estos documentos NO SHALL afirmar como implementado lo que aún no lo está.

#### Scenario: Documentación divergente detectada tras una fase

- **GIVEN** que la fase G2 ha sido implementada y su gate técnico superado
- **WHEN** `docs/session-audit-model.md` aún describe el modelo `ActiveInteraction` como activo (en lugar de `IWorkflowRepository`)
- **THEN** el skill `migration-phase-gate` SHALL reportar la divergencia documental como WARNING o CRITICAL
- **AND** la fase G2 NO SHALL marcarse `validada` hasta corregir la documentación

#### Scenario: Documentación no afectada no se modifica

- **GIVEN** que la fase G5 implementa `ProviderCatalog` desde `routing/providers/`
- **WHEN** se revisan los docs de la fase
- **THEN** solo los documentos listados en el registro para G5 necesitan actualización
- **AND** el resto de docs SHALL permanecer sin cambios forzados

---

### Requirement: Cero código y documentación zombie/legacy

El código y la documentación reemplazados por una fase SHALL eliminarse o marcarse explícitamente como deprecados con fecha de retirada planificada dentro del mismo change de segundo nivel. No SHALL quedar imports huérfanos, secciones duplicadas, ni referencias obsoletas al layout anterior.

#### Scenario: Eliminación de código legacy al completar fase

- **GIVEN** que la fase G3 extrae `StepAssembler` desde `audit-sse-response.handler`
- **WHEN** el nuevo `StepAssembler` está operativo y sus tests pasan
- **THEN** el código duplicado en `audit-sse-response.handler` SHALL eliminarse en el mismo change
- **AND** `npm run lint` y `npm run typecheck` SHALL pasar (sin imports huérfanos)

#### Scenario: Marcado explícito de deprecación si no se puede eliminar de inmediato

- **GIVEN** código legacy que no puede eliminarse en la misma fase por dependencia transitoria
- **WHEN** se completa la fase
- **THEN** el código SHALL marcarse con un comentario de deprecación que incluya: razón, fase que lo reemplaza y fecha de retirada planificada
- **AND** se SHALL crear una tarea en el `tasks.md` del change orquestador para su eliminación en la fase de retirada
