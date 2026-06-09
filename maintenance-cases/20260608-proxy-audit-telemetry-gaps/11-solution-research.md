---
case_id: 20260608-proxy-audit-telemetry-gaps
profile: corrective
phase: 11-solution-research
chain: solution
version: v1.0
timestamp: 2026-06-08T14:45:00Z
status: done
inputs: [08-analysis.md]
produces: 11-solution-research.md
links: { previous: 08-analysis.md, next: 12-solution-hypothesis.md }
---

# Solution Research — 20260608-proxy-audit-telemetry-gaps

## Applied policy

- **acceptance:** ≥2 candidatas viables

## Solution map

| Gap | Candidata | Descripción | Blast radius |
|-----|-----------|-------------|--------------|
| G1 stepCount | **S-A** | Cerrar step en `tool_use` (`closeStep` + `closedAt`) | Bajo — `gateway-wire-step.util.ts` |
| G1 | **S-B** | `stepCount = workflow.steps.length` en `forceClose` | Muy bajo — puede contar steps abiertos si bug regresa |
| G1 | S-C | Contar desde persistencia / `step_request` events | Alto — acopla correlador a proyección |
| G2 tool_result | **S-D** | Guard idempotente en `completeToolUse` | Bajo — `workflow-repository.service.ts` |
| G2 | S-E | Desactivar fallback si PostToolUse reciente | Medio — heurística frágil |
| G3 finalText | **S-F** | Omitir `finalText` en shell (`deriveFinalText` vacío si `workflowId===sessionId`) | Bajo |
| G3 | S-G | Omitir `finalText` en wire `forceClose` | Bajo — wire es fuente canónica de inferencia |
| G4 interactionType | **S-H** | `workflowKind: 'session-shell'` en `UserPromptSubmit` | Bajo |
| G4 | S-I | Documentar `"main"` como alias | Muy bajo — no corrige semántica |

## Recommended bundles

- **Bundle α (preferido):** S-A + S-D + S-G + S-H
- **Bundle β (mínimo):** S-B + S-D + S-F

## Trade-offs

- S-A alinea correlador con modelo causal (un hop completo incluye tool_use terminal del hop).
- S-G preserva `finalText` en workflow con evidencia SSE; shell queda como contenedor lifecycle.
- S-D es defensivo universal (cubre cualquier doble invocación futura).

## Status map

| ID | Status |
|----|--------|
| S-A | pending |
| S-B | pending |
| S-D | pending |
| S-F | pending |
| S-G | pending |
| S-H | pending |
| S-C, S-E, S-I | discarded (alto riesgo o cosmético) |

## Acceptance check

≥6 candidatas; ≥2 viables por gap principal; bundle α identificado.
