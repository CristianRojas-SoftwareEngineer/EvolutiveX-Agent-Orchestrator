---
name: sm-profile-perfective
description: >
  Perfective maintenance policy for the scientific-maintenance system. Invoked by sm-orchestrator to
  write perfective parameters and the per-phase policy matrix into case.md. Use for performance,
  readability, maintainability, refactor, optimization with no functional change. Triggers:
  optimizar, refactorizar, rendimiento, deuda técnica, mejorar calidad. Does not execute phases.
---

# Profile — Perfective

Policy layer. Writes parameters + phase-policy matrix into `case.md`. Never executes phases.

<user_communication>Spanish for any user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

## Objective
Improve quality attributes (performance, readability, maintainability, UX) without changing
functional behavior.

## Parameters to write into case.md
- Priorities: measurable improvement → behavior preservation → no quality regression.
- Success metrics: statistically significant improvement of the target metric; functional suite green.
- Risk thresholds: reject optimization without a baseline; reject refactor without a test net; reject
  improvements within noise.

## Phase-policy matrix to write

<policy_matrix>
```yaml
phase_policy:
  observation:        { focus: "current quality metric + hotspots", reasoning_effort: medium, evidence: [profile, metric_baseline], acceptance: "baseline measured", risk_controls: [] }
  problem-definition: { focus: "target metric + threshold, behavior invariant", reasoning_effort: medium, evidence: [], acceptance: "metric target with threshold", risk_controls: [] }
  research:           { focus: "optimization patterns / smells", reasoning_effort: medium, evidence: [code_refs, benchmarks], acceptance: "improvement candidate identified", risk_controls: [] }
  hypothesis:         { focus: "candidate change improves metric, keeps behavior", reasoning_effort: medium, evidence: [], acceptance: "testable optimization hypothesis", risk_controls: [] }
  experiment-design:  { focus: "A/B benchmark, equal-output check", reasoning_effort: high, evidence: [benchmark_plan], acceptance: "baseline N runs + output-equality + rollback", risk_controls: [rollback] }
  experiment-execution:{ focus: "apply change; run benchmark before/after", reasoning_effort: medium, evidence: [benchmark_run], acceptance: "applied per design", risk_controls: [rollback] }
  data-collection:    { focus: "metric deltas with variance + output snapshot", reasoning_effort: high, evidence: [metric_deltas, output_snapshot], acceptance: "deltas with variance recorded", risk_controls: [] }
  analysis:           { focus: "significance + behavior invariance", reasoning_effort: high, evidence: [], acceptance: "significant improvement, behavior unchanged", risk_controls: [] }
  conclusion:         { focus: "accept optimization, functional suite green", reasoning_effort: medium, evidence: [], acceptance: "accept/reject with numbers", risk_controls: [] }
  communication:      { focus: "metric delta narrative", reasoning_effort: medium, evidence: [], acceptance: "before/after numbers included", risk_controls: [] }
```
</policy_matrix>

## Evidence prioritized
Reproducible benchmarks, performance profiles, complexity metrics, coverage.

## Conclusions favored
"Metric M improved by Δ (p<threshold) with no functional change."
