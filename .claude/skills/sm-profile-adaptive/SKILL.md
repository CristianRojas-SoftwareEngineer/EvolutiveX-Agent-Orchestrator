---
name: sm-profile-adaptive
description: >
  Adaptive maintenance policy for the two-chain scientific-maintenance system. Invoked by
  sm-orchestrator to write adaptive parameters and the per-phase policy matrix (16 entries)
  into case.md. Use for dependency upgrades, deprecations, new platforms/APIs, regulatory
  changes. Triggers: migrar, actualizar dependencia, adaptar, deprecación, compatibilidad.
  Does not execute phases.
---

# Profile — Adaptive

Policy layer. Writes parameters + 16-entry phase-policy matrix into `case.md`. Never
executes phases.

<!-- <user_communication> -->
Spanish for any user interaction. See ../artifact-structuring/SKILL.md §language_policy.
<!-- </user_communication> -->

## Objective
Adapt the software to an external change while preserving compatibility.

## Parameters to write into case.md
- Priorities: compatibility → safe migration → coverage of the new contract.
- Success metrics: suite green on the new target; no public-contract breakage; documented
  migration.
- Risk thresholds: reject non-isolated changes (no feature flag); reject irreversible
  migrations without proof; reject a solution that breaks the public contract.

## Phase-policy matrix (16 entries)

<!-- <!-- <policy_matrix> -->
 -->
```yaml
phase_policy:
  # ── Causa (01–08) ────────────────────────────────────────────────────────
  observation:               { focus: "delta de entorno; deprecación; nueva API",                reasoning_effort: medium, evidence: [uso_actual, fecha_deprecacion],                       acceptance: "delta delimitado",                                   risk_controls: [] }
  problem-definition:        { focus: "soportar nueva versión manteniendo contrato público",    reasoning_effort: medium, evidence: [enunciado, contrato_publico],                         acceptance: "compatibilidad como criterio",                       risk_controls: [] }
  research:                  { focus: "diferencias v_old↔v_new; breaking changes; recall",       reasoning_effort: high,   evidence: [diff, breaking_changes, lecciones],                   acceptance: "cobertura suficiente del cambio",                     risk_controls: [] }
  hypothesis:                { focus: "estrategia de adaptación con feature flag",               reasoning_effort: medium, evidence: [prediccion, flag_strategy],                            acceptance: "≥1 estrategia falsable",                             risk_controls: [] }
  experiment-design:         { focus: "contract tests v_old y v_new; rollback = flag off",       reasoning_effort: medium, evidence: [procedimiento, contract_tests, rollback],              acceptance: "contract tests ejecutables",                         risk_controls: [feature_flag] }
  experiment-execution:      { focus: "implementar adaptador; ejecutar ambos contract tests",   reasoning_effort: medium, evidence: [comandos, contract_results],                            acceptance: "contract tests verdes",                                risk_controls: [feature_flag, reversible] }
  data-collection:           { focus: "matriz de compatibilidad v_old/v_new",                    reasoning_effort: medium, evidence: [matriz, deltas, sin_ruptura_publica],                  acceptance: "matriz con todas las filas",                          risk_controls: [] }
  analysis:                  { focus: "compatibilidad confirmada; sin rupturas públicas",        reasoning_effort: medium, evidence: [veredicto, matriz, amenazas],                            acceptance: "## Causa confirmada presente",                          risk_controls: [] }
  # ── Solución (11–16) ────────────────────────────────────────────────────
  solution-research:         { focus: "patrones de adaptación previa del componente",           reasoning_effort: medium, evidence: [candidatas, recall, tradeoffs],                        acceptance: "≥2 candidatas reversibles",                          risk_controls: [] }
  solution-hypothesis:       { focus: "soluciones reversibles con feature flag",                reasoning_effort: medium, evidence: [prediccion, reversibilidad, flag],                    acceptance: "≥1 hipótesis falsable reversible",                   risk_controls: [] }
  solution-experiment-design:{ focus: "experimento comparativo con contract tests v_old y v_new", reasoning_effort: medium, evidence: [procedimiento, contract_tests],                     acceptance: "experimento reproduce ambos contratos",               risk_controls: [feature_flag, sandbox] }
  solution-execution:        { focus: "ejecutar con feature flag; rollback = flag off",          reasoning_effort: medium, evidence: [comandos, contract_results_ambas],                     acceptance: "ejecución limpia; rollback probado",                  risk_controls: [feature_flag, reversible] }
  solution-data-collection:  { focus: "matriz de compatibilidad normalizada por hipótesis",       reasoning_effort: medium, evidence: [tabla_normalizada, contract_pass],                     acceptance: "tabla con filas por hipótesis",                       risk_controls: [] }
  solution-analysis:         { focus: "veredicto de ganadora reversible con ruta de migración", reasoning_effort: medium, evidence: [veredicto, ruta_migracion, descartes],                  acceptance: "ganadora reversible con justificación si aplica; descartadas + batch note si no", risk_controls: [] }
  # ── Cierre (17–18) ───────────────────────────────────────────────────────
  conclusion:                { focus: "adaptación compatible + ruta de migración reversible",   reasoning_effort: medium, evidence: [veredicto, plan_retirada, deuda],                       acceptance: "veredicto coherente con análisis",                    risk_controls: [] }
  communication:             { focus: "compatibilidad y migración; guía adjunta",               reasoning_effort: medium, evidence: [resumen, cambios, guia, commit],                       acceptance: "commit con metadatos Case:; cita 16 ## Solución ganadora + guía solo con ganadora", risk_controls: [] }
```
<!-- 
<!-- </policy_matrix> --> -->

## Evidence prioritized
Compatibility matrices, contract tests, version before/after.

## Conclusions favored
"Adapted to Y keeping compatibility with X; migration reversible (winning solution Z)."
