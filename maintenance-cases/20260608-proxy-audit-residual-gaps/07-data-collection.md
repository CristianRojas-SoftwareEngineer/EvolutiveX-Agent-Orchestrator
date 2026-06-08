---
case_id: 20260608-proxy-audit-residual-gaps
profile: corrective
phase: 07-data-collection
chain: cause
version: v1.0
timestamp: 2026-06-08T23:40:00Z
status: done
inputs: [06-experiment-execution.md]
produces: 07-data-collection.md
links: { previous: 06-experiment-execution.md, next: 08-analysis.md }
---

# Data Collection — 20260608-proxy-audit-residual-gaps

## Applied policy

- **acceptance:** datos trazables a la ejecución

## Cause chain evidence

| Exp | Métrica | Pre-fix | Post-fix (esperado) |
|-----|---------|---------|---------------------|
| E1 config | PostToolUse en user settings | Ausente | Requiere `npm run setup -- --hooks` (operacional) |
| E2 logs | PostToolUse procesados | 0 | N/A sin sesión live |
| E3 test continuation | `tool_result` event | FAIL | PASS (código fallback) |
| E3 test metrics | finalize on wire close | FAIL | PASS |
| E3 npm test | pass/fail | — | PASS |

## No-regression

| Suite | Resultado |
|-------|-----------|
| `npm test` | Ver ejecución en 14-solution-execution |

## Acceptance check

Tabla trazable a comandos y artefactos de sesión.
