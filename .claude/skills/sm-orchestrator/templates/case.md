---
case_id: <YYYYMMDD-slug>
profile: <corrective|adaptive|perfective|preventive>
created: <ISO-8601 UTC>
status: in_progress           # in_progress | pausado | done | aborted
verdict:                       # filled at consolidation
---

# Case Manifest — <case_id>

## Case
<one-paragraph description of the maintenance request>

## Profile parameters
<filled by the sm-profile-* skill: objective, priorities, success metrics, risk thresholds>

## Canonical state (machine-readable — single source of truth)

```yaml
case_mode: full                # full | consolidated
integration_mode: Completo     # Completo | Rápido | Solo-SM | Solo-OpenSpec (Solo-OpenSpec → orchestrator early exit step 2)
openspec_change: ""              # filled after openspec-propose/ff/continue in Etapa B
case_run: 1                    # integer ≥1; increments on each Bucle C re-opening
case_paused_at: ""             # ISO-8601 UTC; empty until phase 17 pauses the case
case_resumed_at: ""            # ISO-8601 UTC; empty until the first Bucle C re-opening

phase_policy:
  # causa (01–08)
  observation:               { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  problem-definition:        { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  research:                  { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  hypothesis:                { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  experiment-design:         { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  experiment-execution:      { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  data-collection:           { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  analysis:                  { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  # solución (11–16) — 6 new keys
  solution-research:         { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  solution-hypothesis:       { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  solution-experiment-design: { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  solution-execution:        { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  solution-data-collection:  { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  solution-analysis:         { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  # cierre (17–18) — renumbered from 09–10
  conclusion:                { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  communication:             { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }

phases:
  # full mode: artifact = NN-<phase>.md  |  consolidated mode: artifact = case.md#<phase>
  "01-observation":                  { status: pending, artifact: "", version: "" }
  "02-problem-definition":           { status: pending, artifact: "", version: "" }
  "03-research":                     { status: pending, artifact: "", version: "" }
  "04-hypothesis":                   { status: pending, artifact: "", version: "" }
  "05-experiment-design":            { status: pending, artifact: "", version: "" }
  "06-experiment-execution":         { status: pending, artifact: "", version: "" }
  "07-data-collection":              { status: pending, artifact: "", version: "" }
  "08-analysis":                     { status: pending, artifact: "", version: "" }
  # 09 and 10 are vacante (renumbered to 17 and 18)
  "11-solution-research":            { status: pending, artifact: "", version: "" }
  "12-solution-hypothesis":          { status: pending, artifact: "", version: "" }
  "13-solution-experiment-design":   { status: pending, artifact: "", version: "" }
  "14-solution-execution":           { status: pending, artifact: "", version: "" }
  "15-solution-data-collection":     { status: pending, artifact: "", version: "" }
  "16-solution-analysis":            { status: pending, artifact: "", version: "" }
  "17-conclusion":                   { status: pending, artifact: "", version: "" }
  "18-communication":                { status: pending, artifact: "", version: "" }
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
<!-- sm-phase-hypothesis writes here (Bucle A re-invocation appends, never overwrites) -->

### 05 — Experiment Design
<!-- sm-phase-experiment-design writes here -->

### 06 — Experiment Execution
<!-- sm-phase-experiment-execution writes here -->

### 07 — Data Collection
<!-- sm-phase-data-collection writes here -->

### 08 — Analysis
<!-- sm-phase-analysis writes here; mandatory `## Causa confirmada` for solution chain to open -->

### 11 — Solution Research
<!-- sm-phase-solution-research writes here -->

### 12 — Solution Hypothesis
<!-- sm-phase-solution-hypothesis writes here (Bucle B re-invocation appends, never overwrites) -->

### 13 — Solution Experiment Design
<!-- sm-phase-solution-experiment-design writes here -->

### 14 — Solution Execution
<!-- sm-phase-solution-execution writes here -->

### 15 — Solution Data Collection
<!-- sm-phase-solution-data-collection writes here -->

### 16 — Solution Analysis
<!-- sm-phase-solution-analysis writes here; `## Solución ganadora` only when batch has winner (§7.14) -->

### 17 — Conclusion
<!-- sm-phase-conclusion writes here; consumes 02, 08, 16 -->

### 18 — Communication
<!-- sm-phase-communication writes here; runs the changelog generator, drafts the commit with `Case:` trailer -->
