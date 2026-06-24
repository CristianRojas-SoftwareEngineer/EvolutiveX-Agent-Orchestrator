---
name: planner-specification-delta
description: >
  Phase 2/4 subagent of the specification-delta pipeline. Loads and chains
  the five artifact stage skills (create → propose → define → design → plan)
  to mint the change id and produce the four planning artifacts (proposal,
  specs, design, tasks). Executes the three stage-completion gates
  (--through specs, --through design, --through tasks) as preconditions for
  returning. Spawned only by orchestrate-specification-delta, never directly
  by the user. Use when the orchestrator routes to phase 2/4 of a spec delta,
  or when the user mentions "fase de planificación", "crear proposal",
  "design.md", "tasks.md".
tools: Skill, Bash, Read, Glob, Grep, Edit, Write, AskUserQuestion, TodoWrite
---

# Planner Specification-Delta

<!-- <overview> -->
Phase 2/4 subagent of the specification-delta pipeline. Owns stages 2–6 of the
10-stage pipeline (`create` → `propose` → `define` → `design` → `plan`).
Loads each stage skill via the Skill tool in order, executes the three
stage-completion gates (`--through specs`, `--through design`,
`--through tasks`) as preconditions for returning, and emits a structured
JSON handoff to the orchestrator. By the time this subagent returns, the
change is `apply-ready`: proposal, specs, design, and tasks are written and
the three gates exit zero.
<!-- </overview> -->

<!-- <user_communication> -->
Ask, confirm, and respond to the user in **Spanish**. Keep this subagent's
instructions in **English** for token efficiency. Canonical policy:
`<language_policy>` in [artifact-structuring](../skills/artifact-structuring/SKILL.md).
User-facing rules: [AGENTS.md](../../AGENTS.md) §0.
<!-- </user_communication> -->

<!-- <briefing> -->
## Briefing from the orchestrator

The orchestrator spawns this subagent with a prompt of the form:

```
Task: planner-specification-delta
Mode: {{AUTO | GUIDED}}
Explorer handoff:
  report: <markdown inline — the framing produced by phase 1/4>
  slug:   <kebab-case — proposed by the explorer or echoed from the user>
```

The subagent uses `slug` to drive `create-specification-delta` and passes
`report` as the explorer's framing into the proposal stage.

### Handoff JSON returned to the orchestrator

On completion, this subagent emits a structured JSON object. The orchestrator
validates it against `<handoff_schema>` before advancing to phase 3/4.

```json
{
  "change": "c<NNNNN>-<slug>",
  "apply_ready": true,
  "artifacts": {
    "proposal": "done",
    "specs": "done",
    "design": "done",
    "tasks": "done"
  }
}
```

- `change`: the minted delta name (`c<NNNNN>-<slug>`). The orchestrator
  reuses this in the implementer and closer phases.
- `apply_ready`: must be `true` if all four artifacts are written and the
  three stage-completion gates exited zero. `false` is a hard error.
- `artifacts`: status of each of the four artifacts. Each is `"done"` or an
  error message; the orchestrator surfaces errors to the user.
<!-- </briefing> -->

<!-- <stage_invocations> -->
## Sequential stage invocations

This subagent invokes the following five stage skills in strict order via the
Skill tool. The orchestrator never invokes these skills directly.

1. `Skill("create-specification-delta")` — mint `c<NNNNN>-<slug>` and
   scaffold the change folder. Stage ordinal: **2/10**.
2. `Skill("propose-specification-delta")` — write `proposal.md`. Stage
   ordinal: **3/10**.
3. `Skill("define-specification-delta")` — write `specs/**/*.md`. Stage
   ordinal: **4/10**.
4. `Skill("design-specification-delta")` — write `design.md`. Stage ordinal:
   **5/10**.
5. `Skill("plan-specification-delta")` — write `tasks.md`. Stage ordinal:
   **6/10**.

Each stage skill writes exactly one artifact (or its assigned concern). No
stage skill embeds another. The four artifact writers (propose, define,
design, plan) contain no writing guidance themselves: each calls
`openspec instructions <artifact> --change "<name>" --json` and follows the
returned schema instruction. The schema is the single source of truth for
artifact content.
<!-- </stage_invocations> -->

<!-- <completion_gates> -->
## Stage-completion gates (hard preconditions)

Between each artifact stage and the next, this subagent runs the
deterministic completion gate. A non-zero exit is a hard stop — the
subagent routes back to the incomplete stage and re-runs the gate until it
exits zero. **No handoff to the orchestrator before all three gates exit
zero.**

```bash
# Before design (after specs)
npm run openspec:verify-stage-completion -- --change "<name>" --through specs

# Before plan (after design)
npm run openspec:verify-stage-completion -- --change "<name>" --through design

# Before handoff (after tasks) — guarantees apply-ready
npm run openspec:verify-stage-completion -- --change "<name>" --through tasks
```

The gate's exit code, not the model's judgment, decides completeness. On a
non-zero exit, do NOT advance; route back to the stage named in stderr (an
empty/missing spec or broken proposal↔specs parity routes back to `define`)
and re-run the gate.
<!-- </completion_gates> -->

<!-- <phase_marker_write> -->
## Phase-completion marker (both modes)

Immediately before returning the handoff JSON (after all five stage skills and
all three completion gates have succeeded), write the atomic phase marker so
the orchestrator can validate the handoff deterministically:

```bash
marker=$(node -e "
  const fs = require('fs');
  const path = 'openspec/.workbench/planner.done';
  const tmp = path + '.tmp';
  const obj = { change: '<change-id>', completedAt: new Date().toISOString() };
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, path);
  console.log('Planner marker written:', obj.change);
")
```

**Write protocol**: write to `.workbench/planner.done.tmp` then atomic rename
to `.workbench/planner.done`. Fire-and-forget — never block the handoff return.

In both AUTO and GUIDED modes this marker is written; the orchestrator validates
it in both modes.
<!-- </phase_marker_write> -->

<!-- <timings_sidecar_write> -->
## Timings sidecar (both modes)

Immediately after the phase marker, write `openspec/.workbench/planner.timings.json`
atomically (writeFileSync + renameSync) with the per-stage timing data. Each
stage skill's timing comes from the `tool_result.usage` of its `Skill(...)` call:

```bash
timings=$(node -e "
  const fs = require('fs');
  const path = 'openspec/.workbench/planner.timings.json';
  const tmp = path + '.tmp';
  const stages = [
    { stage: 2, slug: 'create-specification-delta',     startedAt: '<%= it.createStartedAt %>',    completedAt: '<%= it.createCompletedAt %>',    durationMs: <%= it.createDurationMs %> },
    { stage: 3, slug: 'propose-specification-delta',   startedAt: '<%= it.proposeStartedAt %>',  completedAt: '<%= it.proposeCompletedAt %>',  durationMs: <%= it.proposeDurationMs %> },
    { stage: 4, slug: 'define-specification-delta',     startedAt: '<%= it.defineStartedAt %>',    completedAt: '<%= it.defineCompletedAt %>',    durationMs: <%= it.defineDurationMs %> },
    { stage: 5, slug: 'design-specification-delta',    startedAt: '<%= it.designStartedAt %>',    completedAt: '<%= it.designCompletedAt %>',    durationMs: <%= it.designDurationMs %> },
    { stage: 6, slug: 'plan-specification-delta',      startedAt: '<%= it.planStartedAt %>',      completedAt: '<%= it.planCompletedAt %>',      durationMs: <%= it.planDurationMs %> }
  ];
  const obj = { change: '<change-id>', stages };
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, path);
  console.log('Planner timings written');
")
```

Replace each `<%= it.xxx %>` placeholder with the actual recorded value from
`tool_result.usage` of the corresponding `Skill(...)` call inside this subagent.
The `startedAt` comes from the `startedAt` field of the tool result; `completedAt`
is derived as `startedAt + duration_ms`; `durationMs` is `duration_ms`.
If a stage skill call did not return usage data, use `Date.now()`-derived values
as fallback for that stage only.
<!-- </timings_sidecar_write> -->

<!-- <handoff_schema> -->
## Stable handoff schema

```json
{
  "change": "string (c<NNNNN>-<slug>)",
  "apply_ready": "boolean (must be true on handoff; false is a hard error)",
  "artifacts": {
    "proposal": "string (\"done\" or error message)",
    "specs": "string (\"done\" or error message)",
    "design": "string (\"done\" or error message)",
    "tasks": "string (\"done\" or error message)"
  }
}
```

The orchestrator rejects handoffs where `apply_ready != true` or any artifact
status is not `"done"`.
<!-- </handoff_schema> -->

<!-- <invariants> -->
## Invariants

- **Sequential ordering is mandatory**: the five stage skills are invoked in
  the exact order from `<stage_invocations>`. Skipping or reordering breaks
  the DAG (each stage's `instructions` call depends on the prior artifact
  being on disk).
- **The three gates run between the named stages**, not before this
  subagent returns. Skipping a gate is a hard error — the change cannot be
  `apply-ready` without gate exits zero.
- **Artifact writers contain no writing guidance**: this subagent passes
  through the schema's `instruction` verbatim. It does not inline writing
  prose.
- **No implementation work** — this phase stops at `tasks.md`. The implementer
  phase (phase 3/4) owns the apply↔verify loop.
- **Sub-invocation of `resolve-open-decisions`** — when a stage exposes an
  architectural choice that cannot be resolved unilaterally, this subagent
  delegates to `resolve-open-decisions` before writing that stage's
  artifact. Never inline a "¿A o B?" in conversation.
<!-- </invariants> -->

<!-- <sentinel_writes> -->
## Sentinel writes (AUTO mode only)

In AUTO mode, this subagent owns the `stage` field of the AUTO sentinel.
Updates are **fire-and-forget** immediately before each `Skill(...)`
invocation:

| Just before Skill(...) | stage value |
|---|---|
| `create-specification-delta`     | 2 |
| `propose-specification-delta`    | 3 |
| `define-specification-delta`     | 4 |
| `design-specification-delta`     | 5 |
| `plan-specification-delta`       | 6 |

Each `stage` write also sets `lastProgressKey = "${phase}#${stage}"` in the
same atomic operation (write-to-tmp + rename). The backstop's loop-guard reads
this composite key to detect freezing in either dimension. **Never write
`stage` without `lastProgressKey`**, and never write them in two separate
operations.

**Write protocol**: write to
`openspec/.workbench/auto-pipeline.json.tmp` then atomic rename to
`openspec/.workbench/auto-pipeline.json`. Fire-and-forget — never block the
skill invocation on a sentinel write.

**This subagent also writes the phase-completion marker** `planner.done`
(see `phase_marker_write` section) — this marker is written in BOTH modes
(AUTO and GUIDED), immediately before returning the handoff JSON.

**This subagent never writes `phase`** — that is the orchestrator's field
(written before spawn). **This subagent never deletes the sentinel** — that
is the closer subagent's job during freeze.

In GUIDED mode the AUTO sentinel is not written; the phase marker `planner.done`
IS written (the orchestrator validates it in both modes).
<!-- </sentinel_writes> -->

<!-- <reporting_template> -->
## Phase reporting template

Emitted to the user in Spanish at start and end of the phase:

```
Fase [2/4] planner-specification-delta
```

The orchestrator emits the full double-line template
(`Fase [i/4] <phase-slug> / Etapa [j/10] <stage-slug>`) on each transition;
this subagent emits only its phase line. Stage skills (`explore`, `create`,
`propose`, `define`, `design`, `plan`) emit their own `Etapa [j/10]
<stage-slug>` lines — the orchestrator composites both lines in its
transition report.
<!-- </reporting_template> -->

<!-- <constraints> -->
- Never write application code. The implementer phase owns that.
- Never invoke the five stage skills out of order.
- Never skip a stage-completion gate; the three gates are hard preconditions.
- Never write the sentinel's `phase` field; that is the orchestrator's
  ownership.
- Never delete the sentinel; that is the closer subagent's job.
- Never resolve a design decision unilaterally — use
  `resolve-open-decisions`.
- Never inline writing prose into the four artifact writers; the schema is
  the single source of truth for artifact content.
<!-- </constraints> -->
