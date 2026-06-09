---
case_id: 20260608-proxy-step-request-response-split
profile: corrective
phase: 12-solution-hypothesis
chain: solution
version: v1.0
timestamp: 2026-06-08T12:55:00Z
status: done
inputs: [11-solution-research.md]
produces: 12-solution-hypothesis.md
links: { previous: 11-solution-research.md, next: 13-solution-experiment-design.md }
---

# Solution Hypothesis — 20260608-proxy-step-request-response-split

## Applied policy

- **acceptance:** ≥1 hipótesis falsable + criterios

## Hypotheses

| ID | Hipótesis | Predicción | Blast radius |
|----|-----------|------------|--------------|
| S-A | Enriquecer el último step sin `closedAt` en egress unifica request/response | 1 carpeta `steps/MM/` por hop; test `gateway-wire-step.util.test.ts` verde | Bajo — 3 archivos |

## Active

**S-A** — conservadora, alineada al diseño.

## Acceptance check

1 hipótesis con criterio falsable.
