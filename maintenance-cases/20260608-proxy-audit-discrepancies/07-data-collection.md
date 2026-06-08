---
case_id: 20260608-proxy-audit-discrepancies
profile: corrective
phase: 07-data-collection
chain: cause
version: v1.0
timestamp: 2026-06-08T18:42:00Z
status: done
inputs: [06-experiment-execution.md]
produces: 07-data-collection.md
links: { previous: 06-experiment-execution.md, next: 08-analysis.md }
---

# Data Collection — 20260608-proxy-audit-discrepancies

## Applied policy

- **evidence:** pass_fail, deltas, no_regresion

## Results

| Exp | Hipótesis | Antes (predicción) | Después (observado) | Pass |
|-----|-----------|-------------------|---------------------|------|
| E1 | H1 | wire sin `workflow_complete` | `forceClose` success en `end_turn` terminal | ✓ |
| E2 | H2 | `messages: []` | `step_request` único con body parseado, index 0 | ✓ |
| E3 | H3 | sin bloque text | bloque text en assembler | ✓ |
| E4 | — | — | 594/594 tests | ✓ |

## No-regression delta

+3 tests nuevos/modificados; 0 regresiones.

## Acceptance check

Datos trazables a ejecución del 06.
