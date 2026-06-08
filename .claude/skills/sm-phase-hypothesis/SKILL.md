---
name: sm-phase-hypothesis
description: >
  Scientific-method phase 04 (Hypothesis) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Proposes falsifiable, prioritized hypotheses, adapting via case.md
  phase_policy.hypothesis. Produces 04-hypothesis.md.
---

# Phase 04 — Hypothesis

Operates on the CAUSE axis only (`chain: cause`).

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.hypothesis); 02 and 03.
- On re-invocation (cause refutation loop, Bucle A): existing 04-hypothesis.md is also an input.

## Procedure
1. Read the policy entry.
2. **If 04-hypothesis.md already exists (re-invocation for cause refutation):** read it, append
   the next `pending` cause candidate (do NOT overwrite existing content); mark tested rows
   `tested`/`confirmed`/`refuted` as appropriate after phase 08.
3. **If 04-hypothesis.md does not exist (first pass):** formulate cause hypotheses aligned
   with `focus`; for each, state observable prediction, refutation criterion, priority, and
   `status: pending` (except the active one under test).
</phase_procedure>

## Output
Write (first pass) or update (re-invocation) `04-hypothesis.md` with `chain: cause` in the
frontmatter:
- Cause hypotheses table — columns: name, prediction, refutation criterion, priority,
  `status: pending|tested|confirmed|refuted`.
- On re-invocation: existing content preserved; only new cause hypothesis appended.

## Acceptance
Each hypothesis falsifiable with observable prediction; prioritization justified. On
re-invocation: existing content preserved; only new cause hypothesis appended.

<constraints>Do not design or run experiments here.</constraints>
