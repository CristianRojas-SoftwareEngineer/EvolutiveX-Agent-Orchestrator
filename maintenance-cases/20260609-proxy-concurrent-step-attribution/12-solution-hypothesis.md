---
case_id: 20260609-proxy-concurrent-step-attribution
profile: corrective
phase: 12-solution-hypothesis
chain: solution
version: v1.0
timestamp: 2026-06-09T10:50:00Z
status: done
inputs: [11-solution-research.md]
produces: 12-solution-hypothesis.md
links: { previous: 11-solution-research.md, next: 13-solution-experiment-design.md }
---

# Solution Hypothesis — 20260609-proxy-concurrent-step-attribution

## Applied policy

- **acceptance:** ≥1 hipótesis falsable + criterios

## Hypotheses

### S-A — Enriquecer por índice asignado en ingress

- **Predicción:** Con dos steps abiertos, cada egress con `assignedStepIndex` N enriquece `workflow.steps.find(s => s.index === N)`.
- **Refutación:** Test concurrente sigue mostrando cross-wiring tras el cambio.
- **Blast radius:** `gateway-wire-step.util.ts`, `audit-sse-response.handler.ts`, `audit-standard-response.handler.ts`, tests.
- **Reversibilidad:** Revert de 3 archivos.

### S-B — Lock egress (descartada en diseño, incluida para comparación)

- **Predicción:** Serialización evita race en enrich.
- **Refutación:** `stream_chunk` emitido con índice capturado al inicio del handler sigue incorrecto.
- **Blast radius:** medio.

### S-C — Mitigación protocolo (descartada)

- **Predicción:** Sin concurrencia, sin bug.
- **Refutación:** Harness seguirá disparando ai-title en paralelo.

## Acceptance check

Tres hipótesis con criterios; S-A priorizada.
