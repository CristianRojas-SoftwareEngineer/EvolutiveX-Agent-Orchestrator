---
name: sm-orchestrator
description: >
  Drive a software maintenance case end-to-end as a scientific experiment: classify the case,
  select a maintenance profile and case mode (full/consolidated), run the ten scientific-method phases in
  order, produce phase artifacts (full: one file per phase; consolidated: subsections in case.md), consolidate
  a verdict, distill a lesson, run the changelog generator, and commit with a `Case:` commit metadata (*trailer*)
  (the changelog and case index are derived, never hand-edited). Use
  when the user asks to maintain, fix a bug, correct a regression, optimize, refactor, migrate,
  upgrade a dependency, adapt to a new API/platform, harden, audit, or reduce risk. Also trigger
  for: mantener, corregir bug, arreglar, optimizar, refactorizar, migrar, actualizar dependencia,
  adaptar, endurecer, auditar, prevenir, mantenimiento correctivo/adaptativo/perfectivo/preventivo.
---

# Scientific Maintenance — Orchestrator

Conducts a maintenance case through the scientific method. Owns the FLOW; delegates POLICY to a
profile skill and PROCEDURE to phase skills. Never implements profile policy or phase procedure.

<user_communication>Talk to the user in Spanish (questions, confirmations, summaries). Keep artifacts' machine fields in English. Canonical policy: ../artifact-structuring/SKILL.md §language_policy.</user_communication>

## Workflow

1. **Identify the case.** Derive `case-id = YYYYMMDD-<slug>`. If a `case-id` is given, resume from
   `maintenance-cases/<case-id>/case.md`.
2. **Classify the profile and the integration mode.** Use references/classification-guide.md to pick
   one of corrective, adaptive, perfective, preventive. If ambiguous, ask the user in Spanish (offer
   the 2 best fits). Then pick the SM↔OpenSpec `integration_mode` (integration doc §7/§7.5):
   `Completo` (preventive/perfective), `Rápido` (corrective), `Solo-SM` (research with no ready
   change), `Solo-OpenSpec` (pre-validated change — usually not a full SM case).
3. **Create the manifest.** Copy templates/case.md to `maintenance-cases/<case-id>/case.md`; fill
   case_id, profile, case_mode (consolidated for trivial/localized fixes, full otherwise),
   `integration_mode`, `openspec_change` ("" until Etapa B), and the 10 phases as `pending` in the
   canonical YAML block.
4. **Load policy.** Invoke the matching `sm-profile-<x>` skill. It writes its parameters and the
   phase-policy matrix into the canonical YAML block in case.md. **Validate the schema** (mandatory):
   confirm case_mode and integration_mode are set, openspec_change is present (empty allowed), all 10
   phase_policy entries are present, and all 10 phases entries exist with valid status values. Do not
   proceed until validation passes.
5. **Run phases 01→09 in order (Etapa A).** Before executing phase N, verify in the canonical YAML
   block that phases 01..N-1 are `done`; stop and report if any is not. For each phase, invoke the
   matching `sm-phase-*` skill. After each phase: in full mode, confirm `NN-<phase>.md` exists and set
   artifact path; in consolidated mode, confirm the `## NN — <Phase>` subsection in case.md was written.
   Mark the phase `done` and record artifact + version in the canonical YAML block. Stop and report
   if a phase fails its acceptance criterion. (Phase 03 reads MEMORY.md explicitly for recall; phase
   09 produces the validated spec (§4.3) and writes a lesson.)

   **Cause space iteration → Solution space iteration (sequential, not simultaneous).**
   Phase 09 emits the spec only when **both** veredicts exist. The order is strict:

   1. **Cause loop (04→08, first pass):** sm-phase-hypothesis writes cause hypotheses into
      04-hypothesis.md. Orchestrator then runs 05→06→07→08 on those hypotheses.
      If phase 08 refutes the active cause hypothesis: mark 04→08 artifacts `superseded`,
      re-invoke sm-phase-hypothesis to append the next candidate to 04-hypothesis.md, and
      run 05→06→07→08 again. Repeat until a cause hypothesis is confirmed or candidates are
      exhausted (phase 09 records "not resolved").

   2. **Solution loop (05→08, NOT 04):** only after a cause is confirmed. The solution
      hypotheses are already in 04-hypothesis.md from the first pass (formulated speculatively
      in step 4 of sm-phase-hypothesis). Orchestrator reads them from the artifact and proceeds
      directly to phase 05 to design the comparative experiment. Phase 04 is NOT re-invoked
      for the solution loop — doing so would overwrite the cause hypotheses already documented.
      The solution loop runs 05→06→07→08, where phase 08 emits the §Solution comparison with
      the winner verdict.

   3. **Phase 09:** only now — with both veredicts — emit the validated spec. The spec must
      cite the winning solution and the discard reasons from §Solution comparison.

   **Phase 03** is the only phase that operates on both spaces before cause confirmation: it
   enumerates the solution space speculatively so the solution loop is seeded when it opens.
   No solution hypothesis is acted upon until the cause is confirmed.

6. **Etapa B — Formalization & implementation (orchestrator-owned; integration doc §5.2).** Skip
   entirely in `Solo-SM` mode (verdict "no implementar"/"diferido") and `Solo-OpenSpec` (no SM case).
   For `Completo`/`Rápido`:
   1. **Precondition (§5.1):** confirm `09-conclusion.md` carries a validated spec (problem, bounded
      scope, expected behavior, acceptance criteria, experimental evidence) AND that
      `08-analysis.md` contains a `## Solution comparison` section with a winning verdict and
      discard justifications. Without the comparative evidence, the spec cannot be emitted.
   2. **Boundary checkpoint (mandatory in v0.2).** Stop at the boundary and present to the user, in
      Spanish: the spec is ready, the change is `<case-id>`, the next step is `openspec-propose`.
      Proceed only with the user's OK. SM never creates programmatic cross-system automation; the
      orchestrator (the agent) only continues after this explicit authorization (integration doc §3.3,
      §11.2/§11.3 — no `sm-openspec-bridge`).
   3. **Derive the 4 OpenSpec artifacts** from `09-conclusion.md` (mapping §4.2/§4.3): proposal.md
      (Problema), specs/ (Comportamiento esperado), design.md (Decisiones + 03-research.md), tasks.md
      (Criterios de aceptación). Write the `## Contexto SM` section into proposal.md (case-id + path).
   4. **`openspec-propose` once** to create the change; record its name in `openspec_change`.
   5. **`openspec-apply`** → **`openspec-verify`**.
   6. **Re-run phase 08** to ingest the verify output as a MINOR refinement; record the
      accepted-CRITICALs gate. `apply`/`verify` may repeat (the change is created once) until spec and
      implementation converge (integration doc §5.4).
   7. **CRITICALs gate (§5.2 precondition for Etapa C):** verify left no unaccepted CRITICALs. Then
      continue to phase 10 (Etapa C).
7. **Run phase 10 (Etapa C — communication & close-out).** Invoke `sm-phase-communication`. On the
   confirmed path it drafts the close-out: under the same boundary authorization the orchestrator runs
   `openspec-sync` + `openspec-archive` (only when `openspec_change` is set and the change is
   archived), and the closing commit carries double metadata `Case:` + `OpenSpec-Change:` (the latter
   only if archived). On the refuted path: no sync/archive, no `OpenSpec-Change:`; the `git revert` of
   any apply is documented for the user to execute (integration doc §5.3/§11.2). Confirm
   `10-communication.md` exists and mark phase 10 `done`.
8. **Consolidate.** Read 09-conclusion.md (or the consolidated subsection); write the verdict into case.md.
   Confirm phase 09 wrote a lesson to .claude/memory/ (indexed in MEMORY.md). Do NOT write a case
   ledger — it is derived.
9. **Commit, do not hand-edit derived state.** Phase 10 runs the changelog generator with
   `--pending "<subject>" --case <case-id>` and includes CHANGELOG.md in its commit. Never edit
   CHANGELOG.md or any case index by hand. See references/changelog.md.
10. **Report to the user** in Spanish: profile, integration mode, verdict, key artifacts, the lesson
    written, follow-ups.

## Phase order (fixed)

observation → problem-definition → research → hypothesis → experiment-design →
experiment-execution → data-collection → analysis → conclusion → communication

[^1]: Two distinct loops use different phase re-entry rules:
- **Cause refutation loop:** re-invokes sm-phase-hypothesis to append the next candidate to
  04-hypothesis.md (the artifact grows, never overwrites cause content).
- **Solution loop:** does NOT re-enter phase 04 — reads existing solution hypotheses from
  04-hypothesis.md and proceeds directly to phase 05. Re-entering phase 04 would overwrite
  cause hypotheses with solution output.

## References

| File | When to read |
|------|--------------|
| references/phase-policy-schema.md | The profile↔phase contract (always, before step 4) |
| references/classification-guide.md | Choosing the profile (step 2) |
| references/artifact-conventions.md | Naming, frontmatter, versioning, `Case:` commit metadata (*trailer*) (steps 3–7) |
| references/knowledge-base.md | Lesson schema + recall protocol (steps 5–6) |
| references/changelog.md | Keep a Changelog format + derivation from commits (step 9) |
| docs/proposals/scientific-method-and-openspec-integration.md | SM↔OpenSpec integration contract: modes (§7), Etapa B boundary (§3.3/§5.2), traceability (§10) (steps 2, 6, 7) |
| templates/case.md | Manifest skeleton (step 3) |
| templates/phase-artifact.md | Phase artifact skeleton (passed to phases) |

<constraints>
- One profile per case; one artifact per phase; phases run in the fixed order above.
- Never write phase procedure or profile policy here — only orchestrate.
- Artifacts are the source of truth; never keep case state only in conversation.
- Derived state over duplicated state: never hand-edit CHANGELOG.md or a case ledger.
- Never cross the SM→OpenSpec boundary without the explicit user checkpoint (Etapa B); never create
  cross-system automation or a bridge skill (integration doc §3.3/§11.2/§11.3).
- No sub-agents.
</constraints>
