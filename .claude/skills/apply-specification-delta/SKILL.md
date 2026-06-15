---
name: apply-specification-delta
description: >
  Stage 7 of the specification-delta pipeline. Implements the tasks from tasks.md.
  Sub-invokes create-plan before implementing, marks tasks as it goes, and applies a
  workspace guard from openspec status --json. Executes the planned cleanup tasks; it
  never invents its own cleanup. Invoked only by orchestrate-specification-delta.
when_to_use: >
  Used by orchestrate-specification-delta once the delta is apply-ready, to implement
  the breakdown. Not a standalone entry point.
argument-hint: "[--change <name>]"
---

# Apply Specification-Delta

<!-- <overview> -->
Stage 7 (mutates state). Single responsibility: implement the tasks in `tasks.md` and
mark them complete. It plans before implementing (sub-invocation of `create-plan`)
and respects the workspace guard. `tasks.md` is owned by this stage.
<!-- </overview> -->

<!-- <user_communication> -->
Ask, confirm, and respond to the user in **Spanish**. Keep this skill's instructions
in **English** for token efficiency. Canonical policy: `<language_policy>` in
[artifact-structuring](../artifact-structuring/SKILL.md). User-facing rules:
[AGENTS.md](../../../AGENTS.md) §0.
<!-- </user_communication> -->

<!-- <workflow> -->
## Step 1 — Load context and apply the workspace guard

```bash
node_modules/.bin/openspec status --change "<name>" --json
node_modules/.bin/openspec instructions apply --change "<name>" --json
```

From `status` read `actionContext` and `applyRequires`; from `instructions apply`
read `contextFiles` (the planning artifact paths). Read proposal, specs, design, and
tasks for context.

**Workspace guard**: if `actionContext.mode == "workspace-planning"` and
`actionContext.allowedEditRoots` is empty, linked repos are read-only — **stop** and
report that implementation is not supported in this workspace planning mode. Do not
edit linked repos.

## Step 1.5 — Plan (sub-invocation, mandatory)

Sub-invoke [create-plan](../create-plan/SKILL.md) per the `<sub_invocation_protocol>`
of [artifact-structuring](../artifact-structuring/SKILL.md):

- **Sources (mandatory)**: the planning artifacts read in Step 1 (proposal, specs,
  design, tasks).
- **Constraint**: the plan's tasks refine `tasks.md` without contradicting its scope.
  Closure (verify/sync/archive) belongs to later pipeline stages, not to this plan.

The plan's approval gate is presented to the user as-is; without an approved plan,
implementation does not start. After approval, sync `tasks.md` to reflect the
refinement (this stage owns `tasks.md`, not `create-plan`).

## Step 2 — Implement loop

For each task still marked `- [ ]` in `tasks.md` (in the order the approved plan
governs):

- Announce «Trabajando en task N/M: <description>».
- Make the minimal, focused code changes the task requires (AGENTS.md §3/§4).
- Mark the checkbox `- [x]` **immediately** on completing that task.

Pause conditions: ambiguous task; an implementation that reveals a design flaw (fix
the code to match `design.md`, or update `design.md` to reflect the real decision —
never diverge silently); a build/typecheck/test failure that is not a typo; or a user
interrupt.

## Step 3 — Execute the planned cleanup

The cleanup tasks already live in `tasks.md` (the legacy-remediation threading's
fourth link). Execute them like any other task — this stage has **no cleanup facet of
its own** and never decides retirements on its own. `verify` (its legacy-reduction check) later confirms
the residue is gone.

## Step 4 — Close

Recount `- [x]` vs `- [ ]`. Report completion (or remaining tasks) and hand control
back to the orchestrator for the verify gate.
<!-- </workflow> -->

<!-- <constraints> -->
- Always plan first (Step 1.5) before touching code.
- Honor the workspace guard: stop on `workspace-planning` with empty
  `allowedEditRoots`.
- Mark each task's checkbox immediately after completing it; keep changes minimal and
  scoped (AGENTS.md §3/§4).
- Execute only the cleanup tasks already planned; never invent cleanup here.
- `tasks.md` is owned by this stage; the sub-invoked `create-plan` never edits it.
<!-- </constraints> -->
