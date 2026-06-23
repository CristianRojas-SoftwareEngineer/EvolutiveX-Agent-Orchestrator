---
name: orchestrate-specification-delta
description: >
  Single entry point for running a specification-delta (an OpenSpec change)
  end-to-end. Decides whether to run the fixed 10-stage pipeline in AUTO or GUIDED
  mode based on the request, asking the user when the choice is ambiguous, then
  delegates every stage skill in order by its exact slug. The user interacts only with
  this skill — never with the individual stage skills directly.
when_to_use: >
  Invoke whenever the user wants to start, resume, or complete any single
  specification-delta (OpenSpec change): a fix, a feature, a localized refactor. For a
  multi-delta phased roadmap, use orchestrate-roadmap instead.
argument-hint: "[request or change name] [--mode auto|guided]"
---

# Orchestrate Specification-Delta

<!-- <overview> -->
Drives a single, fixed pipeline across two execution modes. This skill owns **control
flow only** — it never reimplements stage logic. Each stage is delegated to its
self-contained skill via the Skill tool, by its exact slug. A "specification-delta" is
the unit of iterative-incremental work; it maps to an OpenSpec "change" on disk
(`openspec/changes/<name>/`, flag `--change`).
<!-- </overview> -->

<!-- <user_communication> -->
Ask, confirm, and respond to the user in **Spanish**. Keep this skill's instructions
in **English** for token efficiency. Canonical policy: `<language_policy>` in
[artifact-structuring](../artifact-structuring/SKILL.md). User-facing rules:
[AGENTS.md](../../../AGENTS.md) §0.
<!-- </user_communication> -->

<!-- <mental_model> -->
## Mental model (operational minimum)

- `openspec/specs/` is the source of truth for agreed behavior; `openspec/changes/` is
  active work. State is derived from the filesystem — resolve it with `openspec
  status`, never from memory.
- The DAG is linear: `proposal → specs → design → tasks`. The four artifact stages run
  as that exact ordered subsequence.
- The full CLI contract is **not** embedded here. Consult the
  [Contrato CLI](../../../docs/specification-delta-workflow.md#contrato-cli) section of
  the workflow doc for the verified `status --json` / `instructions --json` fields and
  the `outputPath` vs `resolvedOutputPath` resemantics.
<!-- </mental_model> -->

<!-- <stage_pipeline> -->
The pipeline is fixed. Every stage is mandatory in BOTH modes. Never skip, reorder, or
merge stages. Delegate each one by its exact slug via the Skill tool.

1. `explore-specification-delta`      — frame the problem (read-only)
2. `create-specification-delta`       — initialize the delta (mint `c<NNNNN>-<slug>`)
3. `propose-specification-delta`      — write proposal.md   (WHY)
4. `define-specification-delta`       — write specs/**/*.md  (WHAT)
5. `design-specification-delta`       — write design.md      (HOW)
6. `plan-specification-delta`         — write tasks.md       (breakdown)
7. `apply-specification-delta`        — implement tasks
8. `verify-specification-delta`       — gate; 4C + documentary sync + legacy + tests (all CRITICAL)
9. `synchronize-specification-delta`  — sync canonical state: delta specs + README/docs
10. `archive-specification-delta`     — freeze: move to archive/ + commit + clean worktree

Resolve the next stage from `node_modules/.bin/openspec status --change "<name>"
--json`, not from memory. Stages 3–6 are the four artifact writers, in this order.

**Stage-completion gate**: between each artifact stage and the next, and before `apply`,
run the deterministic completion gate and treat a non-zero exit as a hard stop (see
`<invariants>`). Run it in BOTH modes:

```bash
npm run openspec:verify-stage-completion -- --change "<name>" --through specs   # before design
npm run openspec:verify-stage-completion -- --change "<name>" --through design  # before plan
npm run openspec:verify-stage-completion -- --change "<name>" --through tasks   # before apply
```
<!-- </stage_pipeline> -->

<!-- <mode_selection> -->
## Choosing the mode

Classify the request before creating the delta. Pick exactly one.

Recommend **AUTO** when ALL hold:
- Root cause or change is already identified by the user.
- Scope is localized (single capability/module).
- No architectural decision is implied.
- It is a known fix, config change, or mechanical refactor.

Recommend **GUIDED** when ANY holds:
- A new feature or capability is being introduced.
- The bug is not yet diagnosed, or the request is exploratory.
- The change touches architectural boundaries or layer decisions.
- More than one viable approach exists and the choice matters.

When signals conflict or scope is unclear, do NOT guess. Use the **AskUserQuestion**
tool to ask which mode to run, presenting AUTO and GUIDED with the one-line tradeoff
each. An explicit `--mode auto|guided` overrides classification.
<!-- </mode_selection> -->

## AUTO mode

**Step 0 — write the AUTO sentinel (before stage 1).** On entering AUTO, write
`openspec/.workbench/auto-pipeline.json` with
`{ change, mode: "auto", stage: "<stage 1>", startedAt: <ISO>, stuckCount: 0 }`. This
sentinel is the contract the deterministic backstop reads (see **Deterministic
backstop** below). The directory `openspec/.workbench/` is gitignored — the sentinel
is ephemeral session state.

**Conductor loop: one turn, stages 1→10.** AUTO runs as a loop that never yields the
turn until stage 10 completes. Each iteration:
1. Update the sentinel's `stage` field to the current stage, then delegate that stage
   to its skill via the Skill tool.
2. Emit the `<output_template>` status as an **informational log** — this is text
   output only, **never a turn boundary**. Emitting the status does NOT end the turn.
3. Resolve the next stage via `openspec status --change "<name>" --json`.
4. Invoke it immediately via the Skill tool in **the same turn** — no pause, no
   prompt, no confirmation.

Repeat until stage 10 (`archive-specification-delta`) completes — archive + commit +
clean worktree — or an admissible stop is reached. **The turn ends only at one of
those two conditions.** Stopping after any earlier stage (e.g. after `verify` or
after `synchronize`) is never a valid AUTO end state. The `archive` stage **removes**
the sentinel as part of its freeze (the backstop also self-cleans once the change is
under `changes/archive/`).

**Deterministic backstop (`Stop` hook).** The one-turn rule is not prose-only: it is
enforced by `scripting/openspec/enforce-auto-pipeline.mts`, registered as a `Stop`
hook (additive entry alongside the generic logger). While the AUTO sentinel exists and
the change is not yet archived, the hook returns `{ "decision": "block", "reason }` and
forbids the turn from ending, naming the next stage to invoke. It allows the turn only
when: no sentinel exists (GUIDED/normal), a halt sentinel
(`auto-pipeline.halt.json`) is present (legitimate cession), the change is archived, or
its loop-guard fires (the `stage` did not advance across repeated `Stop` events beyond
the threshold → it writes a diagnostic halt and releases the turn). The hook's decision
is the pure, filesystem-only function `decideAutoPipeline`; the prose here and the hook
are defense in depth, not alternatives. **Admissible stop #3 (below) requires writing
`openspec/.workbench/auto-pipeline.halt.json` so the backstop permits the cession.**

**Archive commit authorization**: invoking this workflow in AUTO mode is explicit
authorization for the commit that `archive-specification-delta` (stage 10) performs.
No separate confirmation is required — do not prompt for it.

**Sub-invoked plan gate**: when `apply-specification-delta` sub-invokes `create-plan`,
the plan approval gate is **auto-approved in AUTO mode**. Proceed with the generated
plan without surfacing it for user confirmation; include it in the one-line status of
the `apply` stage.

**Admissible stops (exhaustive list):**
1. **Verify CRITICAL** — the hard gate in `<invariants>`: stop and route back to
   `apply-specification-delta` if the verify report contains any CRITICAL finding.
2. **Stage-completion gate** — non-zero exit from `openspec:verify-stage-completion`;
   route back to the incomplete stage until the gate exits zero.
3. **Unresolvable design decision** — if a stage surfaces a genuine architectural
   choice that cannot be resolved unilaterally, write
   `openspec/.workbench/auto-pipeline.halt.json` (so the deterministic backstop permits
   the cession), stop, delegate to `resolve-open-decisions`, resolve with the user,
   then remove the halt sentinel and **resume the pipeline** without restarting it.
   Note to the user that a decision appearing in AUTO signals a likely misclassification
   of the request.

No other stop condition exists in AUTO. Any other user-facing pause, confirmation
prompt, or approval gate from a sub-invoked skill is suppressed in this mode.

## GUIDED mode

Run the same stages 1→10, pausing to hand control back to the user:
- After explore: present findings, confirm direction before creating the delta.
- After EACH artifact stage (propose/define/design/plan): present the artifact, allow
  edits, confirm before the next.
- During apply: if an artifact proves wrong, let the user edit it, then resume.
- After verify: present the report, let the user decide on WARNINGs.

**Open design decisions:** whenever a stage exposes architectural or design choices
that cannot be resolved unilaterally, the stage delegates to
[resolve-open-decisions](../resolve-open-decisions/SKILL.md) before writing its
artifact. This is the canonical mechanism — never substitute it with an inline
"¿A o B?" in conversation or with an unilateral choice.

GUIDED is also the **first-time mode**: when the user is new to the system, add
didactic narration (what each stage is, why it exists, what is about to happen) over
the same path. There is no separate tutorial and no throwaway practice delta — the
newcomer learns working on their real delta, with the checkpoints as teaching points.
This absorbs the old `onboard` role without a separate skill.

<!-- <invariants> -->
These hold in BOTH modes, without exception:
- Every stage runs. `verify` and `synchronize` are never skipped.
- The **verify gate is hard**: if the report contains any CRITICAL issue, STOP the
  pipeline and route back to `apply-specification-delta`. Never run `synchronize` or
  `archive` over a delta with unresolved CRITICAL findings — not even in AUTO mode. A
  failing test suite is CRITICAL: it hard-blocks the gate like any 4C finding.
- The **stage-completion gate is hard**: a non-zero exit from
  `npm run openspec:verify-stage-completion -- --change <name> --through <artifact>` is a
  hard stop in BOTH AUTO and GUIDED. It runs before advancing to `design` (`--through
  specs`), to `plan` (`--through design`), and to `apply` (`--through tasks`). On a
  non-zero exit, do NOT advance; route back to the incomplete stage named in stderr (an
  empty/missing spec or broken proposal↔specs parity routes back to `define`) and re-run
  the gate until it exits zero. No delta progresses with an incomplete DAG artifact —
  completeness is decided by the script's exit code, not by the model's judgment.
- This skill **delegates**; it never inlines a stage's work. No stage skill embeds
  another (`archive` does not synchronize; `synchronize` does not archive). A single
  stage may bundle the atomic tasks its concern requires (the commit + clean worktree
  belong to archive's freeze concern; the README/docs sync belongs to synchronize's
  canonical-state concern) — these are not embedded stages.
- Stages 3–6 contain no writing guidance: each calls `openspec instructions <artifact>
  --change <name> --json` and follows the returned instruction. The schema is the
  single source of truth for artifact content.
- **AUTO termination (AUTO only)**: in AUTO mode the pipeline advances stage by stage
  within the same turn; the turn ends **only** when stage 10 (`archive`) completes or
  an admissible stop (defined in `## AUTO mode`) is reached. Completing a stage and
  emitting its status report is never a valid turn-ending condition in AUTO — the next
  stage must be invoked immediately in the same turn. This invariant does not apply to
  GUIDED, where pauses between stages are intentional.
<!-- </invariants> -->

<!-- <output_template> -->
Rendered to the user in Spanish after each stage:

```
## Specification-Delta Run: {{delta-name}}
**Modo:** {{AUTO | GUIDED}}
**Etapa:** {{current-stage}} ({{n}}/10)
{{stage-specific summary}}
**Siguiente:** {{next-stage or "completo"}}
```
<!-- </output_template> -->

<!-- <constraints> -->
- The user interacts only with this skill; never tell them to invoke a stage skill
  directly.
- Embed only the operational minimum (mental model + stage catalog). Do not embed the
  CLI contract — point to the `#contrato-cli` section of
  `docs/specification-delta-workflow.md`.
- Reference each stage by its exact slug from `<stage_pipeline>`; resolve the next
  stage via `openspec status --json`.
- For a multi-delta phased roadmap, defer to `orchestrate-roadmap` (it invokes this
  skill once per phase).
<!-- </constraints> -->
