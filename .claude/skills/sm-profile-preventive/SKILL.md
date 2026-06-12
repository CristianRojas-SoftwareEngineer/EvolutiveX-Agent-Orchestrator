---
name: sm-profile-preventive
description: >
  Preventive maintenance policy for the two-chain scientific-maintenance system. Invoked by
  sm-orchestrator to write preventive parameters and the per-phase policy matrix (16 entries)
  into case.md. Use for audits, hardening, fragility analysis, recurring defect classes,
  potential vulnerabilities, missing critical coverage. Triggers: prevenir, endurecer,
  auditar, hardening, riesgo, vulnerabilidad. Does not execute phases.
---

# Profile — Preventive

Policy layer. Writes parameters + 16-entry phase-policy matrix into `case.md`. Never
executes phases.

<!-- <user_communication> -->
Spanish for any user interaction. See ../artifact-structuring/SKILL.md §language_policy.
<!-- </user_communication> -->

## Objective
Reduce the probability or impact of future failures before they occur.

## Parameters to write into case.md
- Priorities: risk identification → mitigation → residual-risk quantification.
- Success metrics: risk demonstrably mitigated; residual risk quantified; guards/coverage
  added.
- Risk thresholds: reject changes adding net risk; reject mitigation without a validating
  test; reject scope exceeding the addressed risk; reject a mitigation that does not cover
  the materialization paths.

## Phase-policy matrix (16 entries)

<!-- <!-- <policy_matrix> -->
 -->
```yaml
phase_policy:
  # ── Causa (01–08) ────────────────────────────────────────────────────────
  observation:               { focus: "señales débiles; tendencias; clases de defecto recurrentes", reasoning_effort: high, evidence: [señales, tendencias, recalls],                  acceptance: "señales documentadas",                                risk_controls: [] }
  problem-definition:        { focus: "riesgo a mitigar; probabilidad/impacto; mecanismo",       reasoning_effort: medium, evidence: [enunciado, riesgo, prob_impacto],                     acceptance: "riesgo falsable con prob/impacto",                    risk_controls: [] }
  research:                  { focus: "clases de defecto análogas; vulnerabilidades; recall",  reasoning_effort: high,   evidence: [clases, vulnerabilidades, lecciones],                 acceptance: "recall ejecutado",                                    risk_controls: [] }
  hypothesis:                { focus: "mecanismo de materialización del riesgo",                 reasoning_effort: medium, evidence: [prediccion, mecanismo],                                acceptance: "≥1 mecanismo falsable",                               risk_controls: [] }
  experiment-design:         { focus: "prueba que provoca la condición de riesgo en sandbox",   reasoning_effort: high,   evidence: [procedimiento, inyeccion_fallo, rollback],            acceptance: "prueba ejecutable que provoca",                       risk_controls: [sandbox, aislamiento_estricto] }
  experiment-execution:      { focus: "inyectar fallo; verificar que la condición se materializa", reasoning_effort: medium, evidence: [comandos, inyeccion, resultado],                  acceptance: "condición reproducida en sandbox",                    risk_controls: [sandbox, aislamiento_estricto] }
  data-collection:           { focus: "presencia/ausencia de la condición de riesgo",          reasoning_effort: medium, evidence: [presencia, cobertura, amenazas],                      acceptance: "datos trazables",                                     risk_controls: [] }
  analysis:                  { focus: "reducción efectiva del riesgo; cobertura de vías",        reasoning_effort: high,   evidence: [veredicto, cobertura, residual],                      acceptance: "## Causa confirmada presente",                          risk_controls: [] }
  # ── Solución (11–16) ────────────────────────────────────────────────────
  solution-research:         { focus: "mitigaciones probadas; guardas análogas; hardening",    reasoning_effort: medium, evidence: [candidatas, mitigaciones, recall],                    acceptance: "≥2 candidatas con cobertura amplia",                  risk_controls: [] }
  solution-hypothesis:       { focus: "soluciones que cubren el mayor número de vías",          reasoning_effort: medium, evidence: [prediccion, cobertura_vias],                            acceptance: "≥1 hipótesis falsable con cobertura",                 risk_controls: [] }
  solution-experiment-design:{ focus: "pruebas comparativas que provocan la condición en sandbox", reasoning_effort: high, evidence: [procedimiento, inyeccion, baseline],                 acceptance: "experimento inyecta el riesgo",                       risk_controls: [sandbox, aislamiento_estricto] }
  solution-execution:        { focus: "ejecutar con aislamiento estricto; verificar mitigación", reasoning_effort: medium, evidence: [comandos, inyeccion, resultado, rollback],         acceptance: "ejecución limpia; rollback trivial",                  risk_controls: [sandbox, aislamiento_estricto] }
  solution-data-collection:  { focus: "tabla normalizada: presencia/ausencia de riesgo",         reasoning_effort: medium, evidence: [tabla_normalizada, cobertura],                          acceptance: "tabla con cobertura por hipótesis",                    risk_controls: [] }
  solution-analysis:         { focus: "veredicto con cobertura de vías y residual cuantificado", reasoning_effort: high,   evidence: [veredicto, cobertura, residual],                      acceptance: "ganadora con cobertura + residual si aplica; descartadas + batch note si no", risk_controls: [] }
  # ── Cierre (17–18) ───────────────────────────────────────────────────────
  conclusion:                { focus: "riesgo mitigado + residual cuantificado + vías cubiertas", reasoning_effort: medium, evidence: [veredicto, residual, cobertura, deuda],            acceptance: "veredicto cuantitativo",                                risk_controls: [] }
  communication:             { focus: "riesgo evitado y residual; cobertura de vías",           reasoning_effort: medium, evidence: [resumen, riesgo, residual, commit],                    acceptance: "commit con metadatos Case:; cita 16 ## Solución ganadora con residual solo con ganadora", risk_controls: [] }
```
<!-- 
<!-- </policy_matrix> --> -->

## Evidence prioritized
Tests that provoke the risk condition, static analysis, critical-path coverage, threat
models.

## Conclusions favored
"Risk R mitigated by control C (winning solution Z); residual quantified and accepted."
