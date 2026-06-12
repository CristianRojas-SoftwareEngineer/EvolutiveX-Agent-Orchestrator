---
name: sm-phase-experiment-design
description: >
  Scientific-method phase 05 (Experiment Design) for the scientific-maintenance system. Invoked
  by sm-orchestrator. Designs the minimal-risk experiment to confirm/refute the hypothesis,
  adapting via case.md phase_policy.experiment-design. Produces 05-experiment-design.md.
---

# Phase 05 — Experiment Design

Operates on the CAUSE axis only (`chain: cause`).

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<!-- <phase_procedure> -->
## Inputs
- case.md (phase_policy.experiment-design); 04-hypothesis.md.

## Procedure
1. Read the policy entry; honor `risk_controls` (e.g. sandbox, feature_flag, rollback).
2. Design a reproducible procedure with variables, controls, success/failure criteria.
3. Define an explicit rollback. Keep cost bounded by `reasoning_effort`.
<!-- </phase_procedure> -->

## Output
Write `05-experiment-design.md` with `chain: cause` in the frontmatter: Applied policy,
Procedure, Variables, Controls, Success/Failure, Rollback.

## Acceptance
Reproducible; controls defined; rollback explicit; cost bounded.

<constraints>Design only; do not execute.</constraints>
