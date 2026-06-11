# statusline-live-refresh Specification (delta)

## ADDED Requirements

### Requirement: Statusline instalado con `refreshInterval` configurable

El instalador SHALL escribir el campo `statusLine.refreshInterval` con un valor entero (≥1, en segundos) en `~/.claude/settings.json` cuando instala el statusline del proxy, salvo que la variable de entorno `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL` indique omitirlo. Según la API de Claude Code, `refreshInterval` re-ejecuta el comando cada N segundos además de las actualizaciones por evento; el mínimo es `1`.

#### Scenario: Instalación por defecto

- **GIVEN** `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL` no está definida en el entorno del instalador
- **WHEN** el usuario ejecuta `npm run setup:install` (o el sub-comando de statusline)
- **THEN** `settings.statusLine.refreshInterval` SHALL ser el entero `3`

#### Scenario: Instalación con refreshInterval personalizado

- **GIVEN** `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL="2"` en el entorno del instalador
- **WHEN** el usuario ejecuta `npm run setup:install`
- **THEN** `settings.statusLine.refreshInterval` SHALL ser el entero `2`

#### Scenario: Instalación con refreshInterval desactivado

- **GIVEN** `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL="0"` en el entorno del instalador
- **WHEN** el usuario ejecuta `npm run setup:install`
- **THEN** `settings.statusLine` SHALL NO incluir el campo `refreshInterval`

### Requirement: Cierre temprano cuando `session-metrics.json` no cambió

Cuando `router-status` se invoca y `session-metrics.json` existe en la sesión, SHALL comparar el `mtime` Y el `size` del archivo con los valores cacheados en `.statusline-state.json` campo `lastRenderedMtimeMs` y `lastRenderedTable2Output` (la última cadena serializada del render). Si el `mtime` y `size` coinciden con el cache y `lastRenderedTable2Output` está presente, SHALL imprimir el último render cacheado desde `.statusline-state.json` y SHALL NOT re-renderizar la Tabla 2 desde cero.

#### Scenario: Sin cambios desde el último render

- **GIVEN** `.statusline-state.json` contiene `lastRenderedMtimeMs` igual al `mtime` actual de `session-metrics.json`
- **AND** el campo `lastRenderedTable2Output` contiene el último render serializado de la Tabla 2
- **WHEN** Claude Code invoca el script del statusline
- **THEN** SHALL imprimir el contenido de `lastRenderedTable2Output` sin re-renderizar desde `session-metrics.json`

#### Scenario: Archivo de métricas cambió

- **GIVEN** `.statusline-state.json` contiene `lastRenderedMtimeMs` distinto al `mtime` actual de `session-metrics.json`
- **OR** el campo `lastRenderedTable2Output` está ausente
- **WHEN** Claude Code invoca el script del statusline
- **THEN** SHALL re-renderizar la Tabla 2 desde cero leyendo `session-metrics.json`
- **AND** SHALL actualizar `lastRenderedMtimeMs` y `lastRenderedTable2Output` con los nuevos valores

#### Scenario: Archivo de métricas ausente

- **GIVEN** `session-metrics.json` no existe bajo `sessions/<session-id>/`
- **WHEN** Claude Code invoca el script del statusline
- **THEN** SHALL renderizar la Tabla 2 con valores en cero
- **AND** SHALL escribir el render cacheado en `.statusline-state.json` con `lastRenderedMtimeMs: 0`

#### Scenario: Cache ausente (primera invocación)

- **GIVEN** `.statusline-state.json` no existe bajo la sesión
- **WHEN** Claude Code invoca el script del statusline
- **THEN** SHALL re-renderizar la Tabla 2 desde cero (cierre temprano no aplica)
- **AND** SHALL escribir `.statusline-state.json` con `lastRenderedMtimeMs` y `lastRenderedTable2Output` al terminar

### Requirement: Indicador visual "● live (Ns)" en cabecera de Tabla 2

Cuando `refreshInterval` está activo (entero ≥ 1, en segundos) y la Tabla 2 está habilitada, SHALL mostrarse el texto `● live (Ns)` en la cabecera de la Tabla 2, alineado a la derecha, en color dim, donde `N` es el valor de `refreshInterval` configurado en `settings.statusLine.refreshInterval`.

#### Scenario: Modo live activo y Tabla 2 visible

- **GIVEN** `statusLine.refreshInterval` es `3` en `~/.claude/settings.json`
- **AND** `SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS` es `on`
- **WHEN** Claude Code invoca el script del statusline
- **THEN** la cabecera de la Tabla 2 SHALL incluir el texto `● live (3s)`

#### Scenario: Modo live desactivado

- **GIVEN** `statusLine.refreshInterval` está ausente en `~/.claude/settings.json`
- **AND** `SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS` es `on`
- **WHEN** Claude Code invoca el script del statusline
- **THEN** la cabecera de la Tabla 2 SHALL NO incluir el texto `● live`

#### Scenario: Tabla 2 oculta

- **GIVEN** `SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS` es `off` o ausente
- **WHEN** Claude Code invoca el script del statusline
- **THEN** el indicador `● live` SHALL NO renderizarse (la Tabla 2 no se imprime)

### Requirement: Cache `lastRenderedTable2Output` sincronizado con la sesión

El campo `lastRenderedTable2Output` SHALL contener la representación textual exacta (incluyendo códigos ANSI) de la última Tabla 2 renderizada, lista para imprimir por stdout. SHALL incluir el sufijo de nueva línea final para preservar el layout cuando se reimprime.

> **Nota de comportamiento — toggle de `STATUSLINE_ROUTER_DETAILS`**: cuando la variable `SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS` pasa de `on` a `off`, el script no renderiza la Tabla 2 ni actualiza el cache. El campo `lastRenderedTable2Output` previo permanece en disco. Si el usuario reactiva la variable a `on`, el cierre temprano podrá disparar re-impresión de la última tabla cacheada siempre que el `mtime` y `size` de `session-metrics.json` no hayan cambiado; si han cambiado, se re-renderiza normalmente. Este comportamiento es aceptable: una toggle no debe invalidar el cache mientras los datos no hayan cambiado.

#### Scenario: Cache contiene render válido

- **GIVEN** el último render de la Tabla 2 fue `╭─ ... ╮\n│ ... │\n╰─────╯`
- **WHEN** una invocación posterior detecta mtime sin cambios
- **THEN** SHALL imprimir el contenido cacheado byte por byte, preservando colores ANSI y bordes

#### Scenario: Cache corrupto (JSON inválido)

- **GIVEN** `.statusline-state.json` no es JSON válido
- **WHEN** Claude Code invoca el script del statusline
- **THEN** SHALL tratar el cache como ausente y re-renderizar desde cero
- **AND** SHALL sobrescribir el archivo de cache con valores frescos
