## Why

La Tabla 2 del statusline de Claude Code (`router-status.ts`) lee `session-metrics.json`, pero ese archivo solo se actualiza al cerrar un workflow **main** (hook `Stop`). Durante un workflow con varios hops de inferencia, el usuario ve contadores (# Steps, tokens) congelados y un salto brusco al final del turno. Eso contradice la expectativa de “progreso por step” y desaprovecha que el proxy ya registra cada hop en el correlador antes del cierre.

## What Changes

- Actualizar `session-metrics.json` de forma **incremental** cuando un step contable del workflow **main** queda cerrado con `usage` válido (tras cada hop terminal en el wire), no solo en el cierre del workflow.
- Mantener `workflow_count` y `total_workflows` con semántica actual: incremento **solo** al cierre del workflow main (invariante G16).
- Evitar **doble conteo** al cierre: el path de `updateFromWorkflow` en hooks debe reconciliarse con lo ya persistido por step (p. ej. solo `workflow_count` + steps no contabilizados, o retirar la acumulación duplicada de steps/tokens en cierre).
- Documentar en `docs/session-metrics-system.md` el nuevo momento de escritura y la relación statusline ↔ proxy.
- Tests de `SessionMetricsService`, wire/correlador y, si aplica, statusline de lectura.

## Capabilities

### New Capabilities

_(ninguna — el comportamiento extiende capacidades gateway y statusline existentes)_

### Modified Capabilities

- `gateway-session-metrics`: escritura per-step de contadores (`count`, tokens, `cache_efficiency`); `workflow_count` sigue solo en cierre main; idempotencia por step.
- `gateway-audit-projection`: ajuste de `delegateClosure` / cierre main para no duplicar métricas ya volcadas por step.
- `statusline-runtime`: aclarar que Tabla 2 refleja `session-metrics.json` actualizado intra-workflow cuando el proxy persiste por step (sin cambiar el contrato de lectura del script).

## Impact

| Área | Detalle |
|------|---------|
| **Capas PKA** | 1-domain (`aggregateWorkflowUsageByModel` o helper per-step), 2-services (`SessionMetricsService`), 3-operations (`gateway-wire-step.util`, `audit-hook-event.handler`), tests en `tests/2-services` y `tests/3-operations` |
| **Artefactos en disco** | `sessions/<id>/session-metrics.json` (más escrituras, misma forma §28.2) |
| **Statusline** | Sin cambio obligatorio en `router-status.ts` si la fuente se actualiza a tiempo; posible nota en `docs/router-statusline.md` |
| **Fuera de alcance** | Frecuencia de refresh de Claude Code; escaneo de `workflows/*/steps` desde el statusline; métricas de sub-workflows en `session-metrics.json` |

## No objetivos

- Reintroducir escaneo O(N) de `meta.json` / interacciones para el statusline.
- Exponer endpoint HTTP de métricas en vivo para el statusline.
- Cambiar el toggle `SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS` ni el layout de tablas.
- Contabilizar `client-preflight` en métricas de sesión.
