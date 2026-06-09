---
case_id: 20260609-proxy-concurrent-step-attribution
profile: corrective
created: 2026-06-09T10:00:00Z
status: done
verdict: formalizado — S-A atribución por assignedStepIndex; OpenSpec fix-concurrent-step-attribution apply-ready
---

# Case Manifest — 20260609-proxy-concurrent-step-attribution

## Case

Atribución cruzada de respuestas HTTP en auditoría cuando el harness dispara hops concurrentes dentro del mismo workflow de turno (p. ej. `side-request` `ai-title` + hop `agentic` fresh al inicio del turno). Evidencia: sesión `52f8f157-f66a-4211-931d-93fe9c2b345d` — `steps/01/request` contiene prompt `ai-title` pero `steps/01/response` contiene salida Bash del hop agentic; `steps/02/response` contiene el JSON del título.

## Profile parameters

- **Priorities:** reproduce → root cause → minimal fix → no regression.
- **Success metrics:** test red→green con escenario concurrente; request/response emparejados por hop; cero regresiones.
- **Risk thresholds:** rechazar cambios amplios; rechazar fix sin test; rechazar blast radius innecesario.

## Canonical state (machine-readable — single source of truth)

```yaml
case_mode: full
integration_mode: Completo
openspec_change: "fix-concurrent-step-attribution"
case_run: 1
case_paused_at: ""
case_resumed_at: ""

phase_policy:
  observation:               { focus: "síntomas + pasos de reproducción",                       reasoning_effort: medium, evidence: [stack_trace, repro_steps],                          acceptance: "fallo reproducible o caracterizado con precisión", risk_controls: [] }
  problem-definition:        { focus: "defecto + criterio de no-regresión",                      reasoning_effort: medium, evidence: [],                                                 acceptance: "enunciado falsable y medible",                     risk_controls: [] }
  research:                  { focus: "regresiones recientes + recall por defect-class",         reasoning_effort: medium, evidence: [related_commits, code_refs, recalled_lessons],       acceptance: "recall ejecutado; fuentes citadas",               risk_controls: [] }
  hypothesis:                { focus: "causa raíz más probable y barata de probar",              reasoning_effort: medium, evidence: [prediccion, criterio_refutacion],                   acceptance: "≥1 hipótesis falsable",                           risk_controls: [] }
  experiment-design:         { focus: "test que reproduce el bug primero + rollback",            reasoning_effort: medium, evidence: [procedimiento, controles, rollback],                acceptance: "test de reproducción ejecutable",                  risk_controls: [sandbox] }
  experiment-execution:      { focus: "ejecutar test de reproducción; documentar desviaciones",  reasoning_effort: medium, evidence: [comandos, logs, cambios],                           acceptance: "test rojo reproduce el fallo",                     risk_controls: [sandbox, reversible] }
  data-collection:           { focus: "pass/fail del test + métricas de no-regresión",           reasoning_effort: medium, evidence: [pass_fail, deltas, no_regresion],                   acceptance: "datos trazables a la ejecución",                    risk_controls: [] }
  analysis:                  { focus: "verificar cierre del fallo + no-regresión",              reasoning_effort: medium, evidence: [veredicto, magnitud, amenazas],                      acceptance: "## Causa confirmada presente o refutación explícita", risk_controls: [] }
  solution-research:         { focus: "fixes ya conocidos para esta clase; patrones históricos",  reasoning_effort: medium, evidence: [candidatas, tradeoffs, recall],                      acceptance: "≥2 candidatas viables",                            risk_controls: [] }
  solution-hypothesis:       { focus: "solución más conservadora y mínima; menor blast radius",   reasoning_effort: medium, evidence: [prediccion, blast_radius, reversibilidad],           acceptance: "≥1 hipótesis falsable + criterios",                  risk_controls: [] }
  solution-experiment-design:{ focus: "experimento comparativo + test de no-regresión obligatorio", reasoning_effort: medium, evidence: [procedimiento, controles, rollback],              acceptance: "experimento reproducible",                           risk_controls: [sandbox, feature_flag] }
  solution-execution:        { focus: "ejecución con rollback explícito entre hipótesis",         reasoning_effort: medium, evidence: [comandos, logs, cambios_rollback],                   acceptance: "ejecución limpia; rollback probado",                risk_controls: [sandbox, reversible] }
  solution-data-collection:  { focus: "pass/fail del test por hipótesis; deltas de no-regresión",  reasoning_effort: medium, evidence: [tabla_normalizada, pass_fail],                        acceptance: "tabla con ≥1 fila por hipótesis",                    risk_controls: [] }
  solution-analysis:         { focus: "veredicto de ganadora con diff mínimo citado",              reasoning_effort: medium, evidence: [veredicto, descartadas_con_razon],                   acceptance: "ganadora con justificación cuantitativa si aplica; descartadas + batch note si no", risk_controls: [] }
  conclusion:                { focus: "veredicto: causa confirmada + solución ganadora + diff mínimo", reasoning_effort: medium, evidence: [veredicto, decision, deuda, seguimiento],      acceptance: "veredicto coherente con análisis",                   risk_controls: [] }
  communication:             { focus: "causa raíz + prueba de no-regresión; diff mínimo",         reasoning_effort: medium, evidence: [resumen, cambios, evidencia, commit],                 acceptance: "commit con metadatos Case:; cita 16 ## Solución ganadora solo en rutas con ganadora", risk_controls: [] }

phases:
  "01-observation":                  { status: done, artifact: 01-observation.md, version: v1.0 }
  "02-problem-definition":           { status: done, artifact: 02-problem-definition.md, version: v1.0 }
  "03-research":                     { status: done, artifact: 03-research.md, version: v1.0 }
  "04-hypothesis":                   { status: done, artifact: 04-hypothesis.md, version: v1.0 }
  "05-experiment-design":            { status: done, artifact: 05-experiment-design.md, version: v1.0 }
  "06-experiment-execution":         { status: done, artifact: 06-experiment-execution.md, version: v1.0 }
  "07-data-collection":              { status: done, artifact: 07-data-collection.md, version: v1.0 }
  "08-analysis":                     { status: done, artifact: 08-analysis.md, version: v1.0 }
  "11-solution-research":            { status: done, artifact: 11-solution-research.md, version: v1.0 }
  "12-solution-hypothesis":          { status: done, artifact: 12-solution-hypothesis.md, version: v1.0 }
  "13-solution-experiment-design":   { status: done, artifact: 13-solution-experiment-design.md, version: v1.0 }
  "14-solution-execution":           { status: done, artifact: 14-solution-execution.md, version: v1.0 }
  "15-solution-data-collection":     { status: done, artifact: 15-solution-data-collection.md, version: v1.0 }
  "16-solution-analysis":            { status: done, artifact: 16-solution-analysis.md, version: v1.0 }
  "17-conclusion":                   { status: done, artifact: 17-conclusion.md, version: v1.0 }
  "18-communication":                { status: done, artifact: 18-communication.md, version: v1.0 }
```
