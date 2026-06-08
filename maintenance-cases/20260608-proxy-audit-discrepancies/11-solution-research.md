---
case_id: 20260608-proxy-audit-discrepancies
profile: corrective
phase: 11-solution-research
chain: solution
version: v1.0
timestamp: 2026-06-08T18:44:00Z
status: done
inputs: [08-analysis.md]
produces: 11-solution-research.md
links: { previous: 08-analysis.md, next: 12-solution-hypothesis.md }
---

# Solution Research — 20260608-proxy-audit-discrepancies

## Candidates

| ID | Candidata | Tradeoffs |
|----|-----------|-----------|
| S1 | **Fix quirúrgico por defecto** — cerrar wire en `end_turn`, eliminar emit duplicado `step_request`, añadir `text` al assembler, `interactionType` en meta | Mínimo blast radius; alinea con spec existente |
| S2 | Reescribir proyección con máquina de estados por workflow | Mayor cobertura futura; over-engineering para defecto localizado |
| S3 | Delegar coalescencia solo a `SseReconstructService` post-hoc | No corrige eventos correlador ni `tool_result`; incompleto |

## Recall

Sin lecciones previas en MEMORY.md para esta clase.

## Acceptance check

≥2 candidatas viables (S1, S2, S3).
