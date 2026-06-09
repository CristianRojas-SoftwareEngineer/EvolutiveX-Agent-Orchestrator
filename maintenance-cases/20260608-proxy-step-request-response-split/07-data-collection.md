---
case_id: 20260608-proxy-step-request-response-split
profile: corrective
phase: 07-data-collection
chain: cause
version: v1.0
timestamp: 2026-06-08T12:35:00Z
status: done
inputs: [06-experiment-execution.md]
produces: 07-data-collection.md
links: { previous: 06-experiment-execution.md, next: 08-analysis.md }
---

# Data Collection — 20260608-proxy-step-request-response-split

## Applied policy

- **acceptance:** datos trazables a la ejecución

## E1 — Sesión d0cce210 workflow 02

| Métrica | Valor |
|---------|-------|
| Carpetas `steps/` | 6 |
| Carpetas con solo `request/` | 3 (`00`, `02`, `04`) |
| Carpetas con solo `response/` | 3 (`01`, `03`, `05`) |
| `result.json` `stepCount` | 3 |
| Ratio steps memoria esperado (pre-fix) | 2× hops = 6 `IStep` |

## E2 — Trazabilidad código

| Handler | Acción | Efecto |
|---------|--------|--------|
| `registerWireStepRequest` | `registerStep` | +1 `IStep`, emit `step_request` |
| `registerWireStepInCorrelator` | `registerStep` | +1 `IStep`, emit implícito vía close |

## Acceptance check

Tabla trazable a fuentes concretas.
