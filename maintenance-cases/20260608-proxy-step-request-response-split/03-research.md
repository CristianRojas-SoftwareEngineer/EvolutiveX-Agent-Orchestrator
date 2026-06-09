---
case_id: 20260608-proxy-step-request-response-split
profile: corrective
phase: 03-research
chain: cause
version: v1.0
timestamp: 2026-06-08T12:15:00Z
status: done
inputs: [02-problem-definition.md]
produces: 03-research.md
links: { previous: 02-problem-definition.md, next: 04-hypothesis.md }
---

# Research — 20260608-proxy-step-request-response-split

## Applied policy

- **focus:** regresiones recientes + recall por defect-class
- **acceptance:** recall ejecutado; fuentes citadas

## Related commits / changes

| Change | Relevancia |
|--------|------------|
| `fix-proxy-audit-causal-gaps` (archivado 2026-06-08) | Eliminó emit `step_request` desde `registerStep`; corrigió off-by-one en `stepIndex` del evento — pero **no** unificó request/response en un solo `IStep`. |
| `fix-proxy-tool-result-metrics` (archivado 2026-06-08) | Añadió `finalizeWorkflowMetrics` post-SSE; no tocó estructura de steps. |
| Migración gateway (2026-06) | Separó handlers L3 ingress (`AuditWorkflowHandler`) y egress (`AuditSseResponseHandler`), cada uno con su propio `registerStep`. |

## Code refs

- `registerWireStepRequest` — crea `IStep` stub + emit `step_request` (ingress).
- `buildWireStep` + `registerWireStepInCorrelator` — crea segundo `IStep` + cierra (egress).
- `SessionPersistence.onStepRequest/onStepResponse` — proyecta a disco según `stepIndex` independiente.

## Recalled lessons

- `.claude/memory/proxy-audit-step-request-emit-2026-06.md`: solo handlers L3 emiten `step_request` con body real; el correlador no debe emitir sintético. La lección no aborda la duplicación de `IStep`.

## Design authority

`docs/session-audit-model.md` §2: «cada step agrupa un hop de inferencia» con `request/` y `response/` bajo el mismo `steps/MM/`.

## Acceptance check

Fuentes citadas; recall ejecutado; línea temporal de regresión identificada (migración gateway sin reunificación).
