---
case_id: 20260608-proxy-audit-discrepancies
profile: corrective
phase: 13-solution-experiment-design
chain: solution
version: v1.0
timestamp: 2026-06-08T18:46:00Z
status: done
inputs: [12-solution-hypothesis.md]
produces: 13-solution-experiment-design.md
links: { previous: 12-solution-hypothesis.md, next: 14-solution-execution.md }
---

# Solution Experiment Design — 20260608-proxy-audit-discrepancies

## Procedure

1. Aplicar S1 en `gateway-wire-step.util.ts`, `workflow-repository.service.ts`, `audit-workflow.handler.ts`, `step-assembler.service.ts`, `session-persistence.service.ts`.
2. Añadir/actualizar tests (assembler text, workflow forceClose success, audit handler stepIndex).
3. `npm run test:unit`.
4. Rollback si falla: `git restore src/ tests/`.

## Controls

- No tocar layout de directorios.
- Preservar cierre sesión vía hook Stop.

## Acceptance check

Experimento reproducible con rollback.
