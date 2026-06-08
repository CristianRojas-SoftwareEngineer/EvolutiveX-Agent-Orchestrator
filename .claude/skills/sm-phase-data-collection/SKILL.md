---
name: sm-phase-data-collection
description: >
  Scientific-method phase 07 (Data Collection) for the scientific-maintenance system. Invoked
  by sm-orchestrator. Captures execution data in structured form, adapting via case.md
  phase_policy.data-collection. Produces 07-data-collection.md.
---

# Phase 07 — Data Collection

Operates on the CAUSE axis only (`chain: cause`).

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.data-collection); 06-experiment-execution.md.

## Procedure
1. Read the policy entry; the `evidence` field defines mandatory data.
2. Capture raw results faithfully without editing. Normalize to the standard schema (exit
   code, final state, side effects).
</phase_procedure>

## Output
Write `07-data-collection.md` with `chain: cause` in the frontmatter: Applied policy,
Normalized data, Metrics, Before/after.

## Acceptance
Data traceable to execution; units and conditions recorded; raw results unedited.

<constraints>Collect and normalize; do not draw conclusions.</constraints>
