---
name: sm-phase-solution-data-collection
description: >
  Solution-space phase 15 (Comparative Data Collection and Normalization) for the two-chain
  scientific-maintenance system. Invoked by sm-orchestrator after phase 14. Captures and
  NORMALIZES the metrics of each hypothesis to a common schema. Produces
  15-solution-data-collection.md. Adapts via case.md phase_policy.solution-data-collection.
---

# Phase 15 — Solution Data Collection

Normalizes per-hypothesis metrics into a single comparable table. Operates on the SOLUTION axis.

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<!-- <phase_procedure> -->
## Inputs
- case.md (phase_policy.solution-data-collection).
- `14-solution-execution.md` and the per-hypothesis raw outputs in
  `experiments/solution-<id>/<hypothesis-id>/`.

## Procedure
1. Read the policy entry; the `evidence` field defines mandatory data.
2. **Normalize** every hypothesis's metrics to the **common schema** defined in phase 13 (shared
   metrics). Columns are shared; rows are hypotheses. Without normalization, phase 16 cannot
   compare trade-offs.
3. Required columns (minimum): hypothesis name, mechanism, latency, exit code, final state,
   side effects, profile-dominant metric (e.g. diff size for corrective; reversibility for
   adaptive; p-value for perfective; coverage of materialization paths for preventive).
4. Cells with no measurement are marked explicitly (e.g. `n/a` with reason) — they are NOT
   treated as zero, which would distort the comparison.
5. Never edit raw results; record them faithfully.
<!-- </phase_procedure> -->

## Output
Write `15-solution-data-collection.md` from templates/phase-artifact.md with `chain: solution`
in the frontmatter:
- Applied policy, Normalized comparative table (rows: hypothesis; columns: shared metrics),
  Schema definition, Source paths to raw outputs, Cells with no measurement (with reason),
  Units and conditions.

## Acceptance
Every hypothesis has a row; metrics are of the same type per column; units and conditions
recorded; cells with no measurement are explicit; raw outputs unedited. The table is the input
phase 16 consumes.

<constraints>Normalize; do not draw conclusions.</constraints>
