---
name: sm-profile-preventive
description: >
  Preventive maintenance policy for the scientific-maintenance system. Invoked by sm-orchestrator to
  write preventive parameters and the per-phase policy matrix into case.md. Use for audits, hardening,
  fragility analysis, recurring defect classes, potential vulnerabilities, missing critical coverage.
  Triggers: prevenir, endurecer, auditar, hardening, riesgo, vulnerabilidad. Does not execute phases.
---

# Profile — Preventive

Policy layer. Writes parameters + phase-policy matrix into `case.md`. Never executes phases.

<user_communication>Spanish for any user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

## Objective
Reduce the probability or impact of future failures before they occur.

## Parameters to write into case.md
- Priorities: risk identification → mitigation → residual-risk quantification.
- Success metrics: risk demonstrably mitigated; residual risk quantified; guards/coverage added.
- Risk thresholds: reject changes adding net risk; reject mitigation without a validating test; reject
  scope exceeding the addressed risk.

## Phase-policy matrix to write

<policy_matrix>
```yaml
phase_policy:
  observation:        { focus: "weak signals, trends, fragile areas", reasoning_effort: high, evidence: [static_analysis, trend_data], acceptance: "risk surface characterized", risk_controls: [sandbox] }
  problem-definition: { focus: "risk to mitigate + probability/impact", reasoning_effort: medium, evidence: [], acceptance: "risk statement with prob/impact", risk_controls: [] }
  research:           { focus: "defect class / analogous vulnerabilities + knowledge-base recall", reasoning_effort: high, evidence: [threat_model, recalled_lessons], acceptance: "defect class understood", risk_controls: [] }
  hypothesis:         { focus: "risk materialization mechanism", reasoning_effort: medium, evidence: [], acceptance: "falsifiable risk hypothesis", risk_controls: [] }
  experiment-design:  { focus: "test that provokes the risk condition in sandbox", reasoning_effort: high, evidence: [risk_probe], acceptance: "probe + trivial rollback defined", risk_controls: [sandbox, rollback] }
  experiment-execution:{ focus: "provoke condition; add guards/boundary", reasoning_effort: medium, evidence: [probe_run], acceptance: "executed in isolation", risk_controls: [sandbox] }
  data-collection:    { focus: "before/after risk condition", reasoning_effort: medium, evidence: [risk_state_before_after], acceptance: "risk state captured", risk_controls: [] }
  analysis:           { focus: "effective risk reduction + residual", reasoning_effort: high, evidence: [], acceptance: "risk reduced, residual identified", risk_controls: [] }
  conclusion:         { focus: "apply guards; backlog residual paths", reasoning_effort: medium, evidence: [], acceptance: "mitigation + quantified residual", risk_controls: [] }
  communication:      { focus: "risk avoided + residual risk note", reasoning_effort: medium, evidence: [], acceptance: "risk note included", risk_controls: [] }
```
</policy_matrix>

## Evidence prioritized
Tests that provoke the risk condition, static analysis, critical-path coverage, threat models.

## Conclusions favored
"Risk R mitigated by control C; residual quantified and accepted."
