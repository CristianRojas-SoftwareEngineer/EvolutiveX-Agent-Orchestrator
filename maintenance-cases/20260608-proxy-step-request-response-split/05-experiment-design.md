---
case_id: 20260608-proxy-step-request-response-split
profile: corrective
phase: 05-experiment-design
chain: cause
version: v1.0
timestamp: 2026-06-08T12:25:00Z
status: done
inputs: [04-hypothesis.md]
produces: 05-experiment-design.md
links: { previous: 04-hypothesis.md, next: 06-experiment-execution.md }
---

# Experiment Design — 20260608-proxy-step-request-response-split

## Applied policy

- **focus:** test que reproduce el bug primero + rollback
- **risk_controls:** sandbox

## Protocol

### E1 — Reproducción H1 (doble registerStep)

1. Abrir workflow wire (`openWorkflow` con `forceNew`).
2. Simular ingress: `registerStep` con step stub (request, `assistantMessage` vacío).
3. Simular egress: `registerWireStepInCorrelator` con step de respuesta.
4. **Assert (pre-fix):** `workflow.steps.length === 2`; índices `0` y `1`.
5. **Assert (post-fix):** `workflow.steps.length === 1`; step tiene request y response; `closedAt` presente si terminal.

### E2 — Coherencia stepCount

1. Tras 3 hops simulados (3× request + 3× response).
2. **Assert (pre-fix):** 6 steps en memoria.
3. **Assert (post-fix):** 3 steps; `forceClose` `stepCount === 3`.

### E3 — No-regresión

`npm run test:unit` — suite completa verde.

## Rollback

`git restore` de `gateway-wire-step.util.ts`, handlers SSE/standard.

## Acceptance check

3 experimentos ejecutables con asserts claros.
