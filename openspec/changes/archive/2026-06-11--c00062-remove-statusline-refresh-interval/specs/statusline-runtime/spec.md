# statusline-runtime Specification (delta)

## MODIFIED Requirements

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
- **AND** SHALL NOT invocar `aggregateSessionMetrics`

#### Scenario: Re-render por cambio en métricas

- **GIVEN** el `mtime` o `size` de `session-metrics.json` difiere del cache
- **WHEN** Claude Code invoca el script del statusline
- **THEN** SHALL re-renderizar la Tabla 2 desde `session-metrics.json`
- **AND** SHALL actualizar `lastRenderedMtimeMs`, `lastRenderedTable2Output` y `metricsSnapshot` en `.statusline-state.json`

## REMOVED Requirements

### Requirement: Cabecera de Tabla 2 con indicador "● live (Ns)"

**Reason**: El indicador documentaba el modo timer (`refreshInterval`), que el proyecto deja de soportar. El script no lee `refreshInterval` del usuario.

**Migration**: Eliminar `readRefreshIntervalFromSettings`, el parámetro `liveIndicator` en `renderTokenTable` y el sufijo `● live (Ns)`. Eliminar `tests/scripting/router-status-live-indicator.test.ts`.
