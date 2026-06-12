---
name: sm-orchestrator
description: >
  Drive a software maintenance case end-to-end as two sequential scientific methods: the CAUSE
  chain (phases 01–08) and the SOLUTION chain (phases 11–16, opened only when phase 08 confirms
  a cause), with a CLOSURE phase (17–18) that consumes data from both chains. Chain states
  no_abierta/parcial_11/completa_12-16 (§5.2); closure routes (a)/(b)/(c) (§5.3); Bucle C
  triggers C1–C3 with ctx-a/b/c re-opening (§3.1.3). Pick a maintenance profile and case mode
  (full/consolidated); run 16 specialized phases in order with 3 loops (cause refutation, solution
  batch loop, post-no-resuelto re-opening); consolidate a verdict; apply/verify tree (step 9 items
  6a/6b); re-run phase 17 (MINOR) on verify refutada (step 9 item 7); exclusive Etapa C tree
  (step 10); distill a lesson; run OpenSpec
  Etapa B/C when integration_mode allows; changelog generator; commit with `Case:` trailer.
  Use when the user asks
  to maintain, fix a bug, correct a regression, optimize,
  refactor, migrate, upgrade a dependency, adapt to a new API/platform, harden, audit, or
  reduce risk. Also trigger for: mantener, corregir bug, arreglar, optimizar, refactorizar,
  migrar, actualizar dependencia, adaptar, endurecer, auditar, prevenir, mantenimiento
  correctivo/adaptativo/perfectivo/preventivo.
---

# Scientific Maintenance — Orchestrator (two-chain system)

Conducts a maintenance case through TWO sequential scientific methods. Owns the FLOW;
delegates POLICY to a profile skill and PROCEDURE to phase skills. Never implements profile
policy or phase procedure.

<user_communication>Talk to the user in Spanish (questions, confirmations, summaries). Keep
artifacts' machine fields in English. Canonical policy: ../artifact-structuring/SKILL.md
§language_policy.</user_communication>

## Workflow

1. **Identify the case.** Derive `case-id = YYYYMMDD-<slug>`. If a `case-id` is given, resume
   from `maintenance-cases/<case-id>/case.md`.
2. **Classify the profile and integration mode.** Use references/classification-guide.md to
   pick one of corrective, adaptive, perfective, preventive. If ambiguous, ask the user in
   Spanish (offer the 2 best fits). Then pick the SM↔OpenSpec `integration_mode` (§12.2.4):
   `Completo`, `Rápido`, `Solo-SM`, or `Solo-OpenSpec`. If `Solo-OpenSpec`: inform the user in
   Spanish that the entrypoint is the OpenSpec flow directly (`openspec-propose`, etc.); **terminate**
   the orchestrator without creating `case.md`.
3. **Create the manifest.** Copy templates/case.md to `maintenance-cases/<case-id>/case.md`;
   fill case_id, profile, case_mode (consolidated for trivial/localized fixes, full otherwise),
   `integration_mode`, `openspec_change: ""`, and the 16 phases as `pending` in the canonical
   YAML block. The numeric range is `01..18` (with 09–10 vacante — renumbered to 17, 18).
4. **Load policy.** Invoke the matching `sm-profile-<x>` skill. It writes its parameters and
   the **16-entry** phase-policy matrix into the canonical YAML block in case.md. **Validate
   the schema** (mandatory): confirm case_mode, integration_mode, and openspec_change are set;
   all 16 phase_policy entries are present; all 16 phases entries exist with valid status values;
   `case_run` (integer ≥1), `case_paused_at` and `case_resumed_at` keys exist (empty allowed for
   pause/resume). Reject case.md containing `solution_hypotheses` (removed in two-chain v1.1).
   Do not proceed until validation passes.
5. **Run the CAUSE chain (phases 01–08).** Apply preconditions **by chain** (§5.1): within
   01–08, phase N requires the previous phase in the chain `done`. For each phase, invoke the
   matching `sm-phase-*` skill. After each phase: confirm artifact exists; mark `done` and
   record artifact + version. Infer `chain: cause` in frontmatter when absent (phases 01–08).
   (Phase 03 reads MEMORY.md; phase 08 emits `## Causa confirmada` or `## Causa refutada`.)

   **Bucle A — cause refutation loop.** If phase 08 refutes the active cause hypothesis: mark
   04–08 `superseded` (MAJOR++), re-invoke `sm-phase-hypothesis` to append the next `pending`
   candidate in `04-hypothesis.md`, re-run 05–08. Repeat until `## Causa confirmada` is written
   OR no `pending` candidates remain in `04-hypothesis.md` (consult artifact status column).
6. **Decide whether to open the SOLUTION chain (precondition §5.2).** Opens ONLY if
   `08-analysis.md` contains `## Causa confirmada` (chain state leaves `no_abierta`). Otherwise
   skip 11–16 and proceed to step 8 (phase 17 route **(c)**).
7. **Run the SOLUTION chain (phases 11–16).** Phase 11 requires 08 `done` + `## Causa confirmada`;
   within 11–16, sequential preconditions (§5.1). After invoking phase 11, if the artifact does NOT
   meet acceptance (§7.9 — e.g. fewer than ≥2 viable candidates) → set chain state `parcial_11`;
   skip to step 8 with `no_viable_solution_space` (**`C3`**); do NOT open 12–16 or Bucle B.
   Otherwise set chain state `completa_12-16` **immediately** (phase 11 passed §7.9 validation,
   before invoking 12). Phase 13 designs ONE comparative experiment; 14–16 execute batch and emit
   `## Solución ganadora` or not. Infer `chain: solution` when absent (phases 11–16).

   **Bucle B — solution batch loop.** If phase 16 does NOT emit `## Solución ganadora`:
   mark 13–16 `superseded` (MAJOR++); preserve 11–12. Consult `11-solution-research.md` for
   candidates still `pending` and not yet formulated in 12. If `pending` ≠ ∅: re-invoke phase 12
   to append them; re-run 13–16 — **reuse** existing design 13 if new hypotheses share metrics
   and initial conditions, else **redesign** 13. Repeat until `## Solución ganadora` OR `pending`
   is empty in map 11.
8. **Run phase 17 (conclusion).** Consumes `02`, `08`, and `16` only when chain state is
   `completa_12-16` (§5.2). Route evaluation (§5.3 order): (1) **(c)** if Bucle A exhausted and `08` lacks
   `## Causa confirmada`; (2) **(c)** if `parcial_11` (`no_viable_solution_space`, do NOT read 16);
   (3) **(c)** if `completa_12-16` without `## Solución ganadora`; (4) **(b)** if Solo-SM and
   winner exists; (5) **(a)** otherwise with winner. Distills lesson in all paths. Infer `chain: closure`.
9. **Etapa B — OpenSpec formalization (orchestrator-owned; §12.2, §12.2.4).** Skip in `Solo-SM`
   (routes **(b)** and **(c)**) and on the pause path. For `Completo`/`Rápido` on route **(a)** only:
   1. Precondition: `17-conclusion.md` carries validated spec AND `16-solution-analysis.md` has
      `## Solución ganadora` with discard justifications.
   2. **Boundary checkpoint:** present to the user in Spanish that the spec is ready; proceed only
      with explicit OK. **If user declines:** skip Etapa B; keep `status: done`; proceed to step 10
      branch **(ii)** (investigativo close — same as Solo-SM Etapa C).
   3. Derive the 4 OpenSpec artifacts from `17-conclusion.md` (+ `11-solution-research.md` for
      design.md alternatives).
   4. Create the OpenSpec change: if `integration_mode: Rápido` → `openspec-continue` when
      `openspec_change` in case.md is **non-empty**; `openspec-ff` when **empty**; if `Completo` →
      `openspec-propose`. Record name in `openspec_change`.
   5. `openspec-apply` → `openspec-verify`.
   6. **Apply/verify tree (§12.2.2):**
      - **6a — Converge:** re-run phase 16 (MINOR) to ingest verify output; repeat apply/verify until
        `openspec-verify` has no unaccepted CRITICALs. Does NOT trigger Bucle B. → step 10 **(iii)**.
      - **6b — Verify refutada:** if verify does not converge or CRITICALs persist after a full
        apply cycle → re-invoke phase 17 (MINOR, item 7) with debt/residuals and revert path →
        step 10 **(iv)**.
10. **Run phase 18 (Etapa C — communication).** Exclusive tree evaluated **after** step 9
    (§12.2.2); exactly **one** branch:
    - **(i) Route (c) `pausado`:** run phase 18; document `case_paused_at` and canonical Bucle C
      offer (`C1`–`C3`); changelog `--pending`; commit with `Case:` trailer; **omit** sync/archive.
    - **(ii) Investigativo `done`:** Solo-SM **(b)**, or Completo/Rápido with checkpoint declined;
      run phase 18; changelog `--pending`; commit; cite winner from 16 when present; **omit**
      sync/archive.
    - **(iii) Route (a) and verify OK (tree 6a):** run phase 18; `openspec-sync` + `openspec-archive`;
      changelog `--pending`; cite winner from 16.
    - **(iv) Verify refutada (tree 6b):** phase 17 already updated in step 9 item 7; run phase 18;
      keep `status: done`; document debt and `git revert` of apply; changelog `--pending`; **omit**
      sync/archive.
11. **Consolidate.** Write verdict into case.md; confirm lesson in `.claude/memory/`.
12. **Commit (mandatory before Bucle C).** Phase 18 includes CHANGELOG.md; never hand-edit derived
    state. The paused run MUST be committed before step 13 can increment `case_run`.
13. **Bucle C — re-opening on `pausado` (after commit).** When status is `pausado`, read the offer
    from `18-communication.md` and **process user acceptance** (do NOT re-OFFER). If accepted:
    increment `case_run`, set `case_resumed_at`, move `status` to `in_progress`. **If acceptance
    uses `ctx-c` (profile change):** re-run step 2 classification + invoke matching `sm-profile-*`;
    rewrite 16-entry `phase_policy` in case.md; validate schema (step 4). Then re-run 03–08 only
    (01–02 preserved). If `## Causa confirmada` in 08 → continue at **step 6** (solution chain in
    current `case_run`); otherwise → step 8 (pause again). Prior 17–18 become `superseded` only when
    emitting new closure artifacts (§8.4).
14. **Report to the user** in Spanish: profile, integration_mode, verdict, key artifacts, lesson,
    follow-ups; on `pausado`, reference the offer in 18 and whether re-opening was accepted.

## Phase order (fixed, 16 phases)

01-observation → 02-problem-definition → 03-research → 04-hypothesis → 05-experiment-design
→ 06-experiment-execution → 07-data-collection → 08-analysis →
[11-solution-research → 12-solution-hypothesis → 13-solution-experiment-design →
14-solution-execution → 15-solution-data-collection → 16-solution-analysis] (skipped if
no causa confirmada) →
17-conclusion → 18-communication

The brackets delimit the solution chain — it is skipped (with phase 17 routing to "no
resuelto") when the cause is not confirmed.

## The 3 loops — re-entry rules (summary)

- **Bucle A (cause refutation):** triggered by phase 08 refuting the cause. Re-invokes phase 04
  to APPEND the next `pending` candidate in `04-hypothesis.md`; re-runs 05–08. Terminates when
  `## Causa confirmada` is written OR no `pending` remain. 01–03 are NOT re-invoked.
- **Bucle B (solution batch loop):** triggered when phase 16 does NOT emit
  `## Solución ganadora` (no hypothesis wins the batch). Preserves 11–12; marks 13–16
  `superseded`; appends `pending` candidates from map 11 into 12; re-runs 13–16 (reuse or
  redesign 13). Terminates when a winner exists OR map 11 has no `pending` left. Phase 11 is
  NOT re-invoked. Failure of phase 11 acceptance (§7.9) routes to pause (`no_viable_solution_space`),
  not Bucle B.
- **Bucle C (re-opening on `pausado`):** after phase 18 documents the offer and step 12 commits the
  paused run, step 13 processes user acceptance (no duplicate offer). If accepted with `ctx-c`:
  re-run profile skill and rewrite `phase_policy` before 03–08. Otherwise: increments `case_run`,
  re-runs phases 03–08 only (01–02 preserved). Solution chain opens at step 6 in the new `case_run`
  if cause is confirmed — never inside the same 03–08 cycle. Prior 17–18 superseded when new
  closure artifacts are emitted (§8.4).

## References

| File | When to read |
|------|--------------|
| references/phase-policy-schema.md | The profile↔phase contract (16 keys, range 01..18) — always, before step 4 |
| references/classification-guide.md | Choosing the profile (step 2) |
| references/artifact-conventions.md | Naming, frontmatter (with `chain`), versioning, `Case:` commit metadata (*trailer*) (steps 3–13) |
| references/knowledge-base.md | Lesson schema + recall protocol (phases 03, 11; lesson write phase 17) |
| references/changelog.md | Keep a Changelog format + derivation from commits (step 12) |
| docs/proposals/scientific-method-and-openspec-integration.md | SM↔OpenSpec modes, Etapa B boundary (steps 2, 9, 10) |
| templates/case.md | Manifest skeleton with 16 phases + pause/resume fields (step 3) |
| templates/phase-artifact.md | Phase artifact skeleton (with `chain`) — passed to phases |

<!-- <<constraints> -->
- One profile per case; one artifact per phase; phases run in the fixed order above.
- Never write phase procedure or profile policy here — only orchestrate.
- Artifacts are the source of truth; never keep case state only in conversation.
- Derived state over duplicated state: never hand-edit CHANGELOG.md or a case ledger.
- The solution chain (11–16) opens ONLY when phase 08 emitted `## Causa confirmada`.
- Phase 17 route **(a)** (validated spec) requires `## Solución ganadora`, solution chain opened,
  and `integration_mode` ≠ `Solo-SM` (§5.3). Route **(b)** Solo-SM closes without spec even with
  winner. Route **(c)** pause when cause not confirmed or solution exhausted.
- Bucle C: phase 18 documents the offer; commit (step 12) before acceptance (step 13). Re-opening
  runs ONLY phases 03–08 first; solution chain opens at step 6 in the incremented `case_run`.
- Never cross the SM→OpenSpec boundary (Etapa B) without explicit user checkpoint; no bridge skill.
- No sub-agents.
<!-- </constraints> -->
