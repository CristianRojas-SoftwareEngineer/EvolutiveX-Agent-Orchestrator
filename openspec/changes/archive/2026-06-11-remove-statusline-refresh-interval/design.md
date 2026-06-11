## Context

El change `2026-06-11-statusline-live-refresh` entregó dos piezas acopladas en un solo PR:

1. **Timer `refreshInterval`** en el instalador + indicador `● live` — workaround para Tabla 2 «congelada».
2. **Cierre temprano** con caché `mtime`/`size` en `.statusline-state.json` — optimización en cada invocación.

Tras corregir la causa raíz de la Tabla 2 estática, el timer ya no resuelve un problema real del proxy. El cierre temprano sigue amortizando invocaciones redundantes en los triggers nativos de Claude Code (mensaje del asistente, `/compact`, permisos, vim).

Estado actual del código:

| Componente | Ubicación | Acción |
|------------|-----------|--------|
| `resolveRefreshInterval` | `claude-settings.ts` | Eliminar |
| Parámetro `refreshInterval` en install | `statusline.ts`, `setup.ts` | Revertir firma |
| `readRefreshIntervalFromSettings`, `liveIndicator` | `router-status.ts` | Eliminar |
| `canUseTable2EarlyExit`, `lastRendered*` | `router-status.ts` | **Conservar** |

El usuario confirmó: `refreshInterval` manual en `settings.json` queda **fuera del alcance** (ignorar sin leer); la documentación puede mencionar la API genérica de Claude Code pero el instalador **no** debe escribir el campo.

## Goals / Non-Goals

**Goals:**

- Simplificar el instalador y el contrato del statusline eliminando timer, env var e indicador live.
- Mantener intacto el cierre temprano y la caché de Tabla 2.
- Retirar la capability `statusline-live-refresh` sin perder requirements de caché en `statusline-runtime`.
- Documentar cierre temprano en §4.4 y aclarar en §9 que `refreshInterval` es API de Claude Code no gestionada por este proyecto.

**Non-Goals:**

- Leer o mostrar `refreshInterval` aunque exista en `settings.json` del usuario.
- Forzar borrado del campo en instalaciones que no re-ejecuten `setup:install`.
- PR-2 Bun (pre-compilación condicionada a CPU con timer).
- Cambiar `metricsSnapshot`, `contextUsagePercentage` ni otras claves de `.statusline-state.json`.

## Decisions

### Decisión 1 — Instalador sin `refreshInterval`

**Elección:** `buildStatusLineBlock(command)` retorna solo `{ type, command, padding }`. `applyStatuslineInstall` deja de aceptar parámetro de cadencia.

**Por qué:** El proyecto no promueve refresh periódico; la configuración añadía superficie (`SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL`) sin beneficio tras el fix de métricas.

**Alternativa descartada:** Mantener env var como opt-out del default `3`. Ya no hay default que desactivar.

### Decisión 2 — Ignorar `refreshInterval` del usuario (out of scope)

**Elección:** Eliminar `readRefreshIntervalFromSettings` y toda lógica que lea `settings.statusLine.refreshInterval`. Sin warning ni indicador.

**Por qué:** Decisión de producto: fuera del alcance del proxy. Si el usuario configura el campo manualmente, Claude Code puede honrarlo según su API; el script del proxy no participa.

### Decisión 3 — Conservar cierre temprano

**Elección:** No tocar `readSessionMetricsMtime`, `canUseTable2EarlyExit`, `lastRenderedMtimeMs`, `lastRenderedMetricsSize`, `lastRenderedTable2Output`.

**Por qué:** Sigue útil cuando Claude Code dispara el statusline varias veces sin cambio en `session-metrics.json` (~5–10 ms vs re-agregar + render).

### Decisión 4 — Retirar capability `statusline-live-refresh`

**Elección:** Delta REMOVED con todos los requirements de esa spec; requirements de cierre temprano permanecen solo en `statusline-runtime` (ya duplicados allí desde el archive original).

**Alternativa descartada:** Renombrar a `statusline-table2-cache`. El nombre `live-refresh` ancla al timer; mejor eliminar la capability.

### Decisión 5 — Documentación: mencionar API, no implementar

**Elección:** En `docs/router-statusline.md` §9, nota de una línea: Claude Code admite `statusLine.refreshInterval` opcional; este proyecto no lo escribe en `setup:install`. Mover explicación de cierre temprano de §10.1 a §4.4; eliminar §10.1 «Live refresh».

## Risks / Trade-offs

- **[Usuarios que reinstalaron con `refreshInterval: 3`]** → Mitigación: próximo `setup:install --statusline` reescribe el bloque sin el campo; comportamiento vuelve a triggers nativos.
- **[Duplicación de requirements entre specs al archivar]** → Mitigación: REMOVED en `statusline-live-refresh` solo retira esa spec; `statusline-runtime` conserva caché como fuente canónica.
- **[Tests que pasan `3` explícito a `applyStatuslineInstall`]** → Mitigación: actualizar firmas en `statusline.test.ts` en el mismo PR de apply.
- **[Pérdida de actualización per-step en idle]** → Trade-off aceptado: era el objetivo del timer; la causa raíz ya está corregida.

## Migration Plan

### Despliegue

1. Merge del change + `openspec-apply` + archive.
2. Opcional para quien tenga `refreshInterval` en settings: `npm run setup:install -- --statusline` (reescribe `statusLine` sin el campo).
3. Sin migración de `.statusline-state.json`.

### Rollback

- `git revert` + reinstalar. Sin estado huérfano en disco de sesiones.

## Open Questions

_(ninguna — decisiones de producto cerradas en la exploración previa)_
