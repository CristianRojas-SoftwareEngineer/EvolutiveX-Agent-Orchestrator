---
name: sm-phase-solution-analysis
description: >
  Solution-space phase 16 (Comparative Analysis and Verdict) for the two-chain scientific-
  maintenance system. Invoked by sm-orchestrator after phase 15. Compares trade-offs between
  hypotheses using the normalized table; emits the winning-solution verdict with quantitative
  justification; lists discarded hypotheses with their discard reason. Produces
  16-solution-analysis.md. Adapts via case.md phase_policy.solution-analysis. The
  `## Solución ganadora` section is emitted only when at least one hypothesis wins the batch;
  without a winner, emit `## Hipótesis descartadas` plus a batch note (§7.14). Feeds route **(a)**
  spec via phase 17 when winner exists; route **(b)** cites winner without spec block (§5.3).
---

# Phase 16 — Solution Analysis

Compares normalized trade-offs; emits outputs for phase 17 (§7.14). Does **not** set `case.status` —
closure routes **(a)/(b)/(c)** are decided in phase 17 (§5.3).

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<!-- <phase_procedure> -->
## Inputs
- case.md (phase_policy.solution-analysis).
- `12-solution-hypothesis.md` (refutation criteria of each hypothesis).
- `15-solution-data-collection.md` (normalized comparative table).

## Procedure
1. Read the policy entry.
2. Apply the profile's `focus` to weight the columns of the normalized table (e.g. corrective
   weights diff size + reversibility + no-regression; perfective weights the metric-dominant
   column + p-value; preventive weights coverage of materialization paths + residual risk;
   adaptive weights reversibility + flag isolation + contract preservation).
3. For each hypothesis, compute its score against the weighted criteria. State the score and
   the column-level breakdown.
4. Identify whether any hypothesis wins (highest weighted score meets profile acceptance;
   tie-breakers per profile). If **none** win → no `## Solución ganadora` (orchestrator may
   trigger Bucle B or route **(c)** via phase 17).
5. **If a winner exists:** emit `## Solución ganadora` with winner name, mechanism, key metrics
   from the normalized table, quantitative justification (score + breakdown), predicted diff /
   change description.
6. **Always after a batch:** emit `## Hipótesis descartadas` with each hypothesis name, score,
   and discard reason. If **no winner**, add a **Batch sin ganadora** paragraph under descartadas
   explaining why no hypothesis met the profile threshold.
7. State threats to validity (what could invalidate the verdict; e.g. small N, environment
   drift, untested edge cases).
8. **Idempotence (Bucle B):** a new batch round starts only after exhausting `pending` candidates
   in map 11 (orchestrator re-invokes 12–16). When 13–16 are marked `superseded` for a new round,
   any prior `16-solution-analysis.md` is also `superseded` with `links.previous_version`; the new
   verdict replaces it with a version bump.
<!-- </phase_procedure> -->

## Output
Write `16-solution-analysis.md` from templates/phase-artifact.md with `chain: solution` in the
frontmatter:
- Applied policy, Weighted score table (rows: hypothesis; columns: shared metrics, weighted
  score, breakdown), `## Solución ganadora` (only when winner exists), `## Hipótesis descartadas`
  (mandatory), Threats to validity.

## Acceptance
If winner: `## Solución ganadora` cites at least one quantitative metric. Always: `## Hipótesis
descartadas` with each discard reason; if no winner, batch note present. No winner with zero
evidence. Winner feeds route **(a)**/**(b)** via phase 17; no winner → phase 17 route **(c)** or Bucle B.

<constraints>Analyze; the case decision belongs to phase 17.</constraints>
