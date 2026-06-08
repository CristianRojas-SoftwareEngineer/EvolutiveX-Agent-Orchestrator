# Phase-Policy Schema (profile ↔ phase contract)

This is the ONLY coupling point between profiles and phases. Each profile fills, per phase, the
fields below into `case.md`. Each phase reads its own entry to adapt behavior. Phases never read a
profile skill; profiles never read a phase skill.

## Fields (per phase)

| Field | Type | Meaning |
|-------|------|---------|
| `focus` | string | What to prioritize in this phase under this profile |
| `reasoning_effort` | enum `low\|medium\|high` | Effort/detail expected |
| `evidence` | string[] | Evidence types the profile requires this phase to produce/collect |
| `acceptance` | string | Pass criterion for this phase's artifact |
| `risk_controls` | string[] | Mandatory guards (e.g. sandbox, feature flag, rollback) |

## Location in case.md

`phase_policy` lives inside the **canonical state block** of `case.md` (section "Canonical state"),
alongside `case_mode` and `phases`. There is no separate markdown table for phase status — the YAML
block is the single machine-readable source. Schema validation of this block is a mandatory step of
the orchestrator.

### Canonical-block scalars (siblings of `phase_policy`, NOT matrix entries)

These belong to the canonical state block directly, alongside `case_mode`/`phases`. They are NOT
per-phase policy fields and never appear inside `phase_policy.<phase>`:

| Field | Type | Meaning |
|-------|------|---------|
| `integration_mode` | enum `Completo\|Rápido\|Solo-SM\|Solo-OpenSpec` | SM↔OpenSpec integration mode (set by orchestrator at classification; see integration doc §7) |
| `openspec_change` | string | OpenSpec change name (= `case_id` by convention). Empty in Solo-SM mode; filled by the orchestrator when the change is created at Etapa B (integration doc §5.2, §10.2 r1) |

```yaml
# Inside the canonical state block in case.md:
case_mode: full   # full | consolidated
integration_mode: Solo-SM   # Completo | Rápido | Solo-SM | Solo-OpenSpec
openspec_change: ""         # OpenSpec change name; empty in Solo-SM

phase_policy:
  observation:        { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  problem-definition: { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  research:           { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  hypothesis:         { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  experiment-design:  { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  experiment-execution:{ focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  data-collection:    { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  analysis:           { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  conclusion:         { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  communication:      { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }

phases:
  "01-observation":         { status: pending, artifact: "", version: "" }
  # ... (one entry per phase)
```

## Rule

Changing this schema is an architectural change. Everything else evolves without touching it.

**Note on solution-space fields:** `focus` and `evidence` apply to the cause iteration (the default
space). When the solution loop opens after cause confirmation, the same phase_policy entries
apply to solution hypotheses — the phase adapts its procedure to the solution space without
requiring a separate policy matrix. Profiles add solution-space fields only when a phase must
behave structurally differently in the solution loop (e.g. a comparative metric that has no
meaning in the cause space), without modifying this schema.
