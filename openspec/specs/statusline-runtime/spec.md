# statusline-runtime Specification

## Purpose

Comportamiento de `router-status.ts` al resolver `sessions/`, `routing/providers` y `configs/.env` desde `env.SMART_CODE_PROXY_ROOT` en settings global, con fallback a `process.cwd()`, para que las métricas de sesión sean correctas aunque Claude Code ejecute el subprocess en otro workspace.
## Requirements
### Requirement: Resolución de projectRoot desde settings

`router-status.ts` SHALL resolver `projectRoot` leyendo `SMART_CODE_PROXY_ROOT` desde el bloque `env` de `~/.claude/settings.json` (misma fuente que auth y modelos por nivel), no desde variables de entorno del shell del proceso.

#### Scenario: ROOT configurado y válido

- **GIVEN** `settings.env.SMART_CODE_PROXY_ROOT` es una ruta absoluta que contiene `routing/providers`
- **WHEN** `router-status` construye rutas a `sessions/`, `routing/providers` y `configs/.env`
- **THEN** todas SHALL estar bajo esa raíz, independientemente de `process.cwd()` del subprocess

#### Scenario: ROOT ausente

- **GIVEN** `settings.env` no define `SMART_CODE_PROXY_ROOT` o está vacío
- **WHEN** `router-status` resuelve `projectRoot`
- **THEN** SHALL usar `path.resolve(process.cwd())` como comportamiento compatible con instalaciones previas

#### Scenario: ROOT inválido

- **GIVEN** `SMART_CODE_PROXY_ROOT` apunta a un directorio sin `routing/providers`
- **WHEN** `router-status` resuelve `projectRoot`
- **THEN** SHALL hacer fallback a `process.cwd()` sin lanzar error fatal

### Requirement: Lectura de settings sin dependencia de configure-provider

La resolución de `projectRoot` SHALL ocurrir en cada invocación del statusline leyendo el archivo `settings.json`, de modo que reinstalar o mover el repo y volver a ejecutar el instalador sea suficiente para actualizar rutas sin reiniciar el proxy.

#### Scenario: ROOT actualizado tras reinstalar

- **GIVEN** el usuario movió el clon del repositorio y ejecutó de nuevo el instalador
- **WHEN** Claude Code invoca el statusline en la siguiente sesión
- **THEN** `router-status` SHALL leer el nuevo `SMART_CODE_PROXY_ROOT` del archivo

### Requirement: Compatibilidad con opciones de test

`router-status` SHALL seguir aceptando `projectRoot` y `sessionsRoot` inyectados vía `StatuslineBuildOptions` para tests, con prioridad sobre `SMART_CODE_PROXY_ROOT` y sobre `process.cwd()`.

#### Scenario: Test con projectRoot inyectado

- **GIVEN** un test pasa `projectRoot` en `StatuslineBuildOptions`
- **WHEN** se llama a `buildStatuslineOutput`
- **THEN** las rutas resueltas SHALL usar el valor inyectado

### Requirement: Métricas de sesión bajo ROOT correcto

Cuando `ctx.session_id` tiene carpeta coincidente bajo `<projectRoot>/sessions/`, la Tabla 2 SHALL agregar desde `<projectRoot>/sessions/<dir>/session-metrics.json` según el diseño en [`docs/router-statusline.md`](../../../docs/router-statusline.md).

#### Scenario: Workspace distinto al repo del proxy

- **GIVEN** `SMART_CODE_PROXY_ROOT` apunta al repo del proxy
- **AND** `process.cwd()` del subprocess es otro proyecto
- **AND** existe `sessions/<sessionId>/session-metrics.json` bajo la raíz del proxy
- **WHEN** Claude Code invoca el statusline con ese `session_id` en stdin
- **THEN** la Tabla 2 SHALL mostrar métricas distintas de cero para niveles con actividad

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

### Requirement: Visibilidad condicional de la Tabla 2

`buildStatuslineOutput` SHALL renderizar la Tabla 2 ("Steps y consumo de tokens por
nivel") únicamente cuando `settingsEnv.SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS`
tenga el valor exacto `on` (case-insensitive, trim). En cualquier otro caso (valor
ausente, `off`, o cualquier otro string) la Tabla 2 SHALL omitirse por completo del
output: no se calcula `targetWidth`, no se llama a `renderTokenTable`, no se escribe
el cache de métricas y el string de salida NO incluye ninguna línea de dicha tabla.

#### Scenario: Variable en on — Tabla 2 visible

- **WHEN** `settingsEnv.SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS` es `"on"`
- **THEN** `buildStatuslineOutput` SHALL incluir la Tabla 2 en el output devuelto
- **AND** el bloque superior (Tabla 1 y, si aplica, Tabla 3) SHALL renderizarse con normalidad

#### Scenario: Variable ausente — Tabla 2 oculta

- **WHEN** `settingsEnv` no contiene la clave `SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS`
- **THEN** el output SHALL NOT contener la Tabla 2
- **AND** el bloque superior SHALL estar presente e intacto

#### Scenario: Variable en off — Tabla 2 oculta

- **WHEN** `settingsEnv.SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS` es `"off"`
- **THEN** el output SHALL NOT contener la Tabla 2
- **AND** el bloque superior SHALL estar presente e intacto

#### Scenario: Variable con valor desconocido — Tabla 2 oculta

- **WHEN** `settingsEnv.SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS` tiene un valor distinto de `"on"` (p. ej. `"1"`, `"true"`, `"yes"`)
- **THEN** el output SHALL NOT contener la Tabla 2

#### Scenario: Tabla 2 oculta — bloque superior sin alteraciones

- **GIVEN** `SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS` no es `"on"`
- **WHEN** el método de auth es `oauth` con cuotas disponibles
- **THEN** el output SHALL contener Tabla 1 y Tabla 3 renderizadas side-by-side, igual que si Tabla 2 estuviera visible

### Requirement: Clasificación con vars ausentes (fallback heurístico)

`router-status` SHALL aplicar clasificación heurística por subcadena (`haiku`, `sonnet`, `opus`) en el `modelId` cuando `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL` y `ANTHROPIC_DEFAULT_OPUS_MODEL` estén vacías o ausentes en settings.

#### Scenario: Fallback activo — modelIds estándar de Anthropic

- **GIVEN** `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL` y `ANTHROPIC_DEFAULT_OPUS_MODEL` están vacías o ausentes
- **AND** `session-metrics.json` contiene `modelId`s con `"haiku"`, `"sonnet"` u `"opus"`
- **THEN** `classifyModelWithEnv` SHALL clasificar correctamente (Lite/Standard/Reasoning)
- **AND** `aggregateSessionMetrics` SHALL retornar contadores `> 0` para esos niveles

#### Scenario: Fallback activo — modelo sin término conocido

- **GIVEN** `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL` y `ANTHROPIC_DEFAULT_OPUS_MODEL` están vacías o ausentes
- **AND** `modelId` no contiene ninguno de los tres términos
- **THEN** `classifyModelWithEnv` SHALL retornar `null` (el registro no se suma)

#### Scenario: Fallback no activo — alguna var configurada

- **GIVEN** al menos una de las tres variables tiene valor no vacío
- **THEN** el fallback heurístico SHALL NOT activarse
- **AND** solo SHALL aplicar la comparación por includes contra las vars configuradas

