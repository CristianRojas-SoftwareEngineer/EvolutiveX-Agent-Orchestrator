---
case_id: 20260609-proxy-concurrent-step-attribution
profile: corrective
phase: 16-solution-analysis
chain: solution
version: v1.0
timestamp: 2026-06-09T11:10:00Z
status: done
inputs: [15-solution-data-collection.md]
produces: 16-solution-analysis.md
links: { previous: 15-solution-data-collection.md, next: 17-conclusion.md }
---

# Solution Analysis — 20260609-proxy-concurrent-step-attribution

## Applied policy

- **acceptance:** ganadora con justificación

## Verdict

| Hipótesis | Resultado | Justificación |
|-----------|-----------|---------------|
| S-A | **Ganadora** | Usa campo existente; corrige enrich y stream_chunk; diff mínimo |
| S-B | Descartada | No corrige proyección de chunks SSE |
| S-C | Descartada | Mitigación externa, no generaliza |
| S-D | Descartada | S-A suficiente; UUID añade superficie sin beneficio marginal |

## Diff mínimo (S-A)

1. `enrichWireStepWithResponseByIndex(repo, workflowId, stepIndex, patch, stopReason)` en `gateway-wire-step.util.ts`.
2. `AuditSseResponseHandler`: `projectedStepIndex = context.assignedStepIndex`; enrich por índice.
3. `AuditStandardResponseHandler`: enrich por `context.assignedStepIndex`.
4. Test regresión concurrente en `audit-sse-response.handler.test.ts`.
5. Delta spec `gateway-audit-projection`: egress SHALL usar `assignedStepIndex`.

## Solución ganadora

**S-A — Atribución egress por `assignedStepIndex`.** El ingress ya fija el índice por hop HTTP; egress debe enriquecer exactamente ese step y emitir `stream_chunk`/`step_response` con el mismo índice, eliminando la heurística «último step abierto» cuando hay múltiples hops concurrentes.

## Hipótesis descartadas

- **S-B:** lock sin índice no arregla chunks.
- **S-C:** depende del harness, no del proxy.
- **S-D:** sobre-ingeniería frente a S-A.

## Acceptance check

`## Solución ganadora` presente con descartes justificados.
