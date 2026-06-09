---
case_id: 20260608-proxy-step-request-response-split
profile: corrective
phase: 16-solution-analysis
chain: solution
version: v1.0
timestamp: 2026-06-08T13:15:00Z
status: done
inputs: [15-solution-data-collection.md]
produces: 16-solution-analysis.md
links: { previous: 15-solution-data-collection.md, next: 17-conclusion.md }
---

# Solution Analysis — 20260608-proxy-step-request-response-split

## Applied policy

- **acceptance:** ganadora con justificación

## Verdict

| Hipótesis | Resultado | Justificación |
|-----------|-----------|---------------|
| S-A | **Ganadora** | 5/5 tests PASS; diff mínimo en 3 archivos fuente + 1 test |
| S-B | Descartada | Riesgo de race ingress/egress |
| S-C | Descartada | Contradice diseño canónico |

## Diff mínimo

- `enrichOpenWireStepWithResponse` reemplaza segundo `registerStep` en egress.
- `resolveOpenWireStepIndex` corrige off-by-one en `stream_chunk`.

## Solución ganadora

**S-A — Enriquecer step abierto en egress.** Un hop HTTP produce un `IStep` con `inferenceRequest` (ingress) y `assistantMessage` (egress), proyectado a `steps/MM/request/` + `steps/MM/response/` en disco.

## Acceptance check

`## Solución ganadora` presente con descartes justificados.
