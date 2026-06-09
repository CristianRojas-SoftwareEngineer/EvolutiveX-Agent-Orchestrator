---
case_id: 20260608-proxy-step-request-response-split
profile: corrective
phase: 13-solution-experiment-design
chain: solution
version: v1.0
timestamp: 2026-06-08T13:00:00Z
status: done
inputs: [12-solution-hypothesis.md]
produces: 13-solution-experiment-design.md
links: { previous: 12-solution-hypothesis.md, next: 14-solution-execution.md }
---

# Solution Experiment Design — 20260608-proxy-step-request-response-split

## Applied policy

- **acceptance:** experimento reproducible

## Protocol S-A

1. Implementar `enrichOpenWireStepWithResponse` + `resolveOpenWireStepIndex`.
2. Actualizar `AuditSseResponseHandler` y `AuditStandardResponseHandler`.
3. Test `tests/3-operations/gateway-wire-step.util.test.ts`.
4. `npm run test:unit` — no-regresión.

## Rollback

`git revert` del commit de implementación.

## Acceptance check

Procedimiento reproducible con rollback.
