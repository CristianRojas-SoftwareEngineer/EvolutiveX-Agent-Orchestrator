---
name: sm-phase-experiment-execution
description: >
  Scientific-method phase 06 (Experiment Execution) for the scientific-maintenance system.
  Invoked by sm-orchestrator. Executes the designed experiment without deviating from protocol,
  adapting via case.md phase_policy.experiment-execution. Produces 06-experiment-execution.md.
---

# Phase 06 — Experiment Execution

Operates on the CAUSE axis only (`chain: cause`).

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<!-- <phase_procedure> -->
## Inputs
- case.md (phase_policy.experiment-execution); 05-experiment-design.md.

## Procedure
1. Read the policy entry and the design.
2. Execute the experiment as designed under the required `risk_controls`. Record environment.
3. Log commands, applied changes, raw output, and any deviation (with reason).
<!-- </phase_procedure> -->

## Output
Write `06-experiment-execution.md` with `chain: cause` in the frontmatter: Applied policy,
Commands, Changes, Deviations, Raw logs.

## Acceptance
Followed the design; deviations documented; environment recorded; reversible.

<constraints>Do not interpret results here; capture them.</constraints>
