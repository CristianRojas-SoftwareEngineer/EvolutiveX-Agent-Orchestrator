---
case_id: 20260608-proxy-step-request-response-split
profile: corrective
phase: 04-hypothesis
chain: cause
version: v1.0
timestamp: 2026-06-08T12:20:00Z
status: done
inputs: [03-research.md]
produces: 04-hypothesis.md
links: { previous: 03-research.md, next: 05-experiment-design.md }
---

# Hypothesis — 20260608-proxy-step-request-response-split

## Applied policy

- **acceptance:** ≥1 hipótesis falsable

## Candidates

| ID | Hipótesis | Predicción | Criterio refutación | Status |
|----|-----------|------------|---------------------|--------|
| H1 | Ingress y egress registran `IStep` independientes con `index = workflow.steps.length` en cada fase | 2N steps en memoria; carpetas alternadas request/response | Unificar egress para enriquecer el step abierto sin `registerStep` adicional → 1 step por hop | pending |

## Active hypothesis

**H1:** La desalineación es causada por doble `registerStep` (request stub en `AuditWorkflowHandler`, response completo en `registerWireStepInCorrelator`).

## Acceptance check

1 hipótesis falsable con predicción y criterio de refutación.
