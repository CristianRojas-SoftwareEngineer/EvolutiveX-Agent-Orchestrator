---
case_id: 20260608-proxy-step-request-response-split
profile: corrective
phase: 11-solution-research
chain: solution
version: v1.0
timestamp: 2026-06-08T12:50:00Z
status: done
inputs: [08-analysis.md]
produces: 11-solution-research.md
links: { previous: 08-analysis.md, next: 12-solution-hypothesis.md }
---

# Solution Research — 20260608-proxy-step-request-response-split

## Applied policy

- **acceptance:** ≥2 candidatas viables

## Candidates

| ID | Candidata | Tradeoffs | Viable |
|----|-----------|-----------|--------|
| A | **Enriquecer step abierto** en egress (`enrichOpenWireStepWithResponse`) | Alineada al diseño; diff mínimo; requiere step abierto de ingress | ✓ |
| B | **Solo emit `step_request` sin `registerStep`** en ingress; egress registra único `IStep` | Menos estado en correlador; rompe tool linkage si response llega antes | ✗ (race) |
| C | **Documentar modelo dual** (request-step / response-step) | Cero código; contradice diseño canónico | ✗ |

## Recall

Exploración previa (`/openspec-explore`) recomendó Opción A como alineada a `session-audit-model.md`.

## Acceptance check

2+ candidatas evaluadas; A viable y preferida.
