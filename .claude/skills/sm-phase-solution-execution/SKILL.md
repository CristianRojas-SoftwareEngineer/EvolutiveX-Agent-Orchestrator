---
name: sm-phase-solution-execution
description: >
  Solution-space phase 14 (Sequential Hypothesis Execution) for the two-chain scientific-
  maintenance system. Invoked by sm-orchestrator after phase 13. Executes the hypotheses
  SEQUENTIALLY in priority order, with explicit rollback between runs. Produces
  14-solution-execution.md. Adapts via case.md phase_policy.solution-execution.
---

# Phase 14 — Solution Execution

Sequentially executes each hypothesis; rollback between runs. Operates on the SOLUTION axis.

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.solution-execution).
- `13-solution-experiment-design.md`.

## Procedure
1. Read the policy entry and the design.
2. **Execute hypotheses sequentially in priority order.** For each hypothesis:
   a. Establish the initial-condition snapshot (per phase 13).
   b. Apply the hypothesis's intervention.
   c. Run the shared instrumentation; capture raw metrics.
   d. Compare the captured metrics to the hypothesis's refutation criterion (pass/fail).
   e. **Rollback to the snapshot** before the next hypothesis.
3. Store per-hypothesis raw outputs under
   `maintenance-cases/<case-id>/experiments/solution-<id>/<hypothesis-id>/` (script, raw data,
   notes, result-summary). Voluminous data is stored externally with a `data-location.md`
   pointer instead of being committed.
4. Log every command, every applied change, every rollback step, every deviation (with reason).
5. **Throwaway branches** for larger implementations: `exp/<case-id>/hypothesis-X`. They carry
   the `Case: <case-id>` trailer but are **never merged**.
</phase_procedure>

## Output
Write `14-solution-execution.md` from templates/phase-artifact.md with `chain: solution` in
the frontmatter:
- Applied policy, Per-hypothesis sub-entries (rows: hypothesis; columns: command log, raw
  metrics, refutation-criterion result, rollback verification), Deviations, paths to
  `experiments/solution-<id>/<hypothesis-id>/`, throwaway branches created.

## Acceptance
Hypotheses executed in priority order; rollback verified between runs; deviations documented;
raw outputs in `experiments/solution-<id>/<hypothesis-id>/`; per-hypothesis pass/fail against
the refutation criterion recorded.

<constraints>Execute; do not interpret results here (phase 15 normalizes; phase 16 analyzes).</constraints>
