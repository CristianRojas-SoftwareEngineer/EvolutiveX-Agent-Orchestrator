---
name: sm-phase-problem-definition
description: >
  Scientific-method phase 02 (Problem Definition) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Turns observations into a precise, bounded, falsifiable problem statement,
  adapting via case.md phase_policy.problem-definition. Produces 02-problem-definition.md.
---

# Phase 02 — Problem Definition

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<!-- <phase_procedure> -->
## Inputs
- case.md (phase_policy.problem-definition); 01-observation.md.

## Procedure
1. Read the policy entry.
2. Convert observations into ONE precise problem statement aligned with `focus`.
3. Define the explicit "solved" criterion, limits, impact and severity.
<!-- </phase_procedure> -->

## Output
Write `02-problem-definition.md` with `chain: cause` in the frontmatter: Applied policy,
Problem statement, Solved criterion, Limits, Severity.

## Acceptance
Falsifiable and measurable statement; explicit success criterion; single problem.

<constraints>Do not formulate hypotheses or solutions here.</constraints>
