---
name: sm-phase-analysis
description: >
  Scientific-method phase 08 (Analysis) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Interprets data against the hypothesis and success criterion, adapting via case.md
  phase_policy.analysis. Produces 08-analysis.md.
---

# Phase 08 — Analysis

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.analysis); 04-hypothesis.md; 07-data-collection.md.
- On re-run (Etapa B): the `openspec-verify` output — severities `CRITICAL` / `WARNING` / `SUGGESTION`
  are boundary tokens the orchestrator gates on.

## Procedure
1. Read the policy entry.
2. **Identify the mode from 07-data-collection.md:**
   - **Cause mode:** compare data to each cause hypothesis and to the phase-02 criterion.
     State confirmed/refuted, effect magnitude, threats to validity, side effects.
   - **Solution mode:** compare trade-offs across solution hypotheses using the comparative
     metrics table. Emit a verdict on the winning solution citing the normalized metrics from
     07-data-collection.md and the refutation criteria from 04-hypothesis.md. State each
     alternative's score and the justification for discarding non-winners.
3. Consider alternatives. State magnitude, threats to validity, side effects.

## Re-executability (idempotent; integration doc §5.2)
This phase is **re-runnable and idempotent**. When the integration reaches Etapa B, the orchestrator
re-runs phase 08 to ingest the `openspec-verify` output as a refinement (same inputs, extended), which
is a **MINOR version bump** (see ../sm-orchestrator/references/artifact-conventions.md §Versioning).
The **trigger and ingestion are driven by the orchestrator**, not by this skill; the skill only
supports the re-run. Record the verify findings and the **gate of accepted CRITICALs** (CRITICALs the
user accepts as out of scope are documented explicitly here). Do not collect raw experiment data here
(that is phase 07).
</phase_procedure>

## Output
Write `08-analysis.md`: Applied policy, Verdict on hypotheses, Magnitude, Threats to validity, Side
effects. **Solution comparison** (solution mode only): verdict on the winning solution, with each
alternative's score against the normalized metrics and the justification for discarding non-winners;
this section is the input phase 09 consumes. On the Etapa B re-run, add: verify findings and
accepted-CRITICALs gate.

## Acceptance
Conclusion supported by data; alternatives considered; limits declared. In solution mode: winner
verdict cites comparative metrics and discard justifications.

<constraints>Analyze; the case decision belongs to phase 09.</constraints>
