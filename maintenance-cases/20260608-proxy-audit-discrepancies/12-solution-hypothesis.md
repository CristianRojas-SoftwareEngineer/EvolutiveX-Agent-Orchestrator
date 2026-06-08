---
case_id: 20260608-proxy-audit-discrepancies
profile: corrective
phase: 12-solution-hypothesis
chain: solution
version: v1.0
timestamp: 2026-06-08T18:45:00Z
status: done
inputs: [11-solution-research.md]
produces: 12-solution-hypothesis.md
links: { previous: 11-solution-research.md, next: 13-solution-experiment-design.md }
---

# Solution Hypothesis — 20260608-proxy-audit-discrepancies

## Hypothesis

| ID | Status | Hipótesis | Predicción | Blast radius |
|----|--------|-----------|------------|--------------|
| SH1 | pending | S1 restaura el contrato causal con 4 cambios localizados | Tests E1–E4 verdes; sesión tipo 7dd03f66 auditable | 5 archivos src + tests |

## Falsification

Si tras S1 persisten workflows `running` o `messages: []` en continuaciones → refutada.

## Acceptance check

≥1 hipótesis falsable con criterios.
