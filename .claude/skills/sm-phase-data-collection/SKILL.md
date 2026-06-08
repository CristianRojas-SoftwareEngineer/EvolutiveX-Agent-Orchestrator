---
name: sm-phase-data-collection
description: >
  Scientific-method phase 07 (Data Collection) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Captures execution data in structured form, adapting via case.md
  phase_policy.data-collection. Produces 07-data-collection.md.
---

# Phase 07 — Data Collection

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.data-collection); 06-experiment-execution.md.

## Procedure
1. Read the policy entry; the `evidence` field defines mandatory data.
2. **Identify the mode from 06-experiment-execution.md:**
   - **Cause mode:** capture raw results from `experiments/cause-<id>/`. Record faithfully without
     editing. Normalize to the standard schema (exit code, final state, side effects).
   - **Solution mode:** normalize all per-hypothesis metrics into a common schema (latency, exit code,
     final state, side effects) before writing the artifact. Without normalization, phase 08 cannot
     compare trade-offs. Capture results from `experiments/solution-<id>/` for each hypothesis.
3. Never edit raw results; record them faithfully.
</phase_procedure>

This phase captures **experiment** data only. The output of `openspec-verify` is NOT collected here:
it is analysis material ingested by phase 08 in Etapa B (integration doc §4.2/§5.2).

## Output
Write `07-data-collection.md`: Applied policy, Normalized data, Metrics, Before/after.
**Comparative metrics table** (solution mode only): rows are solution hypotheses, columns are the
normalized metrics; this table is the input phase 08 consumes.

## Acceptance
Data traceable to execution; units and conditions recorded; raw results unedited. In solution
mode: comparative metrics table covers all hypotheses with normalized, comparable data.

<constraints>Collect and normalize; do not draw conclusions.</constraints>
