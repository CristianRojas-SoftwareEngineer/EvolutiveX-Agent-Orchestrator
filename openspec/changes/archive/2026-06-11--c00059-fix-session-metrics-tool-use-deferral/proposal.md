## Why

La investigación forense de la sesión `b76b465c-5062-4036-b38f-b4e295699b38` demostró que `session-metrics.json` permaneció congelado ~27 minutos durante un turn agéntico largo: 68 de los 70 hops del turn (~97 % del consumo de tokens) cerraron con `stop_reason: 'tool_use'` y fueron invisibles para las métricas hasta el hook `Stop`.

La causa es la decisión D4 (MVP) del change archivado `2026-06-04--c00031-session-metrics-per-step`: el gate `isStepBillableForSessionMetrics` difiere los hops `tool_use` hasta `finalizeWorkflowMetrics`. Ese gate es **solo de timing, no de semántica**: el barrido idempotente de `finalizeWorkflowMetrics` encuentra esos mismos hops al cierre y los suma a `billable_hops` igualmente, por lo que el estado final es idéntico con o sin gate — solo cambia cuándo se vuelve visible.

La justificación original de D4 decayó: el handler SSE escribe `closedAt` y `usage` en el wireStep también para `tool_use` al finalizar el stream (`registerWireInference` en `audit-sse-response.handler.ts`), de modo que el step ya está completo y contable en el momento exacto en que el gate lo rechaza. No queda ninguna razón técnica para diferir su persistencia.

## What Changes

- Persistir per-step **todo** step de workflows `kind: 'main'` o `kind: 'subagent'` cerrado con `usage` válido, vía `SessionMetricsService.updateFromStep` (la idempotencia por `step.id` ya existe), independientemente de `stop_reason`.
- Eliminar `src/1-domain/services/gateway/is-step-billable-for-session-metrics.ts` y su test (dominio zombie: la única condición restante, `usage != null`, ya vive en `persistBillableStepMetricsIfNeeded`).
- Eliminar el parámetro `stopReason` de `persistBillableStepMetricsIfNeeded` y actualizar sus dos call sites (`audit-sse-response.handler.ts`, `audit-standard-response.handler.ts`).
- `finalizeWorkflowMetrics` conserva sin cambios su responsabilidad de `finalized_runs` y su barrido idempotente existente, que pasa a encontrar conjunto vacío en operación normal (reconciliación, no fallback nuevo).

## Capabilities

### New Capabilities

_(ninguna)_

### Modified Capabilities

- `gateway-session-metrics`: la actualización per-step SHALL aplicarse a todo step cerrado con `usage` de workflows `main`/`subagent`, sin gate por stop terminal; `tool_use` cuenta al cerrar el stream.

## Impact

| Área | Detalle |
|------|---------|
| **Capa 1** | Borrado de `is-step-billable-for-session-metrics.ts` (dominio zombie) |
| **Capa 3** | `persist-billable-step-metrics.util.ts` (firma sin `stopReason`) + 2 call sites en `audit-sse-response.handler.ts` y `audit-standard-response.handler.ts` |
| **Tests** | `tests/1-domain/gateway/is-step-billable-for-session-metrics.test.ts` (borrado), `tests/3-operations/persist-billable-step-metrics.util.test.ts` (caso `tool_use` invertido) |
| **Docs** | `docs/session-metrics-system.md` §Escritura (SessionMetricsService) |
| **Métricas** | Estado final agregado idéntico al actual; cambia el *timing* de visibilidad, no la semántica |

## No objetivos

- Cambiar el schema de `session-metrics.json`.
- Cambiar la semántica de `finalized_runs` ni su atribución de modelo.
- Renombrar `billable_hops` ni `persist-billable-step-metrics.util.ts` (todo hop con `usage` factura tokens upstream).
- Tocar `scripting/router-status.ts`: el statusline se beneficia solo por el `mtime` actualizado de `session-metrics.json`.
