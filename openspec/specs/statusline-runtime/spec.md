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

Cuando el proxy ha persistido métricas per-step en `session-metrics.json`, el statusline SHALL mostrar en la Tabla 2 los contadores actualizados en la **siguiente** invocación que Claude Code realice, sin requerir cambios en el algoritmo de agregación de `aggregateSessionMetrics` más allá de leer el archivo vigente.

#### Scenario: Métricas visibles tras un hop sin esperar al Stop

- **GIVEN** `SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS` es `"on"`
- **AND** `sessions/<sessionId>/session-metrics.json` fue actualizado tras cerrar un step main contable
- **AND** Claude Code invoca el statusline con ese `session_id`
- **WHEN** `buildStatuslineOutput` agrega desde `session-metrics.json`
- **THEN** la Tabla 2 SHALL incluir el incremento de `# Steps` y tokens correspondiente a ese hop
- **AND** `# Workflows` SHALL reflejar solo workflows main ya cerrados (sin incremento anticipado por el hop aislado)

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

