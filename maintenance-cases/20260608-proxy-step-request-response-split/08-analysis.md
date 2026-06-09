---
case_id: 20260608-proxy-step-request-response-split
profile: corrective
phase: 08-analysis
chain: cause
version: v1.0
timestamp: 2026-06-08T12:40:00Z
status: done
inputs: [07-data-collection.md]
produces: 08-analysis.md
links: { previous: 07-data-collection.md, next: 11-solution-research.md }
---

# Analysis — 20260608-proxy-step-request-response-split

## Applied policy

- **acceptance:** ## Causa confirmada presente o refutación explícita

## Verdict

| Hipótesis | Resultado | Evidencia |
|-----------|-----------|-----------|
| H1 | **Confirmada** | Doble `registerStep` en ingress/egress; sesión con 2× carpetas por hop; código en `audit-workflow.handler.ts` + `gateway-wire-step.util.ts` |

## Magnitud

- Impacto: **alto** en navegabilidad de auditoría y coherencia métricas.
- Blast radius del fix: **bajo** — cambio localizado en util wire-step y handlers egress.

## Amenazas a validez

- Hops sin request previo (edge case): requiere fallback si no hay step abierto.
- `tool_use` stop: step debe permanecer abierto sin `closedAt` hasta continuation.

## Causa confirmada

La migración gateway separó ingress y egress sin reunificar el modelo `IStep`. `registerWireStepRequest` abre un step; `registerWireStepInCorrelator` registra otro en lugar de enriquecer el abierto. `SessionPersistence` proyecta cada uno a un `stepIndex` distinto, produciendo carpetas alternadas.

## Acceptance check

`## Causa confirmada` presente; H1 confirmada con evidencia.
