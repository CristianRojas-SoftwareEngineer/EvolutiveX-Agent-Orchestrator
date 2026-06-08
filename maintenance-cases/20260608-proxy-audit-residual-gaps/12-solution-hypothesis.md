---
case_id: 20260608-proxy-audit-residual-gaps
profile: corrective
phase: 12-solution-hypothesis
chain: solution
version: v1.0
timestamp: 2026-06-08T23:46:00Z
status: done
inputs: [11-solution-research.md]
produces: 12-solution-hypothesis.md
links: { previous: 11-solution-research.md, next: 13-solution-experiment-design.md }
---

# Solution Hypothesis — 20260608-proxy-audit-residual-gaps

## Applied policy

- **acceptance:** ≥1 hipótesis falsable + criterios

## Batch hypotheses

| ID | Hipótesis | Predicción | Criterio éxito |
|----|-----------|------------|----------------|
| SH1 | S2 + S3 en código restauran SC1 y SC2 sin S4 | Tests continuation emiten `tool_result`; finalize en wire close incrementa `workflow_count` | `npm test` verde; nuevos asserts PASS |
| SH2 | S1 operacional complementa S2 | Tras setup, PostToolUse llega al proxy en sesión live | Manual post-deploy |

## Descartadas en este batch

- **S4:** deuda documental (H3); no entra en diff mínimo.

## Acceptance check

SH1 falsable con tests automatizados.
