---
name: orchestrate-roadmap
description: >
  Higher-altitude companion that governs a roadmap of many chained specification-deltas
  (a phased migration, a large change set with internal dependencies). Two-level model:
  an L1 governance-only orchestrator (phase registry + per-phase DoD as governance
  specs, never touches src/) and N L2 phase deltas (1:1 with each phase). Invokes
  orchestrate-specification-delta once per phase, never the stage skills directly, and
  retains the roadmap-scoped checks (traceability, dependency gate, DoD).
when_to_use: >
  Invoke when a large set of high-level changes has internal dependencies and
  regression risk that cannot safely ship as a single delta — a phased migration, a
  multi-layer change set needing governance. For a single self-contained delta, use
  orchestrate-specification-delta directly.
argument-hint: "[roadmap description or orchestrator name] [--phase <phaseid>]"
---

# Orchestrate Roadmap

<!-- <overview> -->
Governs a roadmap of many chained specification-deltas. It is the **higher-altitude**
companion of `orchestrate-specification-delta`: the delta orchestrator drives the
10-stage pipeline of **one** delta; this skill drives **phases**, where each phase
**is** a specification-delta. It has no native OpenSpec equivalent. Its name omits the
`-specification-delta` suffix on purpose, because it governs many deltas, not one.
<!-- </overview> -->

<!-- <user_communication> -->
Ask, confirm, and respond to the user in **Spanish**. Keep this skill's instructions
in **English** for token efficiency. Canonical policy: `<language_policy>` in
[artifact-structuring](../artifact-structuring/SKILL.md). User-facing rules:
[AGENTS.md](../../../AGENTS.md) §0. Keep standard technical terms in English (gate,
change, specs, roadmap, orchestrator).
<!-- </user_communication> -->

<!-- <two_level_model> -->
## Two-level model

- **L1 — orchestrator delta** (governance only, never touches `src/`): owns the phase
  registry and the per-phase Definition of Done (DoD). Materialized as a normal
  specification-delta (capability `<orchestrator-name>-governance`).
- **L2 — phase deltas** (1:1 with each phase): contain the real code work. Created
  incrementally, in dependency order — **not** all upfront.

**Altitude boundary = delegation wiring.** This is the rule that separates the two
orchestrators without ambiguity: this skill drives **phases**, and each phase **is** a
specification-delta, so it invokes `orchestrate-specification-delta` **once per phase**
and **never** calls the stage skills directly. The roadmap decides *which phase is
next*; the delta orchestrator decides *which stage is next within the phase*.

**L2 location invariant (CRITICAL).** Each L2 phase delta lives at
`openspec/changes/<l2-name>/` (the CLI-indexed root) for its full lifecycle. Do **not**
nest an L2 inside the L1 folder during the phase loop — it breaks `openspec
list/validate/apply/archive` for that L2. The nested layout under the orchestrator is
a **post-archive** convention only, applied at roadmap close-out.
<!-- </two_level_model> -->

<!-- <l1_design> -->
## L1 design

### Phase registry (lives in the L1 `design.md`)

One row per phase. The dependency DAG is encoded in the *Dependencia* column.

| Fase | Change hijo | Bloque | Dependencia | Gate de validación | Docs a actualizar | Legacy a retirar | Estado |
|------|-------------|--------|-------------|-------------------|-------------------|-----------------|--------|
| `<phaseid>` | `c<NNNNN>-<prefix>-<phaseid>-<slug>` | `<bloque>` | `<deps or «ninguna»>` | `<comando/criterio>` | `<lista docs>` | `<lista legacy or «ninguno»>` | `pendiente` |

States: `pendiente` → `en curso` → `validada` → `archivada`.

Formalize this phase registry by sub-invoking [create-plan](../create-plan/SKILL.md)
per the `<sub_invocation_protocol>` of
[artifact-structuring](../artifact-structuring/SKILL.md): the phases are the tasks
(read-only governance tasks, not implementation), the *Dependencia* column is the
dependency DAG that drives their order, and the L1 `design.md` is the source. The plan
is governance-only and **never touches `src/`** — the «L1 governance-only» invariant
holds; L2 phase deltas own all code work.

### Definition of Done (lives in the L1 governance `specs/`)

The DoD is the capability `<orchestrator-name>-governance` written as delta **ADDED**
requirements, each with at least one verifiable Given/When/Then scenario. Typical
normative requirements:

- The roadmap is divided into phases traceable 1:1 to the source change set.
- Each phase is materialized as an independent L2 specification-delta.
- A phase is not complete without: (a) the technical gate passed — which **includes
  the test suite green as a CRITICAL condition** of `verify` inside the phase pipeline;
  (b) the affected docs updated to the real post-phase state; (c) the phase's legacy
  reduced.
- DAG dependencies must be `archivada` before a dependent phase begins.
- No zombie code/doc: replaced items are removed or deprecated with a retirement date.
- **One commit per phase delta**: each L2 freezes and commits its own phase at archive
  (stage 10 of its pipeline), so the roadmap history has one conventional commit per
  phase.

### L2 naming and back-reference

L2 name: `c<NNNNN>-<prefix>-<phaseid>-<slug>` (the `c<NNNNN>` id is minted by
`create-specification-delta` like any delta; the `phaseid` lives inside the slug).
Every L2 `proposal.md` carries a back-reference line:
`Orchestrator: <orchestrator-name> — Phase <phaseid>`. The parent→child relationship is
expressed via the registry + back-reference (OpenSpec has no native hierarchy).
<!-- </l1_design> -->

<!-- <workflow> -->
## Workflow

### Phase 1 — Analysis and decomposition

Derive from the high-level change set: atomic phases (each a coherent vertical slice or
complete layer increment, independently implementable and validatable), thematic
blocks, and the dependency DAG. Check coherence (every phase traceable to an
objective), consistency (no overlapping scope), completeness (the union covers the full
set; gaps → CRITICAL). Deliver the decomposition table and confirm with the user before
building the L1.

### Phase 2 — Build the L1 orchestrator

Build the L1 governance delta through `orchestrate-specification-delta` (it is a normal
delta): the phase registry in `design.md`, the DoD in governance `specs/`, the L2
naming + back-reference rule. The L1 never touches `src/`. Do NOT create all L2 deltas
upfront — the registry enumerates them; each is created when its phase begins.

### Phase 3 — Phase loop (in dependency order)

For each phase, prerequisites first:

1. **Dependency gate** — confirm every prerequisite phase is `archivada`
   per the registry DAG. Not satisfied → CRITICAL, block.
2. **Run the phase** — invoke `orchestrate-specification-delta` **once** for this
   phase's L2 delta (it drives explore→archive, including its own verify gate, sync,
   commit, and clean worktree). Never call stage skills directly.
3. **Roadmap-scoped gate (phase traceability & Definition of Done)** before the L2
   archives — see
   `<roadmap_gate>`.
4. **Update the registry** — mark the phase `archivada` in the L1 `design.md`.

### Phase 4 — Roadmap close-out

When all L2 phases are archived: confirm no legacy/zombie remains; confirm every
registry doc reflects final reality; then archive the L1 orchestrator. This is the
**only** moment the L1 and L2 directories are physically moved together under
`openspec/changes/archive/<date>--c<NNNNN>-<orchestrator>/`, with each L2 phase nested
as `phases/<date>--c<NNNNN>-<phase-slug>/` (same `YYYY-MM-DD--` separator and
mandatory `c<NNNNN>` prefix as root archived changes).
<!-- </workflow> -->

<!-- <roadmap_gate> -->
## Roadmap-scoped gate (the three checks a single delta cannot evaluate)

The per-delta checks (4C, documentary synchronization, legacy reduction, tests) already run inside each
phase's pipeline as `verify-specification-delta`. This skill retains **only** the
checks that read the L1 registry/governance — never re-implementing the delta checks:

- **Phase traceability**: the L2 `proposal.md` declares its phase id and a
  back-reference to the orchestrator, and that id exists in the registry. Missing →
  CRITICAL.
- **Dependency gate**: every prerequisite phase is `archivada` per the
  registry DAG (verified before the phase starts). Violated → CRITICAL.
- **Definition of Done**: each applicable L1 governance requirement maps to
  evidence (gate passed, scope respected, tests green). Unmet → CRITICAL.

Read the DoD only from the L1 governance `specs/`; never invent criteria or hardcode
project-specific section numbers. Phase gate = `verify-specification-delta` (per delta)
+ these three checks. This skill does **not** retain the read-only sub-agent escalation
(it lives in `verify-specification-delta`), which removes the double-delegation risk.
<!-- </roadmap_gate> -->

<!-- <constraints> -->
- Delegate phases to `orchestrate-specification-delta`, one invocation per phase; never
  call the stage skills directly.
- L1 is governance-only and never touches `src/`. L2 deltas live at
  `openspec/changes/<l2-name>/` during the loop; nesting under the L1 is post-archive
  only.
- Create phases incrementally (one L2 per phase, when it begins); never all upfront.
- Retain only the roadmap-scoped checks (phase traceability, dependency gate,
  Definition of Done); the per-delta checks live in `verify-specification-delta`.
  Do not retain the sub-agent escalation here.
- One conventional commit per phase delta (each L2's own archive stage).
- Back-reference to the orchestrator is mandatory in every L2 `proposal.md`.
- If the L1 orchestrator or its governance specs are missing → report «no verificable»
  instead of guessing. Never run `openspec update` / `openspec init --force`.
<!-- </constraints> -->
