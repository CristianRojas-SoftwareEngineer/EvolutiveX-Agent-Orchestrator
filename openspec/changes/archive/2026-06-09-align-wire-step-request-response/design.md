## Context

Migración gateway separó handlers L3 ingress (`AuditWorkflowHandler`) y egress (`AuditSseResponseHandler`). Fixes previos (`fix-proxy-audit-causal-gaps`) corrigieron emits duplicados y off-by-one en eventos, pero no reunificaron el modelo `IStep`.

## Goals / Non-Goals

**Goals:**
- Un hop HTTP → un `IStep` → una carpeta `steps/MM/` con `request/` y `response/`.
- `stepCount` coherente con steps cerrados en workflows terminales.

**Non-Goals:**
- Reducir workflows wire múltiples por prompt.
- Migrar sesiones históricas en disco.

## Decisions

### D1 — Enriquecer step abierto (Opción A)

`registerWireStepRequest` sigue abriendo el step en ingress. Egress llama `enrichOpenWireStepWithResponse` sobre el último step sin `closedAt` en lugar de `registerStep` adicional.

**Alternativa descartada:** solo emit `step_request` sin `registerStep` (riesgo race si response llega antes).

### D2 — `resolveOpenWireStepIndex`

Al inicio del stream SSE, `projectedStepIndex` apunta al step abierto (`openStep.index`), no a `workflow.steps.length`.

### D3 — Fallback en egress

Si no hay step abierto (edge case), `registerWireStepInCorrelator` mantiene comportamiento de registro nuevo.

## Risks / Trade-offs

- Steps con `stopReason: tool_use` permanecen abiertos (comportamiento previo preservado).
- Sesiones grabadas antes del fix conservan layout dual en disco.
