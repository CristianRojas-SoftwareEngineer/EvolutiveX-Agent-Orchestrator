<!-- <scientific_maintenance> -->
# Scientific Maintenance Subsystem (two-chain) — persistent instructions

This repository runs software maintenance as two sequential reproducible scientific experiments
through the `sm-*` skill family: a CAUSE chain (phases 01–08) and a SOLUTION chain (phases
11–16, opened only when the cause is confirmed), with a CLOSURE phase (17–18) that consumes
data from both chains. Treat every maintenance request as a *case* driven by `sm-orchestrator`.

## Non-negotiable rules
- Artifacts are the source of truth, not the conversation. Every phase writes one versioned
  artifact under `maintenance-cases/<case-id>/`. The case manifest is `case.md`. Numeric range
  for phase artifacts: `01..18` (with 09 and 10 vacante — the original phases 09 and 10 were
  renumbered to 17 and 18). The system runs 16 phases, not 18.
- Never skip phases. Trivial cases may run phases with `reasoning_effort: low` (short
  artifacts) but the full 16-phase chain must exist.
- Profiles set policy; phases execute procedure. Never put profile logic inside a phase, nor
  phase procedure inside a profile.
- Phase behavior varies only through the 16-entry phase-policy matrix in `case.md` (see
  references/phase-policy-schema.md). Do not fork phases per profile.
- The SOLUTION chain (phases 11–16) opens ONLY when `08-analysis.md` contains the mandatory
  `## Causa confirmada` section. Without it, phase 17 routes the case to "no resuelto" and
  pauses the case.
- The CLOSURE phase (17) has three terminal routes (§5.3): **(a)** close with spec (`done` + Etapa B
  when applicable, ≠ Solo-SM), **(b)** Solo-SM investigativo (`done` without spec, even with winner
  in 16), **(c)** pause (`pausado`). Without `## Causa confirmada` → **(c)** in all modes.
- Each case declares `case_run`, `integration_mode` and `openspec_change` in the canonical block.
  Etapa B runs after phase 17 only on route **(a)** (`Completo`/`Rápido`); checkpoint declined →
  investigativo close (step 10 branch ii). `Rápido`: non-empty `openspec_change` →
  `openspec-continue`, empty → `openspec-ff`. Etapa C (step 10): investigativo **(ii)** and pause
  **(c)** omit sync/archive; verify refuted (step 9 tree 6b) → `done` with debt, no sync/archive.
  `Solo-OpenSpec` terminates the orchestrator at step 2. Never cross the Etapa B
  boundary without explicit user authorization (§12.2, §12.2.4).
- Chain states §5.2: `no_abierta`, `parcial_11`, `completa_12-16`. Bucle C triggers `C1`–`C3`;
  re-opening context `ctx-a`/`ctx-b`/`ctx-c` (§3.1.3). Phase 18 documents the Bucle C offer;
  commit (step 12) closes the paused run before step 13. Step 9 item 7 re-runs phase 17 (MINOR) on
  verify refutada (tree 6b). Step 10 is an exclusive tree: **(i)** pause **(c)**, **(ii)**
  investigativo **(b)** / checkpoint declined, **(iii)** verify OK **(a)**, **(iv)** verify refutada
  — no overlap between pause and skipped Etapa B.
- Derived state over duplicated state. `CHANGELOG.md` and the case index are DERIVED (from
  commits and the filesystem); never hand-edit them. Only lessons are persisted deliberately.

## Case identity
- `case-id = YYYYMMDD-<slug>` (kebab slug from the problem).
- All artifacts for a case live in `maintenance-cases/<case-id>/`.

## Knowledge & traceability
- Knowledge base = MEMORY.md index convention (not runtime-loaded): one lesson per file
  under `.claude/memory/`, indexed by `MEMORY.md`, tagged
  `component`/`defect-class`/`profile`. Claude Code does NOT load `MEMORY.md` automatically;
  phase 03 (cause) and phase 11 (solution) read it as explicit recall steps. This `CLAUDE.md`
  references `MEMORY.md` so it enters context each session. Phase 17 writes lessons.
- Case index is DERIVED from `maintenance-cases/` and `CHANGELOG.md` — never a hand-kept
  ledger.
- Every commit for a case carries the git commit metadata (*trailer*) `Case: <case-id>`.
  `CHANGELOG.md` is regenerated from git log by the on-demand generator (Keep a Changelog).
  Phase 18 runs it. On the close path, the commit body cites the winning solution from
  `16-solution-analysis.md ## Solución ganadora`. See references/changelog.md.

## Default policies
- Default rollback for any experiment: revert the change / disable the feature flag.
- On verdict: write a lesson (phase 17) and commit with the `Case:` trailer (phase 18). Do
  NOT edit the changelog or any case ledger by hand — both are derived.

## Memory index (explicit reference — MEMORY.md is not auto-loaded by the runtime)
See: .claude/memory/MEMORY.md
<!-- </scientific_maintenance> -->

<!-- <user_communication> -->
All user-facing output is in Spanish. Skill bodies and artifact header fields are in English for
token efficiency; explanations, questions, and summaries to the user are Spanish. See
.claude/skills/artifact-structuring/SKILL.md §language_policy.
<!-- </user_communication> -->
