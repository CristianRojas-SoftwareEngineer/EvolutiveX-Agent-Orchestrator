---
case_id: 20260608-proxy-audit-residual-gaps
profile: corrective
phase: 13-solution-experiment-design
chain: solution
version: v1.0
timestamp: 2026-06-08T23:47:00Z
status: done
inputs: [12-solution-hypothesis.md]
produces: 13-solution-experiment-design.md
links: { previous: 12-solution-hypothesis.md, next: 14-solution-execution.md }
---

# Solution Experiment Design — 20260608-proxy-audit-residual-gaps

## Applied policy

- **acceptance:** experimento reproducible

## Protocol SH1

1. Implementar S2 (`completeClientToolResultsFromContinuation`) y S3 (`finalizeWorkflowMetrics` post wire close).
2. Añadir tests:
   - continuation client-side → `tool_result` event + `status: completed`
   - `extractToolResultBlocksFromRequestBody` unit test
3. Ejecutar `npm run test:unit`.
4. Rollback: `git revert` del commit del caso.

## Metrics

| Métrica | Umbral |
|---------|--------|
| Tests unitarios | 100% pass (595+) |
| Regresión audit-workflow | 0 fallos |

## Acceptance check

Procedimiento con rollback y métricas.
