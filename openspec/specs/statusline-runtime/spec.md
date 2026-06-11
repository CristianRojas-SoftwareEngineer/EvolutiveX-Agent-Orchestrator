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
- **WHEN** hay cuota de suscripción disponible (stdin OAuth **o** `subscription-quota.json` con ventana válida)
- **THEN** el output SHALL contener Tabla 1 y Tabla 3 renderizadas side-by-side, igual que si Tabla 2 estuviera visible

### Requirement: Resolución multi-fuente de cuota para Tabla 3

`router-status.ts` SHALL determinar si renderiza la Tabla 3 («Límites de uso por suscripción») mediante `resolveQuotaSource()`, **no** mediante `authMethod === 'oauth'` exclusivamente.

Orden de resolución:

1. Si `resolveAuthMethodFromEnv(settingsEnv) === 'oauth'` y `ctx.rate_limits` incluye al menos `five_hour` o `seven_day` con datos utilizables → usar stdin (Anthropic OAuth, comportamiento existente).
2. Else si el proveedor activo (`resolveActiveProvider`) tiene `SUBSCRIPTION_QUOTA.enabled === true` en su `config.json` y existe `sessions/<sessionDir>/subscription-quota.json` legible con al menos una ventana (`five_hour` o `seven_day`) → usar el archivo.
3. Else → no renderizar Tabla 3.

El shape normalizado para `renderRateLimitTable` SHALL ser:

```typescript
{
  five_hour?: { used_percentage?: number | null; resets_at?: number | null };
  seven_day?: { used_percentage?: number | null; resets_at?: number | null };
}
```

#### Scenario: Anthropic OAuth con stdin sigue funcionando

- **GIVEN** `settingsEnv` sin `ANTHROPIC_API_KEY` ni `ANTHROPIC_AUTH_TOKEN` (oauth)
- **AND** stdin incluye `rate_limits.five_hour.used_percentage: 60`
- **WHEN** `buildStatuslineOutput` ejecuta
- **THEN** el output SHALL contener «Límites de uso por suscripción»
- **AND** SHALL contener «Cuota actual (5h)»

#### Scenario: Minimax bearer con subscription-quota.json

- **GIVEN** proveedor activo `minimax` con `SUBSCRIPTION_QUOTA.enabled`
- **AND** `settingsEnv.ANTHROPIC_AUTH_TOKEN` presente (bearer)
- **AND** `sessions/<sessionId>/subscription-quota.json` contiene `five_hour.used_percentage: 14`
- **WHEN** `buildStatuslineOutput` ejecuta con ese `session_id`
- **THEN** el output SHALL contener «Límites de uso por suscripción»
- **AND** SHALL NOT depender de `ctx.rate_limits` en stdin

#### Scenario: Bearer sin SUBSCRIPTION_QUOTA no muestra Tabla 3

- **GIVEN** proveedor activo sin `SUBSCRIPTION_QUOTA` (p. ej. OpenRouter)
- **AND** `settingsEnv.ANTHROPIC_AUTH_TOKEN` presente
- **AND** stdin incluye `rate_limits` (ignorado)
- **WHEN** `buildStatuslineOutput` ejecuta
- **THEN** el output SHALL NOT contener «Límites de uso por suscripción»

#### Scenario: Minimax sin archivo de cuota aún

- **GIVEN** proveedor Minimax activo con `SUBSCRIPTION_QUOTA.enabled`
- **AND** no existe `subscription-quota.json` en el `sessionDir`
- **WHEN** `buildStatuslineOutput` ejecuta
- **THEN** el output SHALL NOT contener Tabla 3
- **AND** Tabla 1 SHALL renderizarse sola (layout sin side-by-side de cuota)

### Requirement: Tabla 3 — título y layout invariantes

La Tabla 3 SHALL mantener el título exacto `Límites de uso por suscripción` para todas las fuentes (stdin OAuth y archivo de proveedor). SHALL renderizarse side-by-side con Tabla 1 cuando hay datos de cuota, con el mismo `renderSideBySide` y reglas de ancho de referencia existentes.

#### Scenario: Título idéntico para Minimax

- **GIVEN** cuota resuelta desde `subscription-quota.json`
- **WHEN** se renderiza Tabla 3
- **THEN** la primera línea SHALL contener `╭─ Límites de uso por suscripción`

#### Scenario: Layout side-by-side con archivo de cuota

- **GIVEN** cuota válida desde archivo
- **WHEN** `buildStatuslineOutput` renderiza la fila superior
- **THEN** Tabla 1 y Tabla 3 SHALL aparecer en la misma fila con gap de 2 espacios

### Requirement: Tabla 3 — fallback con guión para datos no calculables

En las celdas de barra + porcentaje y de tiempo de reinicio de la Tabla 3, `router-status.ts` SHALL mostrar el literal `"-"` (con estilos ANSI aplicables) cuando:

- `used_percentage` es `null`, `undefined`, o no es un número finito en [0, 100].
- `resets_at` es `null`, `undefined`, o no es un número finito positivo.

SHALL NOT usar `N/A` en Tabla 3. SHALL NOT sustituir ausencia de dato por `used_percentage ?? 0` ni renderizar barra al 0% por defecto.

Cuando `resets_at` es válido y ya expiró (`resets_at * 1000 <= Date.now()`), SHALL mostrar `Ahora` (comportamiento existente de `formatTimeRemaining` para reinicio inminente).

#### Scenario: Porcentaje no calculable muestra guión

- **GIVEN** `five_hour` presente sin `used_percentage` calculable
- **WHEN** se renderiza la fila «Cuota actual (5h)»
- **THEN** la celda de barra + % SHALL ser `"-"` sin barra de progreso

#### Scenario: Tiempo de reinicio no calculable muestra guión

- **GIVEN** `seven_day.used_percentage` válido pero `seven_day.resets_at` ausente
- **WHEN** se renderiza la fila «Cuota semanal (7d)»
- **THEN** la celda de tiempo SHALL ser `"-"`

#### Scenario: Porcentaje cero válido no es guión

- **GIVEN** `five_hour.used_percentage: 0` explícito y finito (cuota intacta)
- **WHEN** se renderiza la fila 5h
- **THEN** la celda SHALL mostrar barra al 0% y el texto `0%`
- **AND** SHALL NOT mostrar `"-"`

### Requirement: Lectura de SUBSCRIPTION_QUOTA en statusline

`router-status.ts` SHALL leer `SUBSCRIPTION_QUOTA` del `config.json` del proveedor activo bajo `<projectRoot>/routing/providers/<name>/config.json`. SHALL NOT realizar peticiones HTTP para obtener cuota.

#### Scenario: projectRoot desde SMART_CODE_PROXY_ROOT

- **GIVEN** `settings.env.SMART_CODE_PROXY_ROOT` apunta al repo del proxy
- **AND** `configs/.env` bajo esa raíz define `UPSTREAM_ORIGIN` de Minimax
- **WHEN** `resolveQuotaSource` evalúa configuración
- **THEN** SHALL cargar `SUBSCRIPTION_QUOTA` desde `routing/providers/minimax/config.json` bajo esa raíz

### Requirement: Clasificación con vars ausentes (fallback heurístico por nivel)

`router-status` SHALL aplicar clasificación heurística por subcadena en `classifyModelWithEnv` de forma **independiente por nivel**: para cada nivel (`haiku` → Lite, `sonnet` → Standard, `opus` → Reasoning) cuya variable `ANTHROPIC_DEFAULT_*_MODEL` esté vacía o ausente, la clasificación usa el término correspondiente como substring del `modelId`. Los niveles con variable configurada siempre clasifican por coincidencia de variable, con independencia del estado de los otros niveles (configuración parcial).

#### Scenario: Fallback activo — todas las vars ausentes, modelIds estándar de Anthropic

- **GIVEN** `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL` y `ANTHROPIC_DEFAULT_OPUS_MODEL` están vacías o ausentes
- **AND** `session-metrics.json` contiene `modelId`s con `"haiku"`, `"sonnet"` u `"opus"`
- **THEN** `classifyModelWithEnv` SHALL clasificar correctamente (Lite/Standard/Reasoning)
- **AND** `aggregateSessionMetrics` SHALL retornar contadores `> 0` para esos niveles

#### Scenario: Fallback activo — modelo sin término conocido

- **GIVEN** `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL` y `ANTHROPIC_DEFAULT_OPUS_MODEL` están vacías o ausentes
- **AND** `modelId` no contiene ninguno de los tres términos
- **THEN** `classifyModelWithEnv` SHALL retornar `null` (el registro no se suma)

#### Scenario: Configuración parcial — fallback por nivel independiente

- **GIVEN** `ANTHROPIC_DEFAULT_HAIKU_MODEL` tiene valor no vacío (p. ej. `"claude-haiku-4-5"`)
- **AND** `ANTHROPIC_DEFAULT_SONNET_MODEL` está vacía o ausente
- **AND** `session-metrics.json` contiene modelos con `"haiku"` y modelos con `"sonnet"` en su `modelId`
- **THEN** los modelos con `"haiku"` SHALL clasificar por match de variable (Lite)
- **AND** los modelos con `"sonnet"` SHALL clasificar por keyword heurística (Standard)
- **AND** `aggregateSessionMetrics` SHALL retornar contadores `> 0` para ambos niveles

### Requirement: Caché por sesión (`.statusline-state.json`)

El statusline SHALL persistir estado ligero por sesión para mejorar la lectura entre re-invocaciones de Claude Code y para optimizar re-invocaciones cuando `session-metrics.json` no cambió (cierre temprano de Tabla 2). **No** sustituye a `session-metrics.json`.

| Aspecto   | Detalle                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| Ruta      | `sessions/<sessionDir>/.statusline-state.json`                                                                            |
| Lectura   | Al renderizar Tabla 1 (fallback de %) y Tabla 2 (cierre temprano + diff de celdas), si existe `sessionDir`                |
| Escritura | Tras renderizar Tabla 1 (`contextUsagePercentage` si stdin aportó valor usable), Tabla 2 (snapshot + render cacheado) |

#### Scenario: Cierre temprano exitoso

- **GIVEN** `.statusline-state.json` contiene `lastRenderedMtimeMs` y `lastRenderedTable2Output`
- **AND** el `mtime` y `size` actuales de `session-metrics.json` coinciden con el cache
- **AND** la Tabla 2 está habilitada y la sesión está resuelta
- **WHEN** Claude Code invoca el script del statusline
- **THEN** SHALL imprimir el contenido de `lastRenderedTable2Output` sin re-renderizar
- **AND** SHALL NO invocar `aggregateSessionMetrics`

#### Scenario: Re-render por cambio en métricas

- **GIVEN** el `mtime` o `size` de `session-metrics.json` difiere del cache
- **WHEN** Claude Code invoca el script del statusline
- **THEN** SHALL re-renderizar la Tabla 2 desde `session-metrics.json`
- **AND** SHALL actualizar `lastRenderedMtimeMs`, `lastRenderedTable2Output` y `metricsSnapshot` en `.statusline-state.json`

### Requirement: Campo `lastRenderedMtimeMs` en `.statusline-state.json`

`router-status.ts` SHALL persistir el campo `lastRenderedMtimeMs` (entero, milisegundos epoch) en `.statusline-state.json` tras renderizar la Tabla 2. El valor SHALL ser el `mtime` en milisegundos de `session-metrics.json` al momento del render. Si `session-metrics.json` no existe, SHALL persistir `0`.

#### Scenario: Persistencia tras render normal

- **GIVEN** una invocación que re-renderiza la Tabla 2 desde `session-metrics.json` con `mtime` = 1700000000000
- **WHEN** `writeStatuslineCache` persiste el estado
- **THEN** `.statusline-state.json` SHALL contener `"lastRenderedMtimeMs": 1700000000000`

#### Scenario: Persistencia con archivo de métricas ausente

- **GIVEN** una invocación donde `session-metrics.json` no existe
- **WHEN** `writeStatuslineCache` persiste el estado
- **THEN** `.statusline-state.json` SHALL contener `"lastRenderedMtimeMs": 0`

### Requirement: Campo `lastRenderedTable2Output` en `.statusline-state.json`

`router-status.ts` SHALL persistir el campo `lastRenderedTable2Output` (string, contenido textual exacto de la Tabla 2 con códigos ANSI y saltos de línea) tras renderizar la Tabla 2. La cadena SHALL terminar en `\n` para preservar el layout al reimprimir.

#### Scenario: Persistencia del render textual

- **GIVEN** una invocación que renderiza la Tabla 2 con 6 líneas de contenido (cabecera, 3 filas de nivel, separador, fila de totales)
- **WHEN** `writeStatuslineCache` persiste el estado
- **THEN** `.statusline-state.json` SHALL contener `"lastRenderedTable2Output": "<6 líneas separadas por \\n>\\n"` (string con 6 saltos de línea)

#### Scenario: Reimpresión preserva formato

- **GIVEN** `lastRenderedTable2Output` contiene la cadena exacta de un render previo con códigos ANSI
- **WHEN** una invocación posterior detecta mtime sin cambios y reimprime el cache
- **THEN** el output por stdout SHALL ser byte-idéntico al render original (mismos colores, bordes, alineación)
