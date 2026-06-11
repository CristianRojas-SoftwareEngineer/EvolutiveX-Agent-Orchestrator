# statusline-runtime Specification (delta)

## MODIFIED Requirements

### Requirement: Caché por sesión (`.statusline-state.json`)

El statusline SHALL persistir estado ligero por sesión para mejorar la lectura entre re-invocaciones de Claude Code y para soportar el cierre temprano del modo live refresh. **No** sustituye a `session-metrics.json`.

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

## ADDED Requirements

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

### Requirement: Cabecera de Tabla 2 con indicador "● live (Ns)"

Cuando `refreshInterval` está activo (entero ≥ 1, en segundos) y la Tabla 2 está habilitada, `router-status.ts` SHALL añadir el texto `● live (Ns)` en la cabecera de la Tabla 2, donde `N` es el valor de `refreshInterval` leído de `settings.statusLine.refreshInterval`.

#### Scenario: Indicador visible con refreshInterval activo

- **GIVEN** `settings.statusLine.refreshInterval` es `3`
- **AND** `SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS` es `on`
- **WHEN** `buildStatuslineOutput` renderiza la Tabla 2
- **THEN** la primera línea (cabecera) de la Tabla 2 SHALL contener el sufijo `● live (3s)` en color dim, alineado a la derecha antes del cierre del borde superior

#### Scenario: Indicador oculto con refreshInterval desactivado

- **GIVEN** `settings.statusLine.refreshInterval` está ausente
- **AND** `SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS` es `on`
- **WHEN** `buildStatuslineOutput` renderiza la Tabla 2
- **THEN** la cabecera de la Tabla 2 SHALL NO contener el sufijo `● live`

#### Scenario: Lectura de refreshInterval desde settings

- **GIVEN** `settings.statusLine.refreshInterval` es `5`
- **WHEN** `buildStatuslineOutput` lee el valor
- **THEN** SHALL usar el entero `5` en el sufijo, mostrando `● live (5s)`
