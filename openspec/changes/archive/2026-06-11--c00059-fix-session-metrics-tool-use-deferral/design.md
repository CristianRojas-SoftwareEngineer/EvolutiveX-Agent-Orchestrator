## Context

**Estado actual**

`persistBillableStepMetricsIfNeeded` (`src/3-operations/persist-billable-step-metrics.util.ts`) aplica tres guardas antes de invocar `SessionMetricsService.updateFromStep`:

1. `workflow.kind` ∈ {`main`, `subagent`} (G16′ — se conserva);
2. `isStepBillableForSessionMetrics(stopReason)` — **el gate a eliminar**: rechaza `tool_use` y acepta stops terminales (`end_turn`, `max_tokens`, `null`, `''`);
3. `step.usage != null` (se conserva).

El gate proviene de la decisión D4 (MVP) del change archivado `2026-06-04--c00031-session-metrics-per-step`. Su efecto real es **diferir**, no excluir: `finalizeWorkflowMetrics` barre al cierre todos los steps cerrados con `usage` no aplicados y los suma a `billable_hops`. El estado final agregado es idéntico con o sin gate.

**Evidencia (sesión `b76b465c-5062-4036-b38f-b4e295699b38`)**

| Fuente | Hallazgo |
|--------|----------|
| `session-metrics.json` | Congelado ~27 minutos durante el turn agéntico largo |
| Turn observado | 68 de 70 hops cerraron con `stop_reason: 'tool_use'` (~97 % del consumo de tokens invisible hasta el hook `Stop`) |
| `session-metrics-applied.json` | Aritmética verificada de los 13 `applied_step_ids`: 4 de turn-1 + 8 de turn-2 + 1 de turn-3 |
| Step 06 de turn-2 | Error upstream sin `usage`, correctamente excluido (la guarda `usage` lo cubre, no el gate) |
| Diagnóstico previo | Los 7 steps "sospechosos" eran hops `tool_use` reales diferidos por D4, no un defecto de idempotencia |

**Por qué la justificación de D4 decayó:** el handler SSE escribe `closedAt` y `usage` en el wireStep también para `tool_use` (`registerWireInference` en `audit-sse-response.handler.ts:227-269`), de modo que el step ya está completo y contable en el momento exacto en que el gate lo rechaza.

## Goals / Non-Goals

**Goals:**

- Todo step de workflows `main`/`subagent` cerrado con `usage` válido SHALL persistirse per-step vía `updateFromStep`, sin condición de `stop_reason`.
- Eliminar el dominio zombie (`is-step-billable-for-session-metrics.ts`) y la firma muerta (`stopReason` en el util).
- Invariante de neutralidad: el estado final agregado de `session-metrics.json` SHALL ser idéntico al actual (cambio de *timing*, no de semántica).

**Non-Goals:**

- Cambiar schema de `session-metrics.json` ni semántica de `finalized_runs`.
- Renombrar `billable_hops` o el util.
- Tocar `scripting/router-status.ts` (statusline).
- Modificar el barrido de `finalizeWorkflowMetrics`.

## Decisions

### D1 — Eliminar `is-step-billable-for-session-metrics.ts` y su test, no simplificarlo

**Decisión:** Borrar `src/1-domain/services/gateway/is-step-billable-for-session-metrics.ts` y `tests/1-domain/gateway/is-step-billable-for-session-metrics.test.ts`.

**Alternativa descartada:** simplificar la función a `usage != null` — rechazada por zombie: esa condición ya vive en `persistBillableStepMetricsIfNeeded` (`step.usage == null → return`); conservar una función de dominio que la duplique es estado duplicado sin caller que la necesite.

### D2 — Conservar el barrido de `finalizeWorkflowMetrics` tal cual

**Decisión:** No tocar `finalizeWorkflowMetrics`. Su barrido de steps cerrados con `usage` no aplicados **no es un fallback nuevo**: es la reconciliación idempotente existente (sidecar `session-metrics-applied.json` por `step.id`), que tras este change pasa a encontrar conjunto vacío en operación normal y sigue cubriendo cualquier step que el path per-step no haya alcanzado (p. ej. crash entre cierre de step y escritura).

**Alternativa descartada:** eliminar el barrido por "redundante" — rechazada: perdería la reconciliación ante fallos parciales sin ganar simplicidad real (el código ya existe y es idempotente).

### D3 — Eliminar el parámetro `stopReason` de `persistBillableStepMetricsIfNeeded`

**Decisión:** La firma queda `(sessionMetrics, auditBaseDir, workflow, step)`. Actualizar los dos call sites:

- `src/3-operations/audit-sse-response.handler.ts:271` (dentro de `registerWireInference`);
- `src/3-operations/audit-standard-response.handler.ts:166` (rama `if (bodyUsage)`).

**Rationale:** sin gate, `stopReason` no participa en ninguna decisión del util; conservarlo sería firma muerta.

### D4 — Conservar nombres `billable_hops` y `persist-billable-step-metrics.util.ts`

**Decisión:** No renombrar. La semántica de "billable" se mantiene exacta: todo hop cerrado con `usage` factura tokens upstream, incluido `tool_use`. El nombre describe la condición real (`usage` presente), no el gate eliminado.

## Risks / Trade-offs

| Riesgo | Mitigación |
|--------|------------|
| ~1 escritura de `session-metrics.json` por hop en vez de ~1 por stop terminal | `writeQueue` serializada + escritura atómica (temp + rename) ya existentes; el sidecar de idempotencia absorbe reintentos |
| Divergencia transitoria con sesiones grabadas antes del change | Ninguna migración necesaria: el estado final es idéntico; solo cambia el timing de visibilidad |
| Regresión en neutralidad agregada | Invariante verificable: tras `Stop`, `billable_hops` y tokens SHALL coincidir con lo que produce el flujo actual para la misma secuencia de hops |

## Migration Plan

1. Borrar dominio zombie y su test (capa 1).
2. Quitar gate y parámetro en el util (capa 3) + actualizar call sites.
3. Ajustar tests del util; `npm run test:quick`.

**Rollback:** revert del change; sin migración de datos.

## Open Questions

_(ninguna — evidencia y alcance cerrados en la investigación forense previa)_
