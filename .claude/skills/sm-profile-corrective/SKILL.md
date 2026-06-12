---
name: sm-profile-corrective
description: >
  Corrective maintenance policy for the two-chain scientific-maintenance system. Invoked by
  sm-orchestrator to write corrective parameters and the per-phase policy matrix (16 entries)
  into case.md. Use for bugs, regressions, exceptions, production incidents, red tests.
  Triggers: corregir, arreglar bug, regresión, fallo en producción. Does not execute phases.
---

# Profile — Corrective

Policy layer. Writes parameters + 16-entry phase-policy matrix into `case.md`. Never
executes phases or writes phase artifacts.

<user_communication>Spanish for any user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

## Objective
Restore correct behavior by removing a defect with a minimal, verified change.

## Parameters to write into case.md
- Priorities: reproduce → root cause → minimal fix → no regression.
- Success metrics: reproduction test red→green; zero regressions; time-to-resolution.
- Risk thresholds: reject broad changes for a localized defect; reject a fix without a
  covering test; reject a solution that adds unnecessary blast radius.

## Phase-policy matrix (16 entries) — schema: ../sm-orchestrator/references/phase-policy-schema.md

<!-- <policy_matrix> -->
```yaml
phase_policy:
  # ── Causa (01–08) ────────────────────────────────────────────────────────
  observation:               { focus: "síntomas + pasos de reproducción",                       reasoning_effort: medium, evidence: [stack_trace, repro_steps],                          acceptance: "fallo reproducible o caracterizado con precisión", risk_controls: [] }
  problem-definition:        { focus: "defecto + criterio de no-regresión",                      reasoning_effort: medium, evidence: [],                                                 acceptance: "enunciado falsable y medible",                     risk_controls: [] }
  research:                  { focus: "regresiones recientes + recall por defect-class",         reasoning_effort: medium, evidence: [related_commits, code_refs, recalled_lessons],       acceptance: "recall ejecutado; fuentes citadas",               risk_controls: [] }
  hypothesis:                { focus: "causa raíz más probable y barata de probar",              reasoning_effort: medium, evidence: [prediccion, criterio_refutacion],                   acceptance: "≥1 hipótesis falsable",                           risk_controls: [] }
  experiment-design:         { focus: "test que reproduce el bug primero + rollback",            reasoning_effort: medium, evidence: [procedimiento, controles, rollback],                acceptance: "test de reproducción ejecutable",                  risk_controls: [sandbox] }
  experiment-execution:      { focus: "ejecutar test de reproducción; documentar desviaciones",  reasoning_effort: medium, evidence: [comandos, logs, cambios],                           acceptance: "test rojo reproduce el fallo",                     risk_controls: [sandbox, reversible] }
  data-collection:           { focus: "pass/fail del test + métricas de no-regresión",           reasoning_effort: medium, evidence: [pass_fail, deltas, no_regresion],                   acceptance: "datos trazables a la ejecución",                    risk_controls: [] }
  analysis:                  { focus: "verificar cierre del fallo + no-regresión",              reasoning_effort: medium, evidence: [veredicto, magnitud, amenazas],                      acceptance: "## Causa confirmada presente o refutación explícita", risk_controls: [] }
  # ── Solución (11–16) ────────────────────────────────────────────────────
  solution-research:         { focus: "fixes ya conocidos para esta clase; patrones históricos",  reasoning_effort: medium, evidence: [candidatas, tradeoffs, recall],                      acceptance: "≥2 candidatas viables",                            risk_controls: [] }
  solution-hypothesis:       { focus: "solución más conservadora y mínima; menor blast radius",   reasoning_effort: medium, evidence: [prediccion, blast_radius, reversibilidad],           acceptance: "≥1 hipótesis falsable + criterios",                  risk_controls: [] }
  solution-experiment-design:{ focus: "experimento comparativo + test de no-regresión obligatorio", reasoning_effort: medium, evidence: [procedimiento, controles, rollback],              acceptance: "experimento reproducible",                           risk_controls: [sandbox, feature_flag] }
  solution-execution:        { focus: "ejecución con rollback explícito entre hipótesis",         reasoning_effort: medium, evidence: [comandos, logs, cambios_rollback],                   acceptance: "ejecución limpia; rollback probado",                risk_controls: [sandbox, reversible] }
  solution-data-collection:  { focus: "pass/fail del test por hipótesis; deltas de no-regresión",  reasoning_effort: medium, evidence: [tabla_normalizada, pass_fail],                        acceptance: "tabla con ≥1 fila por hipótesis",                    risk_controls: [] }
  solution-analysis:         { focus: "veredicto de ganadora con diff mínimo citado",              reasoning_effort: medium, evidence: [veredicto, descartadas_con_razon],                   acceptance: "ganadora con justificación cuantitativa si aplica; descartadas + batch note si no", risk_controls: [] }
  # ── Cierre (17–18) ───────────────────────────────────────────────────────
  conclusion:                { focus: "veredicto: causa confirmada + solución ganadora + diff mínimo", reasoning_effort: medium, evidence: [veredicto, decision, deuda, seguimiento],      acceptance: "veredicto coherente con análisis",                   risk_controls: [] }
  communication:             { focus: "causa raíz + prueba de no-regresión; diff mínimo",         reasoning_effort: medium, evidence: [resumen, cambios, evidencia, commit],                 acceptance: "commit con metadatos Case:; cita 16 ## Solución ganadora solo en rutas con ganadora", risk_controls: [] }
```
<!-- </policy_matrix> -->

## Evidence prioritized
Reproduction test (red→green), stack traces, minimal diff.

## Conclusions favored
"Root cause X corrected, verified by test T, with winning solution Y (diff Z), no regressions."
