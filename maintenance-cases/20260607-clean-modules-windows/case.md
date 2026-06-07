---
case_id: 20260607-clean-modules-windows
profile: corrective
created: 2026-06-07T20:45:00Z
status: in_progress
verdict:
---

# Case Manifest — 20260607-clean-modules-windows

## Case

El script `clean:modules` (basado en `rimraf`) falla en Windows con error de file lock: `node_modules/` no se elimina completamente, dejando el directorio en estado parcial. Esto causa que los pasos subsecuentes de la pipeline de verificación (`verify:package-scripts`) encuentren `node_modules/` corrupto, lo que rompe los verificadores de typecheck y la cadena de restore (pasos 36-40). El problema se reproduce cada vez que se ejecuta `npm run clean:modules` en este entorno Windows 11.

## Profile parameters

- **Prioridades**: reproduce → root cause → minimal fix → no regression.
- **Success metrics**: test de reproducción rojo→verde; zero regresiones; time-to-resolution.
- **Risk thresholds**: rechazar cambios amplios para un defecto localized; rechazar fix sin test covering.

## Canonical state (machine-readable — single source of truth)

```yaml
case_mode: full
integration_mode: Solo-SM
openspec_change: ""

phase_policy:
  observation:        { focus: "symptoms + reproduction steps", reasoning_effort: medium, evidence: [stack_trace, repro_steps], acceptance: "failure reproducible or precisely characterized", risk_controls: [] }
  problem-definition: { focus: "defect statement + no-regression criterion", reasoning_effort: medium, evidence: [], acceptance: "falsifiable, measurable bug statement", risk_controls: [] }
  research:           { focus: "recent changes / regressions in the area", reasoning_effort: medium, evidence: [related_commits, code_refs], acceptance: "suspected change(s) localized", risk_controls: [] }
  hypothesis:         { focus: "most probable, cheapest-to-test root cause", reasoning_effort: medium, evidence: [], acceptance: "falsifiable root-cause hypothesis", risk_controls: [] }
  experiment-design:  { focus: "write a failing test that reproduces the bug first", reasoning_effort: medium, evidence: [repro_test], acceptance: "repro test + rollback defined", risk_controls: [rollback] }
  experiment-execution:{ focus: "confirm red, then apply minimal fix", reasoning_effort: medium, evidence: [test_run], acceptance: "fix applied per design", risk_controls: [rollback] }
  data-collection:    { focus: "red→green + regression suite", reasoning_effort: medium, evidence: [test_results], acceptance: "repro test passes, suite green", risk_controls: [] }
  analysis:           { focus: "defect closed without regressions", reasoning_effort: medium, evidence: [], acceptance: "hypothesis confirmed, no regressions", risk_controls: [] }
  conclusion:         { focus: "apply fix + add covering test to CI", reasoning_effort: medium, evidence: [], acceptance: "actionable verdict", risk_controls: [] }
  communication:      { focus: "root cause + no-regression proof", reasoning_effort: medium, evidence: [], acceptance: "self-contained PR/commit draft", risk_controls: [] }

phases:
  "01-observation":         { status: done, artifact: "01-observation.md", version: "v1.0" }
  "02-problem-definition":  { status: done, artifact: "02-problem-definition.md", version: "v1.0" }
  "03-research":            { status: done, artifact: "03-research.md", version: "v1.0" }
  "04-hypothesis":          { status: done, artifact: "04-hypothesis.md", version: "v1.0" }
  "05-experiment-design":   { status: done, artifact: "05-experiment-design.md", version: "v1.0" }
  "06-experiment-execution":{ status: done, artifact: "06-experiment-execution.md", version: "v1.0" }
  "07-data-collection":     { status: done, artifact: "07-data-collection.md", version: "v1.0" }
  "08-analysis":            { status: done, artifact: "08-analysis.md", version: "v1.0" }
  "09-conclusion":          { status: done, artifact: "09-conclusion.md", version: "v1.0" }
  "10-communication":       { status: pending, artifact: "", version: "" }
```