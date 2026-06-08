---
name: sm-profile-adaptive
description: >
  Adaptive maintenance policy for the scientific-maintenance system. Invoked by sm-orchestrator to
  write adaptive parameters and the per-phase policy matrix into case.md. Use for dependency
  upgrades, deprecations, new platforms/APIs, regulatory changes. Triggers: migrar, actualizar
  dependencia, adaptar, deprecación, compatibilidad. Does not execute phases.
---

# Profile — Adaptive

Policy layer. Writes parameters + phase-policy matrix into `case.md`. Never executes phases.

<user_communication>Spanish for any user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

## Objective
Adapt the software to an external change while preserving compatibility.

## Parameters to write into case.md
- Priorities: compatibility → safe migration → coverage of the new contract.
- Success metrics: suite green on the new target; no public-contract breakage; documented migration.
- Risk thresholds: reject non-isolated changes (no feature flag); reject irreversible migrations
  without proof.

## Phase-policy matrix to write

<policy_matrix>
```yaml
phase_policy:
  observation:        { focus: "environment/requirement delta + current usage", reasoning_effort: medium, evidence: [usage_map, deprecation_notice], acceptance: "delta and impacted surface mapped", risk_controls: [] }
  problem-definition: { focus: "required compatibility delta", reasoning_effort: medium, evidence: [], acceptance: "explicit compatibility target", risk_controls: [] }
  research:           { focus: "new API/contract + breaking changes", reasoning_effort: high, evidence: [api_diff, docs], acceptance: "breaking changes enumerated", risk_controls: [] }
  hypothesis:         { focus: "adaptation strategy preserving compatibility", reasoning_effort: medium, evidence: [], acceptance: "testable adaptation strategy", risk_controls: [] }
  experiment-design:  { focus: "compatibility/contract tests for old+new", reasoning_effort: medium, evidence: [contract_tests], acceptance: "tests + feature-flag rollback defined", risk_controls: [feature_flag, rollback] }
  experiment-execution:{ focus: "implement behind a flag; run both contract tests", reasoning_effort: medium, evidence: [test_run], acceptance: "implemented per design", risk_controls: [feature_flag] }
  data-collection:    { focus: "compatibility matrix old/new", reasoning_effort: medium, evidence: [compat_matrix], acceptance: "matrix green", risk_controls: [] }
  analysis:           { focus: "compatibility confirmed, no public breakage", reasoning_effort: medium, evidence: [], acceptance: "compatibility validated", risk_controls: [] }
  conclusion:         { focus: "gradual rollout + old-version retirement plan", reasoning_effort: medium, evidence: [], acceptance: "reversible migration plan", risk_controls: [feature_flag] }
  communication:      { focus: "compatibility + migration guide", reasoning_effort: medium, evidence: [], acceptance: "migration guide included", risk_controls: [] }
```
</policy_matrix>

## Evidence prioritized
Compatibility matrices, contract tests, version before/after.

## Conclusions favored
"Adapted to Y keeping compatibility with X; migration reversible."
