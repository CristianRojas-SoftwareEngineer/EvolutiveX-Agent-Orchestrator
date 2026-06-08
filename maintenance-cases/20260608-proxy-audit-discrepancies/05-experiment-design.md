---
case_id: 20260608-proxy-audit-discrepancies
profile: corrective
phase: 05-experiment-design
chain: cause
version: v1.0
timestamp: 2026-06-08T18:40:00Z
status: done
inputs: [04-hypothesis.md]
produces: 05-experiment-design.md
links: { previous: 04-hypothesis.md, next: 06-experiment-execution.md }
---

# Experiment Design — 20260608-proxy-audit-discrepancies

## Applied policy

- **focus:** test que reproduce el bug primero + rollback
- **risk_controls:** sandbox

## Protocol

### E1 — Reproducción H1 (wire close)

1. Abrir workflow wire con `forceNew` (`session-wire-0`).
2. Registrar step con `stopReason: end_turn` vía `registerWireStepInCorrelator`.
3. **Assert:** evento `workflow_complete` emitido; `workflow.status === 'completed'`.

### E2 — Reproducción H2 (messages vacíos)

1. `registerWireStepRequest` con body JSON que incluye `messages: [{role,user,...}]`.
2. **Assert:** único `step_request` con `stepIndex === 0` y `request.messages.length > 0`.

### E3 — Reproducción H3 (text blocks)

1. Feed SSE `text_delta` a `StepAssemblerService`.
2. **Assert:** `assistantMessage.content` incluye bloque `{type:'text'}`.

### E4 — No-regresión

`npm run test:unit` — suite completa verde.

## Rollback

`git restore` de archivos modificados en `src/3-operations/`, `src/2-services/`.

## Acceptance check

4 experimentos ejecutables con asserts claros y rollback definido.
