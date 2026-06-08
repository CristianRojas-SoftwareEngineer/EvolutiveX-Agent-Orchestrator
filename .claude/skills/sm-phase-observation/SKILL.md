---
name: sm-phase-observation
description: >
  Scientific-method phase 01 (Observation) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Captures the observable state and symptoms without interpretation, adapting to
  the active profile via case.md phase_policy.observation. Produces maintenance-cases/<case-id>/01-observation.md.
---

# Phase 01 — Observation

Generic, profile-parameterized. Reads policy; never decides order; never consolidates.

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (profile + phase_policy.observation)
- The user request; access to code, logs, metrics, tests, issues.

## Procedure
1. Read case.md → `phase_policy.observation` (focus, reasoning_effort, evidence, acceptance, risk_controls).
2. Collect observable facts in line with `focus` and gather every required `evidence` item.
3. Record facts only — no causes, no fixes. Date and source each fact.
4. Delimit scope.
</phase_procedure>

## Output
Write `maintenance-cases/<case-id>/01-observation.md` from templates/phase-artifact.md with
`chain: cause` in the frontmatter:
- Applied policy (echo), Observed facts, Context, Scope, "Not interpreted" note.

## Acceptance
Meets `acceptance`: facts verifiable and dated; no assumed cause; scope bounded.

<constraints>No interpretation or proposed fixes. No phase ordering decisions.</constraints>
