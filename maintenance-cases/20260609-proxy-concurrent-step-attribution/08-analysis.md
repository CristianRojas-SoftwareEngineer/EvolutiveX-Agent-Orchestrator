---
case_id: 20260609-proxy-concurrent-step-attribution
profile: corrective
phase: 08-analysis
chain: cause
version: v1.0
timestamp: 2026-06-09T10:40:00Z
status: done
inputs: [07-data-collection.md]
produces: 08-analysis.md
links: { previous: 07-data-collection.md, next: 11-solution-research.md }
---

# Analysis — 20260609-proxy-concurrent-step-attribution

## Applied policy

- **acceptance:** ## Causa confirmada presente o refutación explícita

## Verdict

| Hipótesis | Resultado | Evidencia |
|-----------|-----------|-----------|
| H1 | **Confirmada** | Heurística «último step abierto»; `assignedStepIndex` ignorado en egress |
| H2 | Refutada | Dos steps abiertos en sesión real |
| H3 | Confirmada como consecuencia | Bug origina en egress, no en persistencia |

## Magnitud

- Impacto: **alto** en trazabilidad forense bajo concurrencia (común al inicio de turno post-`unify-turn-workflow`).
- Blast radius del fix: **bajo** — 2 handlers egress + util wire-step.

## Amenazas a validez

- Continuations coalesced usan `coalescedAgentContinuation`; el fix debe preservar ese camino.
- Fallback si `assignedStepIndex` no encuentra step abierto debe mantener comportamiento actual.

## Causa confirmada

El ingress asigna y propaga `assignedStepIndex` por request HTTP (`AuditWorkflowContext`), pero los handlers de egress (`AuditSseResponseHandler`, `AuditStandardResponseHandler`) y `enrichOpenWireStepWithResponse` resuelven el step destino con la heurística del **último step sin `closedAt`**. Con múltiples hops concurrentes en el mismo workflow, las respuestas se enriquecen en el step equivocado, produciendo cross-wiring en `steps/MM/response/body.json` y `stream_chunk.stepIndex`.

## Acceptance check

`## Causa confirmada` presente; H1 confirmada.
