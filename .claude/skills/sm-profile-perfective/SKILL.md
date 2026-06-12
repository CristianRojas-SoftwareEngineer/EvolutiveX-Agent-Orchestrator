---
name: sm-profile-perfective
description: >
  Perfective maintenance policy for the two-chain scientific-maintenance system. Invoked by
  sm-orchestrator to write perfective parameters and the per-phase policy matrix (16 entries)
  into case.md. Use for performance, readability, maintainability, refactor, optimization with
  no functional change. Triggers: optimizar, refactorizar, rendimiento, deuda técnica,
  mejorar calidad. Does not execute phases.
---

# Profile — Perfective

Policy layer. Writes parameters + 16-entry phase-policy matrix into `case.md`. Never
executes phases.

<user_communication>Spanish for any user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

## Objective
Improve quality attributes (performance, readability, maintainability, UX) without changing
functional behavior.

## Parameters to write into case.md
- Priorities: measurable improvement → behavior preservation → no quality regression.
- Success metrics: statistically significant improvement of the target metric; functional
  suite green.
- Risk thresholds: reject optimization without a baseline; reject refactor without a test
  net; reject improvements within noise; reject a solution that changes functional behavior
  inadvertently.

## Phase-policy matrix (16 entries)

<!-- <policy_matrix> -->
```yaml
phase_policy:
  # ── Causa (01–08) ────────────────────────────────────────────────────────
  observation:               { focus: "métricas de calidad/rendimiento; baselines",             reasoning_effort: medium, evidence: [metricas, baseline, snapshots],                        acceptance: "baseline capturado",                                  risk_controls: [] }
  problem-definition:        { focus: "métrica objetivo + umbral de mejora",                     reasoning_effort: medium, evidence: [enunciado, umbral, invariante_funcional],               acceptance: "umbral explícito",                                   risk_controls: [] }
  research:                  { focus: "benchmarks publicados; patrones de optimización",         reasoning_effort: medium, evidence: [benchmarks, lecciones, literatura],                     acceptance: "cobertura del dominio",                                risk_controls: [] }
  hypothesis:                { focus: "optimización candidata con hipótesis cuantificable",      reasoning_effort: medium, evidence: [prediccion, magnitud_esperada],                         acceptance: "≥1 hipótesis falsable",                               risk_controls: [] }
  experiment-design:         { focus: "benchmark A/B; baseline N runs; igualdad de salida",      reasoning_effort: medium, evidence: [procedimiento, benchmark, baseline],                   acceptance: "benchmark ejecutable",                                 risk_controls: [aislamiento_carga] }
  experiment-execution:      { focus: "ejecutar benchmark antes/después con aislamiento",         reasoning_effort: medium, evidence: [runs, metricas, desviaciones],                          acceptance: "benchmark ejecutado",                                  risk_controls: [aislamiento_carga] }
  data-collection:           { focus: "deltas con varianza; snapshots de igualdad funcional",    reasoning_effort: medium, evidence: [deltas, varianza, igualdad_funcional],                  acceptance: "datos con varianza registrada",                        risk_controls: [] }
  analysis:                  { focus: "significancia estadística; comportamiento invariante",     reasoning_effort: medium, evidence: [p_value, delta, igualdad],                              acceptance: "## Causa confirmada presente",                          risk_controls: [] }
  # ── Solución (11–16) ────────────────────────────────────────────────────
  solution-research:         { focus: "benchmarks publicados del dominio; patrones",            reasoning_effort: medium, evidence: [candidatas, benchmarks, recall],                        acceptance: "≥2 candidatas con hipótesis",                          risk_controls: [] }
  solution-hypothesis:       { focus: "soluciones con hipótesis de mejora cuantificable",        reasoning_effort: medium, evidence: [prediccion, magnitud],                                  acceptance: "≥1 hipótesis falsable",                                risk_controls: [] }
  solution-experiment-design:{ focus: "benchmark A/B por hipótesis; baseline N runs",             reasoning_effort: medium, evidence: [procedimiento, benchmark, baseline],                   acceptance: "experimento A/B ejecutable",                            risk_controls: [aislamiento_carga, sandbox] }
  solution-execution:        { focus: "ejecutar cada hipótesis con aislamiento y snapshot",       reasoning_effort: medium, evidence: [runs, metricas, snapshots],                              acceptance: "ejecución limpia; snapshots tomados",                  risk_controls: [aislamiento_carga] }
  solution-data-collection:  { focus: "deltas con varianza normalizados; tabla comparativa",       reasoning_effort: medium, evidence: [tabla_normalizada, p_values],                            acceptance: "tabla con varianza por hipótesis",                     risk_controls: [] }
  solution-analysis:         { focus: "veredicto con significancia estadística citada",         reasoning_effort: medium, evidence: [veredicto, p_value, descartes],                          acceptance: "ganadora con significancia si aplica; descartadas + batch note si no", risk_controls: [] }
  # ── Cierre (17–18) ───────────────────────────────────────────────────────
  conclusion:                { focus: "mejora medible + comportamiento invariante",              reasoning_effort: medium, evidence: [veredicto, delta, igualdad_funcional],                   acceptance: "veredicto cuantitativo",                               risk_controls: [] }
  communication:             { focus: "delta de métricas con números; reproducibilidad",        reasoning_effort: medium, evidence: [resumen, deltas, benchmark, commit],                     acceptance: "commit con metadatos Case:; cita 16 ## Solución ganadora con números solo con ganadora", risk_controls: [] }
```
<!-- </policy_matrix> -->

## Evidence prioritized
Reproducible benchmarks, performance profiles, complexity metrics, coverage.

## Conclusions favored
"Metric M improved by Δ (p<threshold) with no functional change (winning solution Z)."
