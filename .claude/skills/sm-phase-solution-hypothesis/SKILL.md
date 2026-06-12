---
name: sm-phase-solution-hypothesis
description: >
  Solution-space phase 12 (Solution Hypothesis) for the two-chain scientific-maintenance system.
  Invoked by sm-orchestrator after phase 11. For each viable solution from the solution space,
  formulates a falsifiable hypothesis with observable prediction and refutation criterion. Produces
  12-solution-hypothesis.md. Adapts via case.md phase_policy.solution-hypothesis. Idempotent:
  re-invoked by the solution batch loop (Bucle B), appends new hypotheses without
  overwriting refuted ones.
---

# Phase 12 — Solution Hypothesis

Narrows the solution space to falsifiable hypotheses. Operates on the SOLUTION axis.

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<!-- <phase_procedure> -->
## Inputs
- case.md (phase_policy.solution-hypothesis).
- `11-solution-research.md`.
- On re-invocation (Bucle B, solution batch loop): the existing `12-solution-hypothesis.md`
  and the set of pending candidates from `11-solution-research.md` that were not yet formulated.

## Procedure
1. Read the policy entry.
2. **If 12-solution-hypothesis.md already exists (re-invocation for solution batch loop):** read
   `11-solution-research.md` for candidates with `status: pending` not yet formulated in 12;
   append them as new hypothesis rows. Do NOT overwrite or remove previously tested hypotheses —
   they are the audit trail (batch comparison in 16 already concluded none won). Mark appended
   sources as `explored` in 11 when moved into 12.
3. **If 12-solution-hypothesis.md does not exist (first pass):** for each viable solution from
   `11-solution-research.md`, formulate a hypothesis: name, mechanism, **observable prediction**
   (what the experiment will measure if the solution wins), **refutation criterion** (what
   measurement value falsifies it), priority (per the profile's `focus`).
4. Cover the prioritization rationale: why this order, what trade-off each priority embodies.
<!-- </phase_procedure> -->

## Output
Write (first pass) or update (re-invocation) `12-solution-hypothesis.md` from
templates/phase-artifact.md with `chain: solution` in the frontmatter:
- Applied policy, Solution hypotheses table (rows: hypothesis; columns: prediction, refutation
  criterion, priority, profile-driven trade-off), Prioritization rationale,
  Discarded alternatives (with one-line reason — these did not pass the viability filter of
  phase 11).

## Acceptance
At least one hypothesis falsifiable; each hypothesis with observable prediction and
refutation criterion; prioritization justified by the profile's focus. On re-invocation:
existing content preserved; only new hypothesis appended.

<constraints>Formulate hypotheses; do not design or run experiments.</constraints>
