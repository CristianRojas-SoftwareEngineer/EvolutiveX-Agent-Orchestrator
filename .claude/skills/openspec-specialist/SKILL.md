---
name: openspec-specialist
description: >
  End-to-end OpenSpec reference: mental model (openspec/specs vs openspec/changes),
  artifact roles and boundaries (proposal, specs, design, tasks), workflow skill catalog
  (openspec-propose, explore, new, continue, ff, apply, verify, sync, archive,
  bulk-archive, onboard), CLI usage, schema customization (openspec/config.yaml),
  workspaces, migration, and troubleshooting. Canonical skill routing for this repo.
  Use when the user asks how OpenSpec works, which skill or CLI action to use, what
  belongs in each artifact, profile or schema selection, or OpenSpec errors—without
  already naming a single workflow-step skill. Also trigger for openspec, delta
  specs, spec-driven, configurar OpenSpec, elegir skill openspec, tabla skills openspec,
  or mapeo workflow openspec in Spanish.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.3.1"
---

<overview>
Assist with OpenSpec end-to-end: installation, project initialization, workflow skill selection, CLI commands, artifact interpretation, schema customization, migration, and troubleshooting.

**This repo:** workflow steps live in `.claude/skills/openspec-*/` only. Invoke them by auto-activation, natural language, or `/openspec-<slug>` when the IDE exposes project skills. Do not add duplicate OpenSpec workflow files under `.claude/commands/`.
</overview>

<user_communication>
Ask, confirm, and respond to the user in **Spanish** (native Spanish-speaking audience). Keep this artifact's instructions in **English** for token efficiency. Canonical policy: `<language_policy>` in [artifact-structuring](../artifact-structuring/SKILL.md). User-facing rules: [AGENTS.md](../../AGENTS.md) §0.
</user_communication>

<mental_model>
## Core mental model

OpenSpec is a spec-driven workflow system built around two durable directories inside a repo:

- `openspec/specs/`: source of truth for the system's current agreed behavior.
- `openspec/changes/`: one folder per proposed change, containing planning artifacts and delta specs.

The operating model is fluid and action-based, not phase-locked. You can create, refine, implement, verify, sync, and archive as the work evolves.

OpenSpec is also brownfield-first: the delta model is intended to describe changes to an existing system, not just greenfield designs.
</mental_model>

<workflow_profiles>
## Workflow profiles (skills in this repo)

OpenSpec CLI profiles (`core` vs expanded) still apply to which workflows exist upstream. **In this repository**, all listed workflow skills are present under `.claude/skills/` and are maintained manually (hybrid XML + Markdown per `artifact-structuring`).

**Core path (fast):**

| Skill | Purpose |
|-------|---------|
| `openspec-propose` | New change + all planning artifacts in one step |
| `openspec-explore` | Think / investigate without implementing application code |
| `openspec-apply` | Implement `tasks.md` |
| `openspec-sync` | Merge delta specs into `openspec/specs/` without archiving |
| `openspec-archive` | Archive a completed change |

**Expanded path (granular):**

| Skill | Purpose |
|-------|---------|
| `openspec-new` | Empty change scaffold only |
| `openspec-continue` | Next artifact in dependency order |
| `openspec-ff` | All planning artifacts in one run |
| `openspec-verify` | Check implementation vs artifacts |
| `openspec-bulk-archive` | Archive several completed changes |
| `openspec-onboard` | Guided tutorial on the real repo |

**Orchestration (multi-phase roadmap):**

| Skill | Purpose |
|-------|---------|
| `openspec-roadmap-manager` | Decompose a large change set into L1 orchestrator + chained L2 phases; phase gate |

**Meta (routing, not a workflow step):** `openspec-specialist` — this file. Full catalog: `<skill_catalog>` below.

To inspect CLI profile settings only (does **not** refresh `.claude/` skills):

```bash
openspec config profile
```
</workflow_profiles>

<skill_catalog>
## Workflow skill catalog (canonical for this repo)

Convention: directory `.claude/skills/openspec-<slug>/`, frontmatter `name: openspec-<slug>`. See `<invocation_model>` for how users invoke skills in this repo.

| Skill `name` | Directory | Profile | Invocation (this repo) | When to use (summary) |
|--------------|-----------|---------|------------------------|------------------------|
| `openspec-propose` | `.claude/skills/openspec-propose/` | core | Natural language / auto; `/openspec-propose` | Full plan in one step (proposal, specs, design, tasks) |
| `openspec-explore` | `.claude/skills/openspec-explore/` | core | Natural language / auto; `/openspec-explore` | Clarify problem, compare options, no app implementation |
| `openspec-apply` | `.claude/skills/openspec-apply/` | core | Natural language / auto; `/openspec-apply` | Execute tasks from active change |
| `openspec-sync` | `.claude/skills/openspec-sync/` | core | Natural language / auto; `/openspec-sync` | Promote deltas to main specs without archive |
| `openspec-archive` | `.claude/skills/openspec-archive/` | core | Natural language / auto; `/openspec-archive` | Finalize and archive completed change |
| `openspec-new` | `.claude/skills/openspec-new/` | expanded | Natural language / auto; `/openspec-new` | Scaffold empty change |
| `openspec-continue` | `.claude/skills/openspec-continue/` | expanded | Natural language / auto; `/openspec-continue` | One artifact at a time |
| `openspec-ff` | `.claude/skills/openspec-ff/` | expanded | Natural language / auto; `/openspec-ff` | Fast-forward all planning artifacts |
| `openspec-verify` | `.claude/skills/openspec-verify/` | expanded | Natural language / auto; `/openspec-verify` | Pre-archive verification |
| `openspec-bulk-archive` | `.claude/skills/openspec-bulk-archive/` | expanded | Natural language / auto; `/openspec-bulk-archive` | Batch archive with conflict handling |
| `openspec-onboard` | `.claude/skills/openspec-onboard/` | expanded | Natural language / auto; `/openspec-onboard` | First-time walkthrough |

| `openspec-roadmap-manager` | `.claude/skills/openspec-roadmap-manager/` | orchestration | Natural language / auto; `/openspec-roadmap-manager` | Large multi-phase roadmap: L1 orchestrator + chained L2 phases + phase gate |

**Not in the table:** `openspec-specialist` — meta reference and routing only.

**Delivery:** OpenSpec workflow steps are skills under `.claude/skills/openspec-<slug>/` only. Do not add duplicate workflow slash commands under `.claude/commands/` without explicit user request.

Upstream-generated skill folder names (`openspec-apply-change`, `openspec-sync-specs`, …) must not be reintroduced; use `openspec-<slug>` only.
</skill_catalog>

<invocation_model>
## How workflow skills are invoked (this repo)

Workflow delivery is **skills only** under `.claude/skills/openspec-<slug>/`. Do not add duplicate OpenSpec workflow files under `.claude/commands/`.

**Three invocation paths (in order of preference when teaching or routing):**

1. **Auto-activation** — Claude loads the skill when the user message matches `description` and Spanish trigger phrases in frontmatter.
2. **Natural language** — User asks in Spanish (or English) for the outcome, e.g. «explorar con OpenSpec», «aplicar el cambio add-auth», «archivar el change».
3. **`/openspec-<slug>`** — When the IDE exposes project skills as slash commands (directory name = command name).

**Meta routing skill:** `openspec-specialist` (this file) uses the same three paths. It answers OpenSpec questions and picks workflow skills; it does not replace `openspec-propose`, `openspec-apply`, or other step skills.

**Onboarding and recap tables** must use the `<skill_catalog>` columns (Skill, Invocation, purpose)—not a separate command-style table for removed workflow slash files.

**Cross-cutting OpenSpec work** (`openspec list`, `status`, `validate`, `instructions`, …) uses the CLI directly; no homonymous workflow skill is required unless a skill wraps that step (e.g. `openspec-archive` for archive with sync prompts).
</invocation_model>

<artifact_model>
## Artifact model

A change is usually represented by a dedicated folder under `openspec/changes/<change-name>/`. In the default `spec-driven` workflow, that folder is organized as:

- `proposal.md` at the root of the change folder.
- `design.md` at the root of the change folder.
- `tasks.md` at the root of the change folder.
- `specs/` as a subdirectory containing one or more delta-spec files.

Artifact dependency chain:

`proposal` → `specs` → `design` → `tasks` → `implement`

Artifacts are meant to evolve as understanding improves. Earlier artifacts can be refined later, but each one should remain focused on its own level of abstraction.

### What each artifact should contain

#### `proposal.md`

Put the problem framing, motivation, intent, and scope here.

Should contain:
- The change name or identifier.
- The problem being solved.
- The desired outcome and expected value.
- Scope boundaries: what is included and what is explicitly out of scope.
- High-level impact on the system, users, or workflow.
- Key assumptions, constraints, and open questions.
- A concise approach description, if useful for framing.

Should not contain:
- Step-by-step implementation details.
- Task checklists.
- Detailed architecture decisions.
- Full requirement deltas written in spec format.
- Large code samples.

#### `specs/`

Put normative requirement deltas here. This is the contract layer.

Should contain:
- One or more spec files, usually grouped by feature, domain, or concern.
- Requirement statements written as deltas against existing behavior.
- Sections such as `ADDED`, `MODIFIED`, `REMOVED`, and sometimes `RENAMED`.
- Precise, testable statements of expected behavior.
- Scenarios written so they can be verified later, often with Given/When/Then structure.

Should not contain:
- Motivation or project narrative.
- Implementation strategy.
- Task breakdowns.
- Low-level code design.
- Broad architecture discussion.
- Verbatim copies of unrelated existing specs unless they are being edited as deltas.

Practical placement guidance:
- Put each logically independent capability in its own spec file when that improves readability.
- Keep related requirement changes together when they are part of the same user-visible behavior.
- Use delta sections to make the change explicit and auditable.
- Prefer the smallest requirement set that fully describes the expected behavior.

Archive behavior:
- When a change is archived, `ADDED` requirements merge into the main specs, `MODIFIED` requirements replace the existing behavior, and `REMOVED` requirements are deleted from the main specs.

#### `design.md`

Put the technical approach here.

Should contain:
- Architecture decisions and trade-offs.
- Component boundaries and integration points.
- Data flow, control flow, and dependency decisions.
- Proposed files, modules, or subsystems affected.
- Non-trivial alternatives considered and why they were rejected.
- Implementation constraints that affect how the solution should be built.

Should not contain:
- The full list of implementation tasks.
- Pure requirement language that belongs in `specs/`.
- A product pitch or change justification that belongs in `proposal.md`.
- Detailed acceptance criteria that are better expressed as spec requirements.

#### `tasks.md`

Put the executable plan here.

Should contain:
- A sequenced checklist of implementation steps.
- Small, actionable tasks that can be completed and verified.
- References to the files, modules, or tests that will be touched.
- Validation or testing steps when relevant.
- Checkboxes that reflect real progress.
- A task order that matches dependency reality.

Should not contain:
- Broad design rationale.
- Requirement prose.
- Business justification.
- Large design discussions.
- Tasks that are too coarse to verify.

### Content boundaries between artifacts

Use this separation rule:

- `proposal.md` answers: "Why are we doing this?"
- `specs/` answers: "What must be true after the change?"
- `design.md` answers: "How should we implement it?"
- `tasks.md` answers: "What exactly will we do, in what order?"

### Typical file layout

A change folder usually looks like this:

```text
openspec/changes/<change-name>/
├── proposal.md
├── design.md
├── tasks.md
└── specs/
    ├── <feature-a>.md
    └── <feature-b>.md
```

The exact layout can vary by schema, but the responsibility split should remain the same.
</artifact_model>

<change_lifecycle>
## When to update an existing change versus start a new one

Use the existing change when the intent is the same and you are refining execution.

Prefer a new change when:
- The intent has changed materially.
- The scope has expanded into a different piece of work.
- The original change can be completed and archived cleanly without the new work.
- The new work would make the original story harder to understand.

A good practical heuristic:
- Same problem, same feature, same story: update the current change.
- Different problem, different feature, different story: create a new change.
</change_lifecycle>

<skill_selection_heuristics>
## Skill selection heuristics

Activate or invoke the homonymous skill from `<skill_catalog>` per `<invocation_model>` (do not run `openspec update` to "fix" skills):

- **`openspec-explore`** — requirements unclear, options to compare, investigation before commitment.
- **`openspec-propose`** — fastest end-to-end planning path (default core).
- **`openspec-new`** — scaffold-only; user will drive artifacts stepwise.
- **`openspec-continue`** — one artifact at a time with review between steps.
- **`openspec-ff`** — scope clear; all planning artifacts in one pass.
- **`openspec-apply`** — planning complete or resuming implementation from `tasks.md`.
- **`openspec-verify`** — before archive; completeness and coherence check.
- **`openspec-sync`** — merge deltas into main specs without archiving.
- **`openspec-archive`** — finalize a completed change.
- **`openspec-bulk-archive`** — several completed changes; possible spec conflicts.
- **`openspec-onboard`** — guided learning on the real codebase.
- **`openspec-roadmap-manager`** — large set of changes with internal dependencies, multi-phase decomposition, iterative-incremental delivery with governance and phase gate.
</skill_selection_heuristics>

<workflow_skills_reference>
## Workflow skills reference

Each row points to `SKILL.md` in the skill directory. Follow that file when the skill is active; do not duplicate its full workflow here.

### `openspec-propose`

Creates a change and generates planning artifacts in one step. Typical outputs under `openspec/changes/<name>/`: `proposal.md`, `specs/`, `design.md`, `tasks.md`.

### `openspec-explore`

Thinking partner; no application code implementation. May create or update OpenSpec artifacts only when the user asks.

### `openspec-new`

Creates change folder + `.openspec.yaml`; then user continues with `openspec-continue` or `openspec-ff`.

### `openspec-continue`

Next artifact in dependency order (`openspec status --change "<name>" --json`).

### `openspec-ff`

All planning artifacts in one pass until apply-ready.

### `openspec-apply`

Implements `tasks.md`; checks off tasks; uses `openspec instructions apply` when needed.

### `openspec-verify`

Reports CRITICAL / WARNING / SUGGESTION against artifacts.

### `openspec-sync`

Agent-driven merge of delta specs into `openspec/specs/`.

### `openspec-archive`

Validate (optional), merge specs, move to `openspec/changes/archive/YYYY-MM-DD-<name>/`.

### `openspec-bulk-archive`

Batch archive with conflict detection and ordered merge.

### `openspec-onboard`

Guided first-time tutorial on the real codebase. Must teach the **skill catalog** from `<skill_catalog>` and `<invocation_model>`. Recap and exit messages use Skill + Invocation + purpose columns. Phase archive follows `openspec-archive` (status checks, optional sync via `openspec-sync`, `mv` to dated archive folder).

### `openspec-roadmap-manager`

Orchestration skill for large, multi-phase change sets. Decomposes a set of high-level changes into one L1 orchestrator change (governance only, no `src/`) and N L2 phase changes (1:1 to phases), chained by a dependency DAG. Covers: analysis and decomposition (coherence/consistency/completeness), L1 orchestrator creation via `openspec-propose`, phase loop (create L2 → implement → gate → sync → docs → retire legacy → archive), and roadmap close-out. Embeds a generalized **phase gate** (6 checks: openspec-verify delegation, phase traceability, dependency gate, DoD from orchestrator specs, doc sync, legacy reduction) with PASS/FAIL verdict. Templates for orchestrator and phase change prompts live in `.claude/skills/openspec-roadmap-manager/references/templates.md`.
</workflow_skills_reference>

<routing>
## Routing: specialist vs workflow skill

- **OpenSpec questions, errors, or "which skill?"** → `openspec-specialist` (this file). Do not embed full step workflows here.
- **Concrete workflow step** (explore, propose, apply, …) → activate `openspec-<slug>` from `<skill_catalog>` per `<invocation_model>`; read its `SKILL.md`.
- **How to invoke** → explain paths in `<invocation_model>`; point to `<skill_catalog>` for per-skill invocation column.
- **Cross-cutting CLI** (`openspec list`, `validate`, `status`, `instructions`, …) → run CLI; no workflow skill required.
</routing>

<cli_reference>
## CLI reference

Use the CLI for terminal-side project management and automation.

Common commands:

- `openspec init`: initialize OpenSpec in a project.
- `openspec update`: upstream may regenerate tool integration files. **In this repo, do not run it to refresh `.claude/` unless the user explicitly requests it** — it overwrites hand-maintained skills.
- `openspec list`: list changes or specs.
- `openspec show`: inspect a change or spec.
- `openspec view`: interactive dashboard for exploring specs and changes.
- `openspec status`: inspect artifact completion state.
- `openspec validate`: validate changes and specs.
- `openspec instructions`: get enriched instructions for a specific artifact or for `apply`.
- `openspec templates`: inspect resolved template paths.
- `openspec schemas`: discover available schemas.
- `openspec archive`: archive from the CLI. **In this repo**, prefer skill `openspec-archive` when archiving from Claude Code (status checks, optional sync via `openspec-sync`, dated folder move under `openspec/changes/archive/`).
- `openspec schema fork`: clone a built-in schema into `openspec/schemas/`.
- `openspec schema init`: create a schema from scratch.
- `openspec schema validate`: validate a schema.
- `openspec schema which`: identify the active schema.
- `openspec config`: inspect or edit settings.
- `openspec feedback`: submit feedback.
- `openspec completion install`: install shell completions.
- `openspec workspace setup|list|ls|link|relink|doctor|update|open`: workspace commands for cross-repo planning.

### Human vs agent usage

Some CLI commands are interactive and human-oriented:

- `openspec init`
- `openspec view`
- `openspec config edit`
- `openspec feedback`
- `openspec completion install`

Some commands support `--json` and are suitable for scripts or agents:

- `openspec list`
- `openspec show`
- `openspec validate`
- `openspec status`
- `openspec instructions`
- `openspec templates`
- `openspec schemas`
- workspace commands such as `setup`, `list`, `ls`, `link`, `relink`, `doctor`, and `update`
</cli_reference>

<workspaces>
## Workspace model

Use workspaces only for cross-repo or multi-folder planning. Workspace support is under active development, so treat its behavior, state files, and JSON output as more volatile than repo-local OpenSpec state.

Prefer repo-local OpenSpec as the default unless you explicitly need coordination across linked repos or folders.

Mental model:

- workspace = coordination surface for related cross-repo changes
- link = stable name for a repo or folder
- change = one feature, fix, or project

Repo-local projects keep their state in:

- `openspec/specs/`
- `openspec/changes/`

Workspaces keep their state in:

- `.openspec-workspace/workspace.yaml`
- `.openspec-workspace/local.yaml`
</workspaces>

<project_configuration>
## Schema customization

Schema resolution order:

1. CLI flag: `--schema <name>`
2. Change metadata: `.openspec.yaml`
3. Project config: `openspec/config.yaml`
4. Default: `spec-driven`

Customization workflow:

- Fork a built-in schema with `openspec schema fork spec-driven <new-name>`.
- Edit `openspec/schemas/<new-name>/schema.yaml`.
- Edit templates under `openspec/schemas/<new-name>/templates/`.
- Use project context and per-artifact rules in `openspec/config.yaml`.

When explaining templates, emphasize that templates are markdown files injected into the AI prompt for each artifact.

Important config behavior:
- `context` is injected into every artifact prompt.
- `rules` are injected only for matching artifact IDs.
- Unknown artifact IDs in `rules` generate warnings.
- Context has a 50KB limit.
- Invalid YAML is reported with line numbers.

## Multilingual artifact generation

OpenSpec can generate artifacts in languages other than English through `openspec/config.yaml`.

Recommended pattern:

```yaml
schema: spec-driven
context: |
  Language: Spanish
  All artifacts must be written in Spanish.
```

Keep language instructions alongside normal project context such as stack, database, and architecture rules.
</project_configuration>

<supported_tools>
## Supported tools and delivery modes (this repo)

**Workflow delivery:** `.claude/skills/openspec-<slug>/SKILL.md` only. Skills are **maintained and refined in-repo** (hybrid XML + Markdown, Spanish user I/O per `artifact-structuring`).

**Other project commands** (unrelated to OpenSpec workflow): `.claude/commands/analyze-session.md`, `create-plan.md`, `verify-scripts.md`.

Catalog and policy: `<skill_catalog>` and `<maintenance>` in this file.
</supported_tools>

<maintenance>
## Maintenance policy (this repo)

<critical>
**Never run `openspec update`, `openspec init --force`, or similar CLI commands that regenerate `.claude/` integration files unless the user explicitly requests it in the current task.**

Those commands overwrite hand-maintained skills and break customized workflows.
</critical>

**Normal workflow:**

- Edit workflow skills directly under `.claude/skills/openspec-*/`.
- Update `<skill_catalog>` in this file when adding or removing a workflow skill.
- Use OpenSpec CLI for **project** state only: `openspec list`, `status`, `validate`, `instructions`, `archive`, etc.

**If the user explicitly asks to sync from upstream OpenSpec:**

1. Confirm scope (which files may be overwritten).
2. Run the CLI only after confirmation.
3. Re-apply `artifact-structuring`, Spanish `<user_communication>`, and custom sections; remove legacy folders (`openspec-*-change`, `openspec-sync-specs`, …) if the CLI recreates them.
4. Do **not** add duplicate OpenSpec workflow slash commands under `.claude/commands/` unless the user explicitly requests them.

Restart the IDE after bulk skill edits so the skill catalog reloads.
</maintenance>

<migration>
## Migration guidance

Legacy OpenSpec workflows are preserved during migration. Existing changes, archived history, and `openspec/specs/` remain intact. **Tool integration under `.claude/` is owned by this repo**, not by automatic `openspec update` runs.

The core model is unchanged: `openspec/specs/` = source of truth, `openspec/changes/` = active work.
</migration>

<troubleshooting>
## Troubleshooting

Use these patterns:

- If a workflow skill does not activate, check frontmatter `description` / Spanish triggers; invoke `/openspec-<slug>` or name the skill explicitly. Do **not** run `openspec update` without user request.
- If schema resolution is wrong, inspect change metadata, project config, and CLI overrides.
- If artifacts are incomplete or low quality, enrich `openspec/config.yaml`, tighten per-artifact rules, or prefer `openspec-continue` over `openspec-ff`.
- If validation fails, inspect `openspec validate`, `openspec status`, and the relevant spec or change files.
- If archive complains about missing sync, use skill `openspec-sync` or let `openspec-archive` prompt for it.
- If workspace behavior seems inconsistent, prefer repo-local planning unless multi-repo coordination is truly required.
</troubleshooting>

<guardrails>
## Meta skill guardrails

- Route workflow steps to the homonymous skill in `<skill_catalog>`; read that skill's `SKILL.md` instead of embedding full workflows here.
- Never run `openspec update`, `openspec init --force`, or similar CLI commands that regenerate `.claude/` integration unless the user explicitly requests it (see `<maintenance>`).
- Respond in Spanish per `<user_communication>`.
- When adding or removing a workflow skill on disk, update `<skill_catalog>`, `<workflow_profiles>`, and `<workflow_skills_reference>` in this file together.
- Do not add OpenSpec workflow slash commands under `.claude/commands/` without explicit user request.
</guardrails>

<response_behavior>
## Recommended response behavior

When helping a user with OpenSpec, respond **in Spanish**:

1. Identify whether they need planning, implementation, validation, customization, migration, or workspace coordination.
2. Name the exact workflow skill (`openspec-<slug>`) or CLI action that matches their goal.
3. Explain what files will be created or modified.
4. State whether the result affects `openspec/specs/`, `openspec/changes/`, or both.
5. Mention profile, schema, and workspace dependencies when relevant.
6. Prefer concrete examples over abstract descriptions.
</response_behavior>
