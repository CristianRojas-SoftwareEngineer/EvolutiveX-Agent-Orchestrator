---
name: sm-phase-hypothesis
description: >
  Scientific-method phase 04 (Hypothesis) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Proposes falsifiable, prioritized hypotheses, adapting via case.md
  phase_policy.hypothesis. Produces 04-hypothesis.md.
---

# Phase 04 — Hypothesis

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.hypothesis); 02 and 03.
- On re-invocation (cause refutation loop): existing 04-hypothesis.md is also an input.

## Procedure
1. Read the policy entry.
2. **If 04-hypothesis.md already exists (re-invocation for cause refutation):** read it, append
   the next cause candidate to the existing artifact (do NOT overwrite existing content).
   Stop after the cause hypothesis block — do not regenerate solution hypotheses.
3. **If 04-hypothesis.md does not exist (first pass):** formulate cause hypotheses aligned
   with `focus`; for each, state observable prediction and refutation criterion. Prioritize.
4. **Formulate solution hypotheses** (only in first pass): for each viable solution candidate
   from 03-research §Solution candidates, formulate a falsifiable solution hypothesis with
   observable prediction and refutation criterion. These are speculative — they are not
   acted upon until the cause loop confirms the root cause.
</phase_procedure>

## Output
Write (first pass) or update (re-invocation) `04-hypothesis.md`:
- **Cause hypotheses** — one or more, each with prediction, refutation criterion, priority.
- **Solution hypotheses** (first pass only) — one per viable alternative from 03-research;
  each with prediction, refutation criterion, priority. Parallel to the cause-hypotheses list,
  not a replacement. On re-invocation, this section is preserved as-is.

## Acceptance
Each hypothesis falsifiable with observable prediction; prioritization justified.
On re-invocation: existing content preserved; only new cause hypothesis appended.

<constraints>Do not design or run experiments here.</constraints>
