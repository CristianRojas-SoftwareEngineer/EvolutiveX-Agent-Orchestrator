---
name: sm-phase-conclusion
description: >
  Closure phase 17 (Conclusion) for the two-chain scientific-maintenance system. Invoked by
  sm-orchestrator. Decides the case outcome and resulting action, and distills a lesson into
  the knowledge base. Consumes data from BOTH chains: 02, 08 (cause) and 16 (solution). Adapts
  via case.md phase_policy.conclusion. Produces 17-conclusion.md. The MANDATORY
  `## Solución ganadora` in 16 when present is the precondition for emitting the spec (§5.3 route
  **(a)** only). Handles routes **(a)/(b)/(c)**: Solo-SM investigativo close
  (`done` without spec, even with winner), pause (`pausado`), and Bucle C with `case_run`.
---

# Phase 17 — Conclusion

Closes the case by deciding the outcome and the action. Consumes data from both chains.

## Closure routes (§5.3)

| Route | `status` | Spec / Etapa B |
| ----- | -------- | -------------- |
| **(a)** | `done` | Validated spec; Etapa B if ≠ Solo-SM |
| **(b)** | `done` | Solo-SM + `## Solución ganadora`; no spec |
| **(c)** | `pausado` | No spec; Bucle C offer in phase 18 |

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.conclusion).
- `02-problem-definition.md` (problem statement + success criterion).
- `08-analysis.md` (cause verdict).
- `16-solution-analysis.md` — only when chain state is `completa_12-16` (not for `no_abierta` or
  `parcial_11`).
- Knowledge-base schema: ../sm-orchestrator/references/knowledge-base.md.

## Procedure
1. Read the policy entry.
2. **Route decision** (§5.3 order; execute **one** branch only):
   a. After Bucle A is exhausted (no `pending` in `04`), if `08` lacks `## Causa confirmada` →
      route **(c)** (`no_abierta`, `pause_reason: candidatas_agotadas`, Bucle C **`C1`**).
   b. Else if chain state `parcial_11` → route **(c)** (`no_viable_solution_space`, **`C3`**; do
      NOT read 16).
   c. Else if `completa_12-16` and `16` lacks `## Solución ganadora` → route **(c)**
      (`candidatas_agotadas`, **`C2`**).
   d. Else if `integration_mode` is `Solo-SM` → route **(b)** investigativo close.
   e. Else → route **(a)** close with verified spec.
3. **Branch (a) — close with spec:** contrast the analysis with the phase-02 success criterion;
   decide apply / revert / escalate; record residuals, debt, follow-ups. Verify
   `16-solution-analysis.md` contains `## Solución ganadora` with discard justifications (§5.3).
   Produce the validated specification citing the winner and each discarded alternative. Set
   `status: done` in case.md. → go to step 4.
4. **Branch (b) — investigativo close (Solo-SM):** cite `## Solución ganadora` from 16 if present;
   set `status: done`; do NOT emit validated spec or trigger Etapa B. → go to step 5.
5. **Branch (c) — pause:** set `status: pausado` and `case_paused_at: <ISO-8601 UTC>` in case.md;
   set `phases.conclusion: done` (phase executed — distinct from `case.status`). Pause note:
   `pause_reason` token (`candidatas_agotadas` or `no_viable_solution_space`) and Bucle C trigger
   (`C1`, `C2`, or `C3`). Offer documented in phase 18. → go to step 6.
6. **Common final (all branches):** set `phases.conclusion: done` in the canonical block if not
   already set; distill one lesson into `.claude/memory/` with tags; index in `MEMORY.md`; write
   `17-conclusion.md` per Output below.
</phase_procedure>

## Output
- Write `17-conclusion.md` with `chain: closure` in the frontmatter:
  - **Verdict** — winning cause (from 08), winning solution (from 16 — when both exist),
    discarded hypotheses (with justification), confidence level, known residual risks.
  - **Validated specification** (only on route **(a)**): problem (→ proposal), bounded scope,
    expected behavior delta, key architectural decisions, acceptance criteria, experimental
    evidence (refs to 06/07/08/14/15/16 + experiments/), **Solución seleccionada (vs
    alternativas)** — winner cited from 16-solution-analysis.md ## Solución ganadora; each
    discarded alternative cited with its discard reason. Cross-reference mandatory.
  - **Pause note** (only on route **(c)**): explicit "no resuelto" verdict; reason
    `candidatas_agotadas` or `no_viable_solution_space`; `case_paused_at` timestamp.
  - **Investigativo note** (route **(b)**): investigation closed without spec; may cite
    `## Solución ganadora` from 16 when present — no "Validated specification" block.
  - **References** — case, expediente, experiments/, lesson link.
- Write the lesson file in `.claude/memory/` and index it in `MEMORY.md`.

## Acceptance
Verdict coherent with the analysis; phase-02 criterion checked; actions actionable;
validated-spec structure present on close-with-spec path; investigativo note on Solo-SM close;
pause note present on the pause path;
lesson written with tags that enable phase-03 / phase-11 recall in both paths.

<constraints>Decide, write the validated spec (close) or the pause note (pause), and the
lesson. Do not produce the human communication (phase 18). Do not write the changelog or any
case ledger (both are derived).</constraints>
