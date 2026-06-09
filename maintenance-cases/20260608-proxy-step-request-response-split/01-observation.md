---
case_id: 20260608-proxy-step-request-response-split
profile: corrective
phase: 01-observation
chain: cause
version: v1.0
timestamp: 2026-06-08T12:05:00Z
status: done
inputs: [exploración openspec sesión d0cce210, docs/session-audit-model.md]
produces: 01-observation.md
links: { previous: "", next: 02-problem-definition.md }
---

# Observation — 20260608-proxy-step-request-response-split

## Applied policy

- **focus:** síntomas + pasos de reproducción
- **acceptance:** fallo reproducible o caracterizado con precisión

## Observed facts

| # | Fecha | Fuente | Hecho observable |
|---|-------|--------|------------------|
| 1 | 2026-06-08 | `sessions/d0cce210-…/workflows/02/output/result.json` | `stepCount: 3`. |
| 2 | 2026-06-08 | `sessions/d0cce210-…/workflows/02/steps/` | 6 subdirectorios (`00`–`05`). |
| 3 | 2026-06-08 | `steps/00/`, `steps/02/`, `steps/04/` | Contienen solo `request/body.json` (sin `response/`). |
| 4 | 2026-06-08 | `steps/01/`, `steps/03/`, `steps/05/` | Contienen solo `response/` (sin `request/`). |
| 5 | 2026-06-08 | `docs/session-audit-model.md` §2, §3.1 | Diagrama muestra `steps/01/request\|response/` como unidad; tabla §2 define `request/` y `response/` bajo el mismo step. |
| 6 | 2026-06-08 | `src/3-operations/audit-workflow.handler.ts` L187–218 | `registerWireStepRequest` llama `workflowRepo.registerStep` con `index: workflow.steps.length`. |
| 7 | 2026-06-08 | `src/3-operations/gateway-wire-step.util.ts` L62–71 | `registerWireStepInCorrelator` asigna `step.index = workflow.steps.length` y registra un segundo `IStep`. |
| 8 | 2026-06-08 | `src/2-services/session-persistence.service.ts` L191–214 | `onStepRequest` escribe `steps/MM/request/`; `onStepResponse` escribe `steps/MM/response/` según `stepIndex` del evento. |
| 9 | 2026-06-08 | `src/3-operations/audit-sse-response.handler.ts` L50–51 | `projectedStepIndex = workflow.steps.length` al inicio del stream (off-by-one respecto al step de request ya registrado). |

## Reproduction steps

1. Proxy activo con auditoría causal.
2. Un prompt agentic que produce ≥2 hops HTTP (sesión `d0cce210` o harness equivalente).
3. Inspeccionar `workflows/NN/steps/`: alternancia request-only / response-only.
4. Comparar `output/result.json` `stepCount` con número de carpetas bajo `steps/`.

## Scope

**In scope:** unificación request+response en un solo `IStep` por hop; coherencia `stepCount` ↔ carpetas; `projectedStepIndex` en SSE.

**Out of scope:** reducir workflows wire múltiples por prompt; rediseño dual-layer; migración de sesiones históricas en disco.

## Not interpreted

Hechos observables sin atribución causal.

## Acceptance check

9 hechos fechados con fuente; pasos de reproducción concretos; alcance delimitado.
