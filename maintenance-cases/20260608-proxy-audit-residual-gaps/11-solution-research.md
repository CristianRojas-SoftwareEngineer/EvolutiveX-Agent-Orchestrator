---
case_id: 20260608-proxy-audit-residual-gaps
profile: corrective
phase: 11-solution-research
chain: solution
version: v1.0
timestamp: 2026-06-08T23:45:00Z
status: done
inputs: [08-analysis.md]
produces: 11-solution-research.md
links: { previous: 08-analysis.md, next: 12-solution-hypothesis.md }
---

# Solution Research — 20260608-proxy-audit-residual-gaps

## Applied policy

- **acceptance:** ≥2 candidatas viables

## Candidates map

| ID | Candidata | Pros | Contras | Status |
|----|-----------|------|---------|--------|
| S1 | Reinstalar hooks (`npm run setup -- --hooks`) | Mínimo; alinea con spec | No corrige si usuario borra PostToolUse; no ayuda a sesiones ya capturadas | pending |
| S2 | Fallback `completeToolUse` en `handleContinuation` desde `tool_result` en body | Resiliente; body ya disponible; sin depender de hook | Duplica camino PostToolUse cuando hook sí existe (idempotente si completeToolUse es no-op duplicado) | pending |
| S3 | `finalizeWorkflowMetrics` al cierre SSE wire | Corrige `total_workflows` | No cuenta workflow sesión sin usage (semántica correcta) | pending |
| S4 | Agregar `stepCount` agregado de hijos en workflow sesión | UX mejor en result.json | Cambio semántico; blast radius mayor | pending |

## Acceptance check

4 candidatas; S1–S3 viables para batch.
