---
name: sm-profile-corrective
description: >
  Corrective maintenance policy for the scientific-maintenance system. Invoked by sm-orchestrator
  to write corrective parameters and the per-phase policy matrix into case.md. Use for bugs,
  regressions, exceptions, production incidents, red tests. Triggers: corregir, arreglar bug,
  regresión, fallo en producción. Does not execute phases.
---

# Profile — Corrective

Policy layer. Writes parameters + phase-policy matrix into `case.md`. Never executes phases or writes
phase artifacts.

<user_communication>Spanish for any user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

## Objective
Restore correct behavior by removing a defect with a minimal, verified change.

## Parameters to write into case.md
- Priorities: reproduce → root cause → minimal fix → no regression.
- Success metrics: reproduction test red→green; zero regressions; time-to-resolution.
- Risk thresholds: reject broad changes for a localized defect; reject a fix without a covering test.

## Phase-policy matrix to write (schema: ../sm-orchestrator/references/phase-policy-schema.md)

<policy_matrix>
```yaml
phase_policy:
  observation:        { focus: "symptoms + reproduction steps", reasoning_effort: medium, evidence: [stack_trace, repro_steps], acceptance: "failure reproducible or precisely characterized", risk_controls: [] }
  problem-definition: { focus: "defect statement + no-regression criterion", reasoning_effort: medium, evidence: [], acceptance: "falsifiable, measurable bug statement", risk_controls: [] }
  research:           { focus: "enumerate cause + solution candidates with trade-offs", reasoning_effort: medium, evidence: [related_commits, code_refs], acceptance: "suspected change(s) localized; solution space enumerated", risk_controls: [] }
  hypothesis:         { focus: "form falsifiable cause + solution hypotheses, one per viable alternative", reasoning_effort: medium, evidence: [], acceptance: "falsifiable root-cause hypothesis; one solution hypothesis per candidate", risk_controls: [] }
  experiment-design:  { focus: "design comparative experiment when solution hypotheses exist; write failing repro test first", reasoning_effort: medium, evidence: [repro_test], acceptance: "repro test + rollback defined; comparative procedure if multiple solutions", risk_controls: [rollback] }
  experiment-execution:{ focus: "run hypotheses sequentially with rollback between runs; confirm red, then apply minimal fix", reasoning_effort: medium, evidence: [test_run], acceptance: "fix applied per design; sub-experiment results logged per hypothesis", risk_controls: [rollback] }
  data-collection:    { focus: "normalize metrics into a common schema across hypotheses; red→green + regression suite", reasoning_effort: medium, evidence: [test_results], acceptance: "repro test passes, suite green; comparative metrics table", risk_controls: [] }
  analysis:           { focus: "compare trade-offs across solutions and emit winner verdict; defect closed without regressions", reasoning_effort: medium, evidence: [], acceptance: "hypothesis confirmed, no regressions; solution comparison with winner", risk_controls: [] }
  conclusion:         { focus: "emit validated spec only when 08-analysis cites a comparative winner; apply fix + add covering test to CI", reasoning_effort: medium, evidence: [], acceptance: "actionable verdict; spec cites 08-analysis solution comparison", risk_controls: [] }
  communication:      { focus: "root cause + no-regression proof", reasoning_effort: medium, evidence: [], acceptance: "self-contained PR/commit draft", risk_controls: [] }
```
</policy_matrix>

## Evidence prioritized
Reproduction test (red→green), stack traces, minimal diff.

## Conclusions favored
"Root cause X corrected, verified by test T, no regressions."
