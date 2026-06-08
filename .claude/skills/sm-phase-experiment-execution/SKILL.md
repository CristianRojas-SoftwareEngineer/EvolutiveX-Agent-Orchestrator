---
name: sm-phase-experiment-execution
description: >
  Scientific-method phase 06 (Experiment Execution) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Executes the designed experiment without deviating from protocol, adapting via
  case.md phase_policy.experiment-execution. Produces 06-experiment-execution.md.
---

# Phase 06 — Experiment Execution

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.experiment-execution); 05-experiment-design.md.

## Procedure
1. Read the policy entry and the design.
2. **Identify the mode from 05-experiment-design.md:**
   - **Cause mode:** execute the repro experiment as designed under the required `risk_controls`.
     Record environment. Store artifacts under `experiments/cause-<id>/`.
   - **Solution mode:** execute each solution hypothesis sequentially in priority order with
     explicit rollback between runs. Store each sub-experiment under `experiments/solution-<id>/`.
     Parallel execution permitted only when experiment cost exceeds coordination overhead;
     document the rationale in the artifact.
3. Log commands, applied changes, raw output, and any deviation (with reason).
</phase_procedure>

## Output
Write `06-experiment-execution.md`: Applied policy, Commands, Changes, Deviations, Raw logs, and the
`experiments/<hypothesis-X>/` paths (and any `exp/<case-id>/hypothesis-X` branches) produced.
**Sub-experiment results** (solution mode only): one entry per solution hypothesis executed, with
its raw output and pass/fail against that hypothesis's refutation criterion.

## Acceptance
Followed the design; deviations documented; environment recorded; reversible.

<constraints>Do not interpret results here; capture them.</constraints>
