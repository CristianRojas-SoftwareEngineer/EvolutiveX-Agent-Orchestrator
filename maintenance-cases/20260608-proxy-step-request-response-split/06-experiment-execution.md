---
case_id: 20260608-proxy-step-request-response-split
profile: corrective
phase: 06-experiment-execution
chain: cause
version: v1.0
timestamp: 2026-06-08T12:30:00Z
status: done
inputs: [05-experiment-design.md]
produces: 06-experiment-execution.md
links: { previous: 05-experiment-design.md, next: 07-data-collection.md }
---

# Experiment Execution — 20260608-proxy-step-request-response-split

## Applied policy

- **acceptance:** test rojo reproduce el fallo

## E1 — Ejecución pre-fix (análisis estático + sesión)

Comportamiento observado en código y sesión `d0cce210`:

- `registerWireStepRequest` → `registerStep` (step 0, request-only en disco).
- `registerWireStepInCorrelator` → `step.index = workflow.steps.length` → `registerStep` (step 1, response-only en disco).

Sesión `d0cce210` workflow `02`: 6 carpetas, 3 con request, 3 con response.

## E2 — Test unitario a crear

`tests/3-operations/gateway-wire-step.util.test.ts` — reproduce doble registro y valida fix.

## Comando

```bash
npm run test:unit -- --testPathPattern=gateway-wire-step
```

## Rollback

Documentado en 05.

## Acceptance check

Fallo reproducido por análisis + sesión; test diseñado para automatizar.
