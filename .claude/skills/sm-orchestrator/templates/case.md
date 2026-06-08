---
case_id: <YYYYMMDD-slug>
profile: <corrective|adaptive|perfective|preventive>
created: <ISO-8601 UTC>
status: in_progress           # in_progress | done | aborted
verdict:                       # filled at consolidation
---

# Case Manifest — <case_id>

## Case
<one-paragraph description of the maintenance request>

## Profile parameters
<filled by the sm-profile-* skill: objective, priorities, success metrics, risk thresholds>

## Canonical state (machine-readable — single source of truth)

```yaml
case_mode: full                # full | consolidated  (set by orchestrator at classification)
integration_mode: Solo-SM      # Completo | Rápido | Solo-SM | Solo-OpenSpec  (set by orchestrator; SM↔OpenSpec, see integration doc §7)
openspec_change: ""            # OpenSpec change name (= case_id by convention); empty in Solo-SM mode; filled by orchestrator at Etapa B
solution_hypotheses: []        # optional list of solution-hypothesis slugs produced in phase 04; consumed by phases 05–08 and 09

phase_policy:
  observation:        { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  problem-definition: { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  research:           { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  hypothesis:         { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  experiment-design:  { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  experiment-execution:{ focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  data-collection:    { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  analysis:           { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  conclusion:         { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  communication:      { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }

phases:
  # full mode: artifact = NN-<phase>.md  |  consolidated mode: artifact = case.md#<phase>
  "01-observation":         { status: pending, artifact: "", version: "" }
  "02-problem-definition":  { status: pending, artifact: "", version: "" }
  "03-research":            { status: pending, artifact: "", version: "" }
  "04-hypothesis":          { status: pending, artifact: "", version: "" }
  "05-experiment-design":   { status: pending, artifact: "", version: "" }
  "06-experiment-execution":{ status: pending, artifact: "", version: "" }
  "07-data-collection":     { status: pending, artifact: "", version: "" }
  "08-analysis":            { status: pending, artifact: "", version: "" }
  "09-conclusion":          { status: pending, artifact: "", version: "" }
  "10-communication":       { status: pending, artifact: "", version: "" }
```

<!-- ── CONSOLIDATED MODE ONLY: phase content below (omit in full mode) ──── -->

## Fases
<!-- Each phase produces a subsection here instead of a separate file. -->

### 01 — Observation
<!-- sm-phase-observation writes here -->

### 02 — Problem Definition
<!-- sm-phase-problem-definition writes here -->

### 03 — Research
<!-- sm-phase-research writes here -->

### 04 — Hypothesis
<!-- sm-phase-hypothesis writes here -->

### 05 — Experiment Design
<!-- sm-phase-experiment-design writes here -->

### 06 — Experiment Execution
<!-- sm-phase-experiment-execution writes here -->

### 07 — Data Collection
<!-- sm-phase-data-collection writes here -->

### 08 — Analysis
<!-- sm-phase-analysis writes here -->

### 09 — Conclusion
<!-- sm-phase-conclusion writes here -->

### 10 — Communication
<!-- sm-phase-communication writes here -->
