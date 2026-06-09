---
case_id: 20260608-proxy-audit-telemetry-gaps
profile: corrective
phase: 07-data-collection
chain: cause
version: v1.0
timestamp: 2026-06-08T14:35:00Z
status: done
inputs: [06-experiment-execution.md]
produces: 07-data-collection.md
links: { previous: 06-experiment-execution.md, next: 08-analysis.md }
---

# Data Collection — 20260608-proxy-audit-telemetry-gaps

## Applied policy

- **acceptance:** datos trazables a la ejecución

## Session evidence (dcdf0a15, análisis 2026-06-09)

| Métrica | Valor observado | Fuente |
|---------|-----------------|--------|
| `step_request` | 7 | events.ndjson |
| `tool_call` | 6 | events.ndjson |
| `tool_result` | 12 | events.ndjson |
| `steps/` dirs (wf 02) | 6 (00–05) | tree sesión |
| `result.stepCount` (wf 02) | 1 | result.json |
| `finalText` duplicado | sí (wf 00 + 02) | result.json |
| `interactionType` (wf 00) | `"main"` | meta.json |

## Hypothesis test results

| ID | Result | Evidence |
|----|--------|----------|
| H1 | **PASS** (causa confirmada) | E1 + O3 |
| H2 | **PASS** (causa confirmada) | E2 + O4 |
| H3 | **PASS** (causa confirmada) | E3 + O5 |
| H4 | **PASS** (causa confirmada) | E3 + O6 |

## Baseline tests

`npm test` con filtros: typecheck falla en `audit-sse-response.handler.ts:262` (preexistente, fuera de scope).

## Acceptance check

Tabla normalizada con pass/fail por hipótesis y métricas de sesión citadas.
