# Phase-Policy Schema (profile ↔ phase contract) — 16-key version

This is the ONLY coupling point between profiles and phases. Each profile fills, per phase,
the fields below into `case.md`. Each phase reads its own entry to adapt behavior. Phases
never read a profile skill; profiles never read a phase skill.

## Fields (per phase entry)

| Field | Type | Meaning |
|-------|------|---------|
| `focus` | string | What to prioritize in this phase under this profile |
| `reasoning_effort` | enum `low\|medium\|high` | Effort/detail expected |
| `evidence` | string[] | Evidence types the profile requires this phase to produce/collect |
| `acceptance` | string | Pass criterion for this phase's artifact |
| `risk_controls` | string[] | Mandatory guards (e.g. sandbox, feature flag, rollback) |

## Location in case.md

`phase_policy` lives inside the **canonical state block** of `case.md` (section "Canonical
state"), alongside `case_mode`, `phases`, `case_run`, `case_paused_at`, `case_resumed_at`,
`integration_mode`, and `openspec_change`. There is no separate markdown table for phase
status — the YAML block is the single machine-readable source.
Schema validation of this block is a mandatory step of the orchestrator.

## 16 valid keys (range `01..18`; 09 and 10 are vacante)

The 16 keys in the system of two chains are: `observation`, `problem-definition`, `research`,
`hypothesis`, `experiment-design`, `experiment-execution`, `data-collection`, `analysis`
(cause chain, 8 keys); `solution-research`, `solution-hypothesis`, `solution-experiment-design`,
`solution-execution`, `solution-data-collection`, `solution-analysis` (solution chain, 6 keys);
`conclusion`, `communication` (closure chain, 2 keys).

The numeric range for `NN` is `01..18`; the numbers 09 and 10 are vacante (the original
phases 09 and 10 were renumbered to 17 and 18). Profiles must fill the 16 keys; the
orchestrator validates the schema.

### Canonical-block scalars (siblings of `phase_policy`, NOT matrix entries)

These belong to the canonical state block directly, alongside `case_mode`/`phases`. They are
NOT per-phase policy fields and never appear inside `phase_policy.<phase>`:

| Field | Type | Meaning |
|-------|------|---------|
| `case_run` | integer ≥1 | Run counter for the case (initial 1). Incremented by the orchestrator on each accepted Bucle C re-opening. Closure artifacts 17–18 carry this value in frontmatter. |
| `case_paused_at` | string (ISO-8601 UTC) or `""` | Timestamp of the pause (set by phase 17 on the pause path). Empty until the case pauses. |
| `case_resumed_at` | string (ISO-8601 UTC) or `""` | Timestamp of the latest re-opening (set by the orchestrator when the user accepts Bucle C). Empty until the first re-opening. |
| `integration_mode` | enum | SM↔OpenSpec mode: `Completo`, `Rápido`, `Solo-SM`, `Solo-OpenSpec` (set in orchestrator step 2). |
| `openspec_change` | string | Name of the OpenSpec change after Etapa B; `""` until created. |

```yaml
# Inside the canonical state block in case.md (16-entry matrix):
case_mode: full   # full | consolidated
integration_mode: Completo   # Completo | Rápido | Solo-SM | Solo-OpenSpec (Solo-OpenSpec → early exit step 2)
openspec_change: ""
case_run: 1          # integer ≥1; increments on Bucle C re-opening
case_paused_at: ""   # ISO-8601 UTC or empty
case_resumed_at: ""  # ISO-8601 UTC or empty

phase_policy:
  # causa (01–08)
  observation:               { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  problem-definition:        { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  research:                  { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  hypothesis:                { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  experiment-design:         { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  experiment-execution:      { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  data-collection:           { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  analysis:                  { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  # solución (11–16) — the 6 new keys
  solution-research:         { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  solution-hypothesis:       { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  solution-experiment-design:{ focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  solution-execution:        { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  solution-data-collection:  { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  solution-analysis:         { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  # cierre (17–18) — renumbered from 09–10
  conclusion:                { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  communication:             { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }

phases:
  "01-observation":                  { status: pending, artifact: "", version: "" }
  "02-problem-definition":           { status: pending, artifact: "", version: "" }
  "03-research":                     { status: pending, artifact: "", version: "" }
  "04-hypothesis":                   { status: pending, artifact: "", version: "" }
  "05-experiment-design":            { status: pending, artifact: "", version: "" }
  "06-experiment-execution":         { status: pending, artifact: "", version: "" }
  "07-data-collection":              { status: pending, artifact: "", version: "" }
  "08-analysis":                     { status: pending, artifact: "", version: "" }
  # 09 and 10 are vacante; the next key is 11 (solution chain)
  "11-solution-research":            { status: pending, artifact: "", version: "" }
  "12-solution-hypothesis":          { status: pending, artifact: "", version: "" }
  "13-solution-experiment-design":   { status: pending, artifact: "", version: "" }
  "14-solution-execution":           { status: pending, artifact: "", version: "" }
  "15-solution-data-collection":     { status: pending, artifact: "", version: "" }
  "16-solution-analysis":            { status: pending, artifact: "", version: "" }
  "17-conclusion":                   { status: pending, artifact: "", version: "" }
  "18-communication":                { status: pending, artifact: "", version: "" }
```

## Rule

Changing this schema is an architectural change. Everything else evolves without touching it.
The 16 keys are stable; the only allowed evolution is the addition of NEW chains (e.g. an
"impact" chain in 19+), never the modification of the 16 existing keys' contract.
