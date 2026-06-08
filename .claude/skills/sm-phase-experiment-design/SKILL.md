---
name: sm-phase-experiment-design
description: >
  Scientific-method phase 05 (Experiment Design) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Designs the minimal-risk experiment to confirm/refute the hypothesis, adapting via
  case.md phase_policy.experiment-design. Produces 05-experiment-design.md.
---

# Phase 05 — Experiment Design

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.experiment-design); 04-hypothesis.md.

## Procedure
1. Read the policy entry; honor `risk_controls` (e.g. sandbox, feature_flag, rollback).
2. **Identify the active hypothesis type from 04-hypothesis.md:**
   - If 04-hypothesis.md contains a confirmed cause verdict from a prior 08-analysis run → solution
     mode: design the comparative experiment for the solution hypotheses listed in §Solution
     hypotheses.
   - Otherwise → cause mode: design the repro experiment for the active (unconfirmed) cause
     hypothesis.
3. **Cause mode:** design a reproducible procedure with variables, controls, success/failure criteria.
   Define an explicit rollback. Keep cost bounded by `reasoning_effort`.
4. **Solution mode:** design a comparative experiment for all solution hypotheses: same metrics
   for all alternatives, same initial conditions, same rollback protocol between runs. The repro
   test is the starting point (know the bug reproduces), not the goal. List the shared metrics,
   initial conditions, and rollback steps.
</phase_procedure>

## Output
Write `05-experiment-design.md`: Applied policy, Procedure, Variables, Controls, Success/Failure,
Rollback. **Comparative procedure** (solution mode only: list metrics, initial conditions, and
rollback steps shared across all solution hypotheses).

## Acceptance
Reproducible; controls defined; rollback explicit; cost bounded. In solution mode: comparative
procedure covers all solution hypotheses with comparable metrics.

<constraints>Design only; do not execute.</constraints>
