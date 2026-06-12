---
name: sm-phase-solution-experiment-design
description: >
  Solution-space phase 13 (Comparative Experiment Design) for the two-chain scientific-maintenance
  system. Invoked by sm-orchestrator after phase 12. Designs a SINGLE comparative experiment
  that covers ALL hypotheses from 12 with shared metrics, identical initial conditions, and an
  explicit rollback protocol between runs. Produces 13-solution-experiment-design.md. Adapts via
  case.md phase_policy.solution-experiment-design.
---

# Phase 13 — Solution Experiment Design

Designs ONE comparative experiment, not one per hypothesis. Operates on the SOLUTION axis.

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<!-- <phase_procedure> -->
## Inputs
- case.md (phase_policy.solution-experiment-design).
- `12-solution-hypothesis.md`.

## Procedure
1. Read the policy entry; honor `risk_controls` (sandbox, feature flag, isolation).
2. Design a **single** comparative procedure that executes all hypotheses in priority order
   under shared conditions:
   - **Shared metrics** (one set, used for every hypothesis — the comparative metrics table of
     phase 15 needs comparable values).
   - **Identical initial conditions** (same dataset / same fixture / same state snapshot per
     hypothesis, so the only difference is the hypothesis's intervention).
   - **Explicit rollback between runs** (each hypothesis's state is reverted before the next
     begins; rollback steps enumerated).
   - **Per-hypothesis criterion** (from the refutation criterion of phase 12; pass/fail at
     execution time).
3. State the **shared instrumentation**: what gets measured, with what tool, in what units, at
   what granularity. Same for every hypothesis.
4. State the **profile-driven emphasis** (e.g. corrective → mandatory no-regression test inside
   the comparative run; perfective → baseline N runs before any hypothesis; preventive →
   isolation of risk injection).
<!-- </phase_procedure> -->

## Output
Write `13-solution-experiment-design.md` from templates/phase-artifact.md with `chain: solution`
in the frontmatter:
- Applied policy, Shared metrics table, Initial-condition snapshot, Per-hypothesis run
  procedure (rows: hypothesis, refutation criterion, expected metric range), Rollback between
  runs, Instrumentation, Profile-driven emphasis.

## Acceptance
A single procedure covers all hypotheses; shared metrics; identical initial conditions;
rollback between runs enumerated; per-hypothesis criterion traceable to phase 12.

<constraints>Design the comparative procedure; do not execute.</constraints>
