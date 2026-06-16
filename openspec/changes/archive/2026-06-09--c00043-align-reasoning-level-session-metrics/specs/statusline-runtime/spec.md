## MODIFIED Requirements

### Requirement: Tabla 2 refleja session-metrics.json intra-workflow

Cuando el proxy ha persistido métricas per-step en `session-metrics.json`, el statusline SHALL mostrar en la Tabla 2 los contadores actualizados en la **siguiente** invocación que Claude Code realice. `aggregateSessionMetrics` SHALL leer **únicamente** el schema canónico: `models[*].billable_hops`, `models[*].finalized_runs`, `session_totals.billable_hops`, `session_totals.finalized_runs` y contadores de tokens en snake_case. SHALL NOT leer `count`, `workflow_count`, `total_steps`, `total_workflows` ni tokens en camelCase.

#### Scenario: Métricas visibles tras un hop sin esperar al Stop

- **GIVEN** `SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS` es `"on"`
- **AND** `sessions/<sessionId>/session-metrics.json` fue actualizado tras cerrar un step agéntico contable (main o subagent)
- **AND** Claude Code invoca el statusline con ese `session_id`
- **WHEN** `buildStatuslineOutput` agrega desde `session-metrics.json`
- **THEN** la Tabla 2 SHALL incluir el incremento de `# Steps` (`billable_hops`) y tokens correspondiente a ese hop
- **AND** `# Workflows` SHALL reflejar solo ejecuciones ya finalizadas (`finalized_runs`), sin incremento anticipado por el hop aislado

#### Scenario: Subagente visible en fila de su nivel

- **GIVEN** un subagent cerrado que usó un modelo clasificado como Standard
- **AND** `session-metrics.json` tiene `billable_hops` y `finalized_runs` para ese `modelId`
- **WHEN** se renderiza la Tabla 2
- **THEN** la fila Standard SHALL incluir los hops y la ejecución del subagente
- **AND** la fila del modelo del agente principal NO SHALL absorber esos contadores

## ADDED Requirements

### Requirement: Tabla 2 — fila Totales desde session_totals

La fila de totales de la Tabla 2 SHALL leer contadores agregados de sesión desde `session_totals` del archivo de métricas:

- `# Steps` ← `session_totals.billable_hops`
- `# Workflows` ← `session_totals.finalized_runs`

SHALL NOT derivar `# Workflows` totales sumando las filas Lite + Standard + Reasoning (corrección hallazgo 2).

#### Scenario: JSON con schema G4 (nombres retirados) no alimenta Tabla 2

- **GIVEN** `session-metrics.json` con `count` y `workflow_count` (schema G4) pero sin `billable_hops` ni `finalized_runs`
- **WHEN** `aggregateSessionMetrics` procesa el archivo
- **THEN** SHALL retornar métricas en cero para todos los niveles (mismo criterio que JSON malformado)

#### Scenario: Totales coherentes con ejecuciones estructurales

- **GIVEN** una sesión con `session_totals.finalized_runs: 3` y `session_totals.billable_hops: 12` (main + dos subagentes)
- **WHEN** se renderiza la fila de totales de la Tabla 2
- **THEN** la columna `# Workflows` de totales SHALL mostrar `3`
- **AND** la columna `# Steps` de totales SHALL mostrar `12`

#### Scenario: Hallazgo 2 — totales no inflan por multi-modelo en un main

- **GIVEN** una sesión con un solo main cerrado y hops en dos modelos de distinto nivel
- **AND** `session_totals.finalized_runs: 1`
- **WHEN** se renderiza la fila de totales
- **THEN** `# Workflows` en totales SHALL ser `1`
- **AND** SHALL NOT ser la suma de las columnas por nivel si esa suma excede `session_totals.finalized_runs`

### Requirement: Tabla 2 — semántica de columnas para trabajo por nivel

La Tabla 2 («Trabajo por niveles de razonamiento») SHALL interpretar:

- `# Steps` ← `billable_hops` agregado por nivel (hops con `usage`, main y subagent, tiempo real).
- `# Workflows` ← `finalized_runs` agregado por nivel (ejecuciones cerradas atribuidas al `modelId` del primer hop `stepKind: agentic` con `usage` de cada ejecución).

Esta semántica SHALL NOT limitarse a turnos de usuario (`workflow-sequence.json`); los sub-workflows `kind: subagent` son ejecuciones de primera clase para ambas columnas. Los side-requests con `usage` contribuyen a `# Steps` y tokens pero no reciben `finalized_runs`.

#### Scenario: Un prompt con dos subagentes distribuye trabajo por slot

- **GIVEN** un turno con agente principal en Reasoning y dos subagentes en Standard, todos cerrados
- **WHEN** se agregan métricas por nivel
- **THEN** Reasoning `# Workflows` SHALL ser `1` (main)
- **AND** Standard `# Workflows` SHALL ser `2` (subagentes)
- **AND** totales `# Workflows` SHALL ser `3`

#### Scenario: Side-request y agentic en el mismo turno — filas por nivel

- **GIVEN** un main cerrado con un hop `side-request` facturable en Lite (`model-lite`) y hops `agentic` facturables en Standard (`model-main`)
- **WHEN** se renderiza la Tabla 2
- **THEN** la fila Lite SHALL mostrar `# Steps` del side-request y `# Workflows` `0`
- **AND** la fila Standard SHALL mostrar `# Steps` de los hops agénticos y `# Workflows` `1`
- **AND** totales `# Workflows` SHALL ser `1`
