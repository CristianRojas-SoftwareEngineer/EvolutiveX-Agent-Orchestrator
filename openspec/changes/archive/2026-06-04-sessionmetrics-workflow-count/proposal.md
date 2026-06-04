## Why

La Tabla 2 del statusline muestra métricas de tokens por nivel de razonamiento (Lite/Standard/Reasoning) incluyendo `# Steps` (hops de inferencia), pero no expone cuántos **workflows main completados** corresponden a cada nivel. Sin esta columna, es imposible correlacionar el coste de tokens con los turnos reales del usuario por nivel.

## What Changes

- `IModelSessionMetrics` añade `workflow_count: number` (conteo de workflows main cerrados que usaron ese modelo).
- `ISessionTotals` añade `total_workflows: number` (suma global).
- `SessionMetricsService.updateFromWorkflow()` incrementa `workflow_count` en 1 por modelo al cierre de cada workflow main.
- `aggregateSessionMetrics()` en el statusline acumula `workflowCount` por nivel.
- `renderTokenTable()` muestra la columna `# Workflows` antes de `# Steps`.

## Capabilities

### New Capabilities

_(ninguna nueva capability; los cambios son todos en requisitos existentes)_

### Modified Capabilities

- `gateway-session-metrics`: añade `workflow_count` a `IModelSessionMetrics` e `ISessionTotals`; `updateFromWorkflow` incrementa el contador; `aggregateSessionMetrics` lo acumula; `renderTokenTable` lo renderiza.

## Impact

- **Capas PKA**: `1-domain` (tipos), `2-services` (SessionMetricsService), `5-user-interfaces` (statusline scripting).
- **Archivos clave**: `src/1-domain/types/gateway/session-metrics.types.ts`, `src/2-services/session-metrics.service.ts`, `scripting/router-status.ts`.
- **Persistencia**: `session-metrics.json` en sesiones existentes sin `workflow_count` → coercionado a `0` (retrocompatible).
- **Documentación**: `docs/router-statusline.md`, `docs/session-metrics-system.md`.
- **Tests**: `tests/2-services/session-metrics.service.test.ts`, `tests/scripting/router-status-metrics.test.ts`.
