## Context

Post-`unify-turn-workflow`, un turno de usuario concentra hops HTTP (`side-request`, `agentic` fresh, continuaciones) bajo un único `workflowId`. El harness Claude Code dispara en ráfaga `ai-title` (side-request) junto al primer hop agentic.

**Estado actual:**
- Ingress (`AuditWorkflowHandler.registerWireStepRequest`) asigna `assignedStepIndex` y lo propaga vía `AuditWorkflowResult` → `proxy.controller` → `AuditWorkflowContext`.
- Egress (`AuditSseResponseHandler`, `AuditStandardResponseHandler`) ignora ese índice y usa `resolveOpenWireStepIndex` / `enrichOpenWireStepWithResponse`, que seleccionan el **último** step sin `closedAt`.
- Con dos steps abiertos, las respuestas se cruzan (sesión `52f8f157`).

**Restricciones:** sin cambios de protocolo harness; sin serialización global de egress; preservar coalesced continuations y fallback sin step abierto.

## Goals / Non-Goals

**Goals:**
- Correlación estable request→response por hop bajo concurrencia.
- `stream_chunk.stepIndex` y `step_response.stepIndex` alineados con ingress.
- Test de regresión automatizado.
- Delta spec en `gateway-audit-projection`.

**Non-Goals:**
- Migrar sesiones históricas con cross-wiring.
- Corregir métricas `total_workflows`.
- Forzar orden de llegada de requests en el cliente.

## Decisions

### D1 — Enriquecer por `assignedStepIndex` (no heurística global)

**Decisión:** Añadir `enrichWireStepWithResponseByIndex(repo, workflowId, stepIndex, patch, stopReason)` que localiza `workflow.steps.find(s => s.index === stepIndex && s.closedAt == null)` (o sin filtro closedAt si el step aún está abierto).

**Alternativas:**
- *Lock egress por workflow* — no corrige `stream_chunk` si el índice se fija mal al inicio.
- *UUID de step en context* — más robusto pero duplica `assignedStepIndex` ya estable.

### D2 — SSE: `stepIndex` desde context, no snapshot heurístico

**Decisión:** En `AuditSseResponseHandler`, usar `context.assignedStepIndex` para todos los `stream_chunk` y para invocar enrich por índice.

**Rationale:** El índice es inmutable por request HTTP; capturar `resolveOpenWireStepIndex` al inicio del handler es incorrecto cuando otro hop abre un step posterior durante el stream.

### D3 — Fallback heurístico solo sin step en índice

**Decisión:** Si `enrichWireStepWithResponseByIndex` no encuentra step, fallback a `enrichOpenWireStepWithResponse` (comportamiento actual) para edge cases sin ingress previo.

### D4 — Standard handler: misma regla

**Decisión:** `AuditStandardResponseHandler` pasa `context.assignedStepIndex` al enrich por índice.

## Risks / Trade-offs

| Riesgo | Mitigación |
|--------|------------|
| `assignedStepIndex` desincronizado con correlador | Ingress ya es única fuente; añadir assert en test |
| Coalesced continuation usa índice distinto | Preservar rama `coalescedAgentContinuation`; no tocar |
| Step ya cerrado cuando llega response tardía | Fallback heurístico + log opcional |

## Migration Plan

1. Implementar util + handlers.
2. Añadir test concurrente.
3. `npm run test:quick`.
4. Validar sesión real opcional post-deploy.

**Rollback:** revert del change; sin migración de datos.

## Open Questions

_(ninguna — S-A validada en caso SM 20260609)_
