---
name: sm-phase-analysis
description: >
  Scientific-method phase 08 (Analysis) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Interprets data against the hypothesis and success criterion, adapting via
  case.md phase_policy.analysis. Produces 08-analysis.md. Emits exactly one of `## Causa confirmada`
  or `## Causa refutada` per iteration; confirmed cause gates the solution chain (§5.2).
---

# Phase 08 — Analysis

Operates on the CAUSE axis only (`chain: cause`).

<!-- <!-- <user_communication> -->
 -->
Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.
<!-- 
<!-- </user_communication> --> -->

<!-- <phase_procedure> -->
## Inputs
- case.md (phase_policy.analysis); 04-hypothesis.md; 07-data-collection.md.

## Procedure
1. Read the policy entry.
2. Compare data to the cause hypothesis and to the phase-02 criterion.
3. State confirmed/refuted, effect magnitude, threats to validity, side effects.
4. When the cause is **confirmed**, emit `## Causa confirmada: <brief>` with evidence (gates
   solution chain, §5.2).
5. When **refuted**, emit `## Causa refutada: <brief>` with evidence; if `pending` candidates
   remain in `04-hypothesis.md`, Bucle A re-enters phase 04; otherwise orchestrator routes to
   phase 17 route **(c)** (`no_abierta`, **`C1`**).
<!-- </phase_procedure> -->

## Output
Write `08-analysis.md` with `chain: cause` in the frontmatter: Applied policy, Verdict on cause
hypothesis, Magnitude, Threats to validity, Side effects. Exactly one of **`## Causa confirmada`**
or **`## Causa refutada`**.

## Acceptance
Conclusion supported by data; alternatives considered; limits declared. Exactly one of
`## Causa confirmada` or `## Causa refutada` (never both, never neither).

<!-- <!-- <constraints> -->
 -->
Analyze; the case decision belongs to phase 17.
<!-- 
<!-- </constraints> --> -->
