---
case_id: 20260609-proxy-concurrent-step-attribution
profile: corrective
phase: 11-solution-research
chain: solution
version: v1.0
timestamp: 2026-06-09T10:45:00Z
status: done
inputs: [08-analysis.md]
produces: 11-solution-research.md
links: { previous: 08-analysis.md, next: 12-solution-hypothesis.md }
---

# Solution Research — 20260609-proxy-concurrent-step-attribution

## Applied policy

- **acceptance:** ≥2 candidatas viables

## Candidate map

| ID | Candidata | Descripción | Trade-offs | Status |
|----|-----------|-------------|------------|--------|
| S-A | **Enriquecer por `assignedStepIndex`** | Nueva variante `enrichWireStepWithResponseByIndex(repo, wfId, stepIndex, patch)`; egress usa `context.assignedStepIndex` para `stream_chunk` y `step_response` | Mínimo diff; campo ya existe; alineado con diseño ingress | pending |
| S-B | **Lock de egress por workflow+stepIndex** | Serializar cierre de response por step | No corrige `stream_chunk` si índice se captura mal al inicio; complejidad async | pending |
| S-C | **Cerrar side-request antes de abrir agentic** | Mitigación protocolo harness | No controlamos timing del cliente; frágil; no corrige otros pares concurrentes | pending |
| S-D | **Step UUID en context** | Pasar `stepId` además de índice | Más robusto pero requiere ampliar `AuditWorkflowResult` y controller | pending |

## Recall

Lección `proxy-wire-step-unify-request-response`: egress debe enriquecer el step abierto **correcto**, no el último global.

## Acceptance check

Cuatro candidatas; S-A y S-D viables; S-B y S-C con debilidades claras.
