## ADDED Requirements

### Requirement: Tabla 2 — cuatro niveles de razonamiento fijos

La Tabla 2 («Trabajo por niveles de razonamiento») SHALL renderizar **exactamente cuatro filas de datos** por nivel, en este orden, incluso cuando todos los contadores sean cero:

| Etiqueta UI | Clave interna | Variable `settings.env` | Alias Claude |
| ----------- | ------------- | ----------------------- | ------------ |
| Lite | `lite` | `ANTHROPIC_DEFAULT_HAIKU_MODEL` | haiku |
| Standard | `standard` | `ANTHROPIC_DEFAULT_SONNET_MODEL` | sonnet |
| Reasoning | `reasoning` | `ANTHROPIC_DEFAULT_OPUS_MODEL` | opus |
| Frontier | `frontier` | `ANTHROPIC_DEFAULT_FABLE_MODEL` | fable |

La fila de totales SHALL seguir inmediatamente a las cuatro filas de nivel.

#### Scenario: Tabla 2 con router-details on muestra cuatro niveles

- **GIVEN** `EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS` es `"on"`
- **WHEN** se renderiza la Tabla 2 sin actividad en sesión
- **THEN** el output SHALL contener las etiquetas `Lite`, `Standard`, `Reasoning` y `Frontier` como filas de nivel
- **AND** SHALL contener la fila `Totales de sesión`

#### Scenario: Métricas Fable 5 agregadas en Frontier

- **GIVEN** `session-metrics.json` contiene entradas para un `modelId` que incluye `claude-fable-5`
- **AND** `ANTHROPIC_DEFAULT_FABLE_MODEL` está configurado o el fallback heurístico aplica
- **WHEN** se renderiza la Tabla 2
- **THEN** la fila Frontier SHALL mostrar `# Steps`, `# Workflows` y tokens distintos de cero según corresponda
- **AND** las filas Lite, Standard y Reasoning NO SHALL absorber esos contadores

#### Scenario: Main en Frontier con subagente en Standard

- **GIVEN** un turno con agente principal en Frontier (Fable 5) y un subagente en Standard, ambos cerrados
- **WHEN** se agregan métricas por nivel
- **THEN** Frontier `# Workflows` SHALL ser `1` (main)
- **AND** Standard `# Workflows` SHALL ser `1` (subagente)
- **AND** la fila Totales `# Workflows` SHALL ser `2` (suma de filas renderizadas)

### Requirement: Clasificación Frontier (Fable 5)

`classifyModelWithEnv` SHALL clasificar un `modelId` como `frontier` cuando:

1. `ANTHROPIC_DEFAULT_FABLE_MODEL` tiene valor no vacío y `modelId` lo incluye como substring, **o**
2. `ANTHROPIC_DEFAULT_FABLE_MODEL` está vacía o ausente y `modelId` incluye la substring `"fable"`.

La evaluación de Frontier SHALL ocurrir **después** de haiku (`lite`) y **antes** de opus (`reasoning`) y sonnet (`standard`).

`classifyModelWithEnv` SHALL NOT clasificar modelos Mythos ni keywords `mythos` en este change.

#### Scenario: Fable con variable configurada

- **GIVEN** `ANTHROPIC_DEFAULT_FABLE_MODEL` es `"claude-fable-5"`
- **WHEN** `classifyModelWithEnv("anthropic/claude-fable-5", settingsEnv)` se invoca
- **THEN** SHALL retornar `frontier`

#### Scenario: Fable con fallback heurístico

- **GIVEN** `ANTHROPIC_DEFAULT_FABLE_MODEL` está ausente o vacía
- **WHEN** `classifyModelWithEnv("claude-fable-5", {})` se invoca
- **THEN** SHALL retornar `frontier`

#### Scenario: Mythos no clasificado

- **GIVEN** cualquier configuración de `ANTHROPIC_DEFAULT_*_MODEL`
- **WHEN** `classifyModelWithEnv("claude-mythos-5", settingsEnv)` se invoca
- **THEN** SHALL retornar `null`

### Requirement: Paleta de colores Tabla 2 por tier

`renderTokenTable` SHALL aplicar color ANSI a la columna **Nivel** según la escala de costo:

| Tier | Color |
| ---- | ----- |
| Lite | gris (`\x1B[90m`) |
| Standard | gris (`\x1B[90m`) |
| Reasoning | blanco (`\x1B[37m`) |
| Frontier | blanco bold (`\x1B[1;37m`) |

#### Scenario: Frontier destacado sobre Reasoning

- **GIVEN** una Tabla 2 renderizada con las cuatro filas visibles
- **WHEN** se inspecciona el output con códigos ANSI
- **THEN** la etiqueta `Frontier` SHALL usar secuencia bold blanco
- **AND** la etiqueta `Reasoning` SHALL usar secuencia blanco sin bold

## MODIFIED Requirements

### Requirement: Tabla 2 — fila Totales

La fila de totales de la Tabla 2 SHALL interpretar:

- `# Steps` ← `session_totals.billable_hops` del archivo de métricas.
- `# Workflows` ← suma de `finalized_runs` agregados en las **cuatro** filas de nivel (Lite + Standard + Reasoning + Frontier), calculada en `aggregateSessionMetrics` para consistencia interna de la tabla.

`session_totals.finalized_runs` es el contador estructural en disco (véase `gateway-session-metrics`); la columna `# Workflows` de totales SHALL NOT leer ese campo directamente. Ambos valores pueden diferir cuando hay workflows sin modelo atribuido (sin fila por nivel).

#### Scenario: JSON con schema G4 (nombres retirados) no alimenta Tabla 2

- **GIVEN** `session-metrics.json` con `count` y `workflow_count` (schema G4) pero sin `billable_hops` ni `finalized_runs`
- **WHEN** `aggregateSessionMetrics` procesa el archivo
- **THEN** SHALL retornar métricas en cero para todos los niveles (mismo criterio que JSON malformado)

#### Scenario: Totales coherentes con ejecuciones estructurales

- **GIVEN** una sesión con main y dos subagentes cerrados, todos con modelo atribuido
- **AND** `session_totals.finalized_runs: 3` y `session_totals.billable_hops: 12`
- **AND** la suma de `finalized_runs` en las cuatro filas de nivel es `3`
- **WHEN** se renderiza la fila de totales de la Tabla 2
- **THEN** la columna `# Workflows` de totales SHALL mostrar `3`
- **AND** la columna `# Steps` de totales SHALL mostrar `12`

#### Scenario: Hallazgo 2 — atribución única por main no infla la suma de filas

- **GIVEN** una sesión con un solo main cerrado y hops en dos modelos de distinto nivel
- **AND** `session_totals.finalized_runs: 1`
- **AND** la atribución de `finalized_runs` por nivel sigue el primer hop agéntico con `usage`
- **WHEN** se renderiza la fila de totales
- **THEN** la suma de `# Workflows` en las cuatro filas SHALL ser `1`
- **AND** la columna `# Workflows` de totales SHALL mostrar `1`

### Requirement: Tabla 2 — semántica de columnas para trabajo por nivel

La Tabla 2 («Trabajo por niveles de razonamiento») SHALL interpretar:

- `# Steps` ← `billable_hops` agregado por nivel (hops con `usage`, main y subagent, tiempo real).
- `# Workflows` ← `finalized_runs` agregado por nivel (ejecuciones cerradas atribuidas al `modelId` del primer hop `stepKind: agentic` con `usage` de cada ejecución).

Esta semántica SHALL aplicar a los **cuatro** niveles (Lite, Standard, Reasoning, Frontier). Los sub-workflows `kind: subagent` son ejecuciones de primera clase para ambas columnas. Los side-requests con `usage` contribuyen a `# Steps` y tokens pero no reciben `finalized_runs`.

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

### Requirement: Clasificación con vars ausentes (fallback heurístico por nivel)

`router-status` SHALL aplicar clasificación heurística por subcadena en `classifyModelWithEnv` de forma **independiente por nivel**: para cada nivel (`haiku` → Lite, `fable` → Frontier, `sonnet` → Standard, `opus` → Reasoning) cuya variable `ANTHROPIC_DEFAULT_*_MODEL` esté vacía o ausente, la clasificación usa el término correspondiente como substring del `modelId`. Los niveles con variable configurada siempre clasifican por coincidencia de variable, con independencia del estado de los otros niveles (configuración parcial).

#### Scenario: Fallback activo — todas las vars ausentes, modelIds estándar de Anthropic

- **GIVEN** `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL` y `ANTHROPIC_DEFAULT_FABLE_MODEL` están vacías o ausentes
- **AND** `session-metrics.json` contiene `modelId`s con `"haiku"`, `"sonnet"`, `"opus"` o `"fable"`
- **THEN** `classifyModelWithEnv` SHALL clasificar correctamente (Lite/Standard/Reasoning/Frontier)
- **AND** `aggregateSessionMetrics` SHALL retornar contadores `> 0` para esos niveles

#### Scenario: Fallback activo — modelo sin término conocido

- **GIVEN** las cuatro variables `ANTHROPIC_DEFAULT_*_MODEL` están vacías o ausentes
- **AND** `modelId` no contiene ninguno de los términos `haiku`, `sonnet`, `opus` ni `fable`
- **THEN** `classifyModelWithEnv` SHALL retornar `null` (el registro no se suma)

#### Scenario: Configuración parcial — fallback por nivel independiente

- **GIVEN** `ANTHROPIC_DEFAULT_HAIKU_MODEL` tiene valor no vacío (p. ej. `"claude-haiku-4-5"`)
- **AND** `ANTHROPIC_DEFAULT_SONNET_MODEL` está vacía o ausente
- **AND** `session-metrics.json` contiene modelos con `"haiku"` y modelos con `"sonnet"` en su `modelId`
- **THEN** los modelos con `"haiku"` SHALL clasificar por match de variable (Lite)
- **AND** los modelos con `"sonnet"` SHALL clasificar por keyword heurística (Standard)
- **AND** `aggregateSessionMetrics` SHALL retornar contadores `> 0` para ambos niveles

#### Scenario: Configuración parcial — solo Fable configurado

- **GIVEN** solo `ANTHROPIC_DEFAULT_FABLE_MODEL` tiene valor no vacío (p. ej. `"claude-fable-5"`)
- **AND** las demás variables `ANTHROPIC_DEFAULT_*_MODEL` están vacías o ausentes
- **AND** `session-metrics.json` contiene un `modelId` con `"claude-fable-5"` y otro con `"claude-opus-4-8"`
- **THEN** el modelo Fable SHALL clasificar por match de variable (Frontier)
- **AND** el modelo Opus SHALL clasificar por keyword heurística (Reasoning)

### Requirement: Campo `lastRenderedTable2Output` en `.statusline-state.json`

`router-status.ts` SHALL persistir el campo `lastRenderedTable2Output` (string, contenido textual exacto de la Tabla 2 con códigos ANSI y saltos de línea) tras renderizar la Tabla 2. La cadena SHALL terminar en `\n` para preservar el layout al reimprimir.

#### Scenario: Persistencia del render textual

- **GIVEN** una invocación que renderiza la Tabla 2 con 7 líneas de contenido (cabecera, 4 filas de nivel, separador, fila de totales)
- **WHEN** `writeStatuslineCache` persiste el estado
- **THEN** `.statusline-state.json` SHALL contener `"lastRenderedTable2Output": "<7 líneas separadas por \\n>\\n"` (string con 7 saltos de línea)

#### Scenario: Reimpresión preserva formato

- **GIVEN** `lastRenderedTable2Output` contiene la cadena exacta de un render previo con códigos ANSI
- **WHEN** una invocación posterior detecta mtime sin cambios y reimprime el cache
- **THEN** el output por stdout SHALL ser byte-idéntico al render original (mismos colores, bordes, alineación)

### Requirement: Caché por sesión (`.statusline-state.json`)

El statusline SHALL persistir estado ligero por sesión para mejorar la lectura entre re-invocaciones de Claude Code y para optimizar re-invocaciones cuando `session-metrics.json` no cambió (cierre temprano de Tabla 2). **No** sustituye a `session-metrics.json`.

| Aspecto   | Detalle                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| Ruta      | `sessions/<sessionDir>/.statusline-state.json`                                                                            |
| Lectura   | Al renderizar Tabla 1 (fallback de %) y Tabla 2 (cierre temprano + diff de celdas), si existe `sessionDir`                |
| Escritura | Tras renderizar Tabla 1 (`contextUsagePercentage` si stdin aportó valor usable), Tabla 2 (snapshot + render cacheado) |

El campo `metricsSnapshot` SHALL incluir entradas para `lite`, `standard`, `reasoning` y `frontier`.

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
