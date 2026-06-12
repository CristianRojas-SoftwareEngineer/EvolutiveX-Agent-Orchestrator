---
name: openspec-onboard
description: >
  Guided first-time OpenSpec workflow tutorial with real repo work and step-by-step narration.
  Use when the user invokes /openspec-onboard or asks for OpenSpec onboarding or a first-time walkthrough.
  Also trigger for tutorial openspec, primera vez openspec,
  onboarding openspec, aprender openspec.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.3.1"
---

<!-- <overview> -->
Guide the user through their first complete OpenSpec workflow cycle with narration and real work in their codebase.
<!-- </overview> -->

<!-- <user_communication> -->
Ask, confirm, and respond to the user in **Spanish** (native Spanish-speaking audience). Keep this artifact's instructions in **English** for token efficiency. Canonical policy: `<language_policy>` in [artifact-structuring](../artifact-structuring/SKILL.md). User-facing rules: [AGENTS.md](../../AGENTS.md) §0.
<!-- </user_communication> -->

<!-- <repo_context> -->
## OpenSpec delivery in this repo

Workflow steps live in `.claude/skills/openspec-<slug>/` only. When teaching or showing recap tables, use the **Skill reference** format from [`openspec-specialist`](../openspec-specialist/SKILL.md) (`<skill_catalog>` + `<invocation_model>`).
<!-- </repo_context> -->

<!-- <workflow> -->
Guide the user through their first complete OpenSpec workflow cycle. This is a teaching experience—you'll do real work in their codebase while explaining each step.

## Preflight

Before starting, check if the OpenSpec CLI is installed:

```bash
# Unix/macOS
openspec --version 2>&1 || echo "CLI_NOT_INSTALLED"
# Windows (PowerShell)
# if (Get-Command openspec -ErrorAction SilentlyContinue) { openspec --version } else { echo "CLI_NOT_INSTALLED" }
```

**If CLI not installed:**
> OpenSpec CLI is not installed. Install it first, then ask again for OpenSpec onboarding (`openspec-onboard` or `/openspec-onboard`).

Stop here if not installed.

## Phase 1: Welcome

Display:

```
## Welcome to OpenSpec!

I'll walk you through a complete change cycle—from idea to implementation—using a real task in your codebase. Along the way, you'll learn the workflow by doing it.

**What we'll do:**
1. Pick a small, real task in your codebase
2. Explore the problem briefly
3. Create a change (the container for our work)
4. Build the artifacts: proposal → specs → design → tasks
5. Implement the tasks
6. Archive the completed change

**Time:** ~15-20 minutes

Let's start by finding something to work on.
```

## Phase 2: Task Selection

### Codebase Analysis

Scan the codebase for small improvement opportunities. Look for:

1. **TODO/FIXME comments** - Search for `TODO`, `FIXME`, `HACK`, `XXX` in code files
2. **Missing error handling** - `catch` blocks that swallow errors, risky operations without try-catch
3. **Functions without tests** - Cross-reference `src/` with test directories
4. **Type issues** - `any` types in TypeScript files (`: any`, `as any`)
5. **Debug artifacts** - `console.log`, `console.debug`, `debugger` statements in non-debug code
6. **Missing validation** - User input handlers without validation

Also check recent git activity:
```bash
# Unix/macOS
git log --oneline -10 2>/dev/null || echo "No git history"
# Windows (PowerShell)
# git log --oneline -10 2>$null; if ($LASTEXITCODE -ne 0) { echo "No git history" }
```

### Present Suggestions

From your analysis, present 3-4 specific suggestions:

```
## Task Suggestions

Based on scanning your codebase, here are some good starter tasks:

**1. [Most promising task]**
   Location: `src/path/to/file.ts:42`
   Scope: ~1-2 files, ~20-30 lines
   Why it's good: [brief reason]

**2. [Second task]**
   Location: `src/another/file.ts`
   Scope: ~1 file, ~15 lines
   Why it's good: [brief reason]

**3. [Third task]**
   Location: [location]
   Scope: [estimate]
   Why it's good: [brief reason]

**4. Something else?**
   Tell me what you'd like to work on.

Which task interests you? (Pick a number or describe your own)
```

**If nothing found:** Fall back to asking what the user wants to build:
> I didn't find obvious quick wins in your codebase. What's something small you've been meaning to add or fix?

### Scope Guardrail

If the user picks or describes something too large (major feature, multi-day work):

```
That's a valuable task, but it's probably larger than ideal for your first OpenSpec run-through.

For learning the workflow, smaller is better—it lets you see the full cycle without getting stuck in implementation details.

**Options:**
1. **Slice it smaller** - What's the smallest useful piece of [their task]? Maybe just [specific slice]?
2. **Pick something else** - One of the other suggestions, or a different small task?
3. **Do it anyway** - If you really want to tackle this, we can. Just know it'll take longer.

What would you prefer?
```

Let the user override if they insist—this is a soft guardrail.

## Phase 3: Explore Demo

Once a task is selected, briefly demonstrate explore mode:

```
Before we create a change, let me quickly show you **explore mode**—it's how you think through problems before committing to a direction.
```

Spend 1-2 minutes investigating the relevant code:
- Read the file(s) involved
- Draw a quick ASCII diagram if it helps
- Note any considerations

```
## Quick Exploration

[Your brief analysis—what you found, any considerations]

┌─────────────────────────────────────────┐
│   [Optional: ASCII diagram if helpful]  │
└─────────────────────────────────────────┘

Explore mode (`openspec-explore`) is for this kind of thinking—investigating before implementing. Ask me to explore with OpenSpec, use `/openspec-explore` if your IDE exposes it, or rely on auto-activation when you describe the problem.

Now let's create a change to hold our work.
```

**PAUSE** - Wait for user acknowledgment before proceeding.

## Phase 4: Create the Change

**EXPLAIN:**
```
## Creating a Change

A "change" in OpenSpec is a container for all the thinking and planning around a piece of work. It lives in `openspec/changes/<name>/` and holds your artifacts—proposal, specs, design, tasks.

Let me create one for our task.
```

**DO:** Create the change with a derived kebab-case name:
```bash
openspec new change "<derived-name>"
```

**SHOW:**
```
Created: `openspec/changes/<name>/`

The folder structure:
```
openspec/changes/<name>/
├── proposal.md    ← Why we're doing this (empty, we'll fill it)
├── design.md      ← How we'll build it (empty)
├── specs/         ← Detailed requirements (empty)
└── tasks.md       ← Implementation checklist (empty)
```

Now let's fill in the first artifact—the proposal.
```

## Phase 5: Proposal

**EXPLAIN:**
```
## The Proposal

The proposal captures **why** we're making this change and **what** it involves at a high level. It's the "elevator pitch" for the work.

I'll draft one based on our task.
```

**DO:** Draft the proposal content (don't save yet):

```
Here's a draft proposal:

---

## Why

[1-2 sentences explaining the problem/opportunity]

## What Changes

[Bullet points of what will be different]

## Capabilities

### New Capabilities
- `<capability-name>`: [brief description]

### Modified Capabilities
<!-- If modifying existing behavior -->

## Impact

- `src/path/to/file.ts`: [what changes]
- [other files if applicable]

---

Does this capture the intent? I can adjust before we save it.
```

**PAUSE** - Wait for user approval/feedback.

After approval, save the proposal:
```bash
openspec instructions proposal --change "<name>" --json
```
Then write the content to `openspec/changes/<name>/proposal.md`.

```
Proposal saved. This is your "why" document—you can always come back and refine it as understanding evolves.

Next up: specs.
```

## Phase 6: Specs

**EXPLAIN:**
```
## Specs

Specs define **what** we're building in precise, testable terms. They use a requirement/scenario format that makes expected behavior crystal clear.

For a small task like this, we might only need one spec file.
```

**DO:** Create the spec file:
```bash
# Unix/macOS
mkdir -p openspec/changes/<name>/specs/<capability-name>
# Windows (PowerShell)
# New-Item -ItemType Directory -Force -Path "openspec/changes/<name>/specs/<capability-name>"
```

Draft the spec content:

```
Here's the spec:

---

## ADDED Requirements

### Requirement: <Name>

<Description of what the system should do>

#### Scenario: <Scenario name>

- **WHEN** <trigger condition>
- **THEN** <expected outcome>
- **AND** <additional outcome if needed>

---

This format—WHEN/THEN/AND—makes requirements testable. You can literally read them as test cases.
```

Save to `openspec/changes/<name>/specs/<capability>/spec.md`.

## Phase 7: Design

**EXPLAIN:**
```
## Design

The design captures **how** we'll build it—technical decisions, tradeoffs, approach.

For small changes, this might be brief. That's fine—not every change needs deep design discussion.
```

**DO:** Draft design.md:

```
Here's the design:

---

## Context

[Brief context about the current state]

## Goals / Non-Goals

**Goals:**
- [What we're trying to achieve]

**Non-Goals:**
- [What's explicitly out of scope]

## Decisions

### Decision 1: [Key decision]

[Explanation of approach and rationale]

---

For a small task, this captures the key decisions without over-engineering.
```

Save to `openspec/changes/<name>/design.md`.

## Phase 8: Tasks

**EXPLAIN:**
```
## Tasks

Finally, we break the work into implementation tasks—checkboxes that drive the apply phase.

These should be small, clear, and in logical order.
```

**DO:** Generate tasks based on specs and design:

```
Here are the implementation tasks:

---

## 1. [Category or file]

- [ ] 1.1 [Specific task]
- [ ] 1.2 [Specific task]

## 2. Verify

- [ ] 2.1 [Verification step]

---

Each checkbox becomes a unit of work in the apply phase. Ready to implement?
```

**PAUSE** - Wait for user to confirm they're ready to implement.

Save to `openspec/changes/<name>/tasks.md`.

## Phase 9: Apply (Implementation)

**EXPLAIN:**
```
## Implementation

Now we implement each task, checking them off as we go. I'll announce each one and occasionally note how the specs/design informed the approach.
```

**DO:** For each task:

1. Announce: "Working on task N: [description]"
2. Implement the change in the codebase
3. Reference specs/design naturally: "The spec says X, so I'm doing Y"
4. Mark complete in tasks.md: `- [ ]` → `- [x]`
5. Brief status: "✓ Task N complete"

Keep narration light—don't over-explain every line of code.

After all tasks:

```
## Implementation Complete

All tasks done:
- [x] Task 1
- [x] Task 2
- [x] ...

The change is implemented! One more step—let's archive it.
```

## Phase 10: Archive

**EXPLAIN:**
```
## Archiving

When a change is complete, we archive it. This moves it from `openspec/changes/` to `openspec/changes/archive/YYYY-MM-DD-<name>/`.

Archived changes become your project's decision history—you can always find them later to understand why something was built a certain way.

In this repo we follow the `openspec-archive` skill: check artifacts and tasks, optionally sync delta specs to main specs, then move the folder to archive.
```

**DO:** Follow `openspec-archive` for change `<name>`:

1. Run `openspec status --change "<name>" --json` — warn if any artifacts are not `done`; confirm with user if needed.
2. Read `tasks.md` — warn on incomplete `- [ ]` tasks; confirm if needed.
3. If `openspec/changes/<name>/specs/` has delta specs, summarize sync impact and offer sync (recommended) via `openspec-sync` or archive without syncing.
4. Archive:
   ```bash
   mkdir -p openspec/changes/archive
   mv openspec/changes/<name> openspec/changes/archive/$(date +%Y-%m-%d)-<name>
   ```
   On Windows PowerShell use `Get-Date -Format yyyy-MM-dd` for the date prefix. If the target folder already exists, stop and report (do not overwrite).

**SHOW:**
```
Archived to: `openspec/changes/archive/YYYY-MM-DD-<name>/`

Specs: [synced to main specs / no delta specs / sync skipped per your choice]

The change is now part of your project's history. The code is in your codebase, the decision record is preserved.

Later you can say «archivar un change» or activate `openspec-archive` / `/openspec-archive` for the full flow again.
```

## Phase 11: Recap & Next Steps

```
## Congratulations!

You just completed a full OpenSpec cycle:

1. **Explore** - Thought through the problem
2. **New** - Created a change container
3. **Proposal** - Captured WHY
4. **Specs** - Defined WHAT in detail
5. **Design** - Decided HOW
6. **Tasks** - Broke it into steps
7. **Apply** - Implemented the work
8. **Archive** - Preserved the record

This same rhythm works for any size change—a small fix or a major feature.

---

## Referencia de skills (este repo)

**Flujo principal:**

| Skill | Cómo invocar | Qué hace |
|-------|----------------|----------|
| `openspec-propose` | Lenguaje natural / auto; `/openspec-propose` | Crea un change y genera todos los artefactos de planificación |
| `openspec-explore` | Lenguaje natural / auto; `/openspec-explore` | Pensar e investigar sin implementar código de aplicación |
| `openspec-apply` | Lenguaje natural / auto; `/openspec-apply` | Implementar tareas del change |
| `openspec-archive` | Lenguaje natural / auto; `/openspec-archive` | Archivar un change completado |

**Skills adicionales:**

| Skill | Cómo invocar | Qué hace |
|-------|----------------|----------|
| `openspec-new` | Lenguaje natural / auto; `/openspec-new` | Crear scaffold de change vacío |
| `openspec-continue` | Lenguaje natural / auto; `/openspec-continue` | Siguiente artefacto paso a paso |
| `openspec-ff` | Lenguaje natural / auto; `/openspec-ff` | Todos los artefactos de planificación de una vez |
| `openspec-verify` | Lenguaje natural / auto; `/openspec-verify` | Verificar implementación vs artefactos |

---

## What's Next?

Pide una propuesta OpenSpec (`openspec-propose`), describe lo que quieres construir, o usa `/openspec-propose` si tu IDE lo expone. ¡Ya tienes el ritmo!
```
<!-- </workflow> -->

<graceful_exit>
## Graceful exit handling

### User wants to stop mid-way

If the user says they need to stop, want to pause, or seem disengaged:

```
No problem! Your change is saved at `openspec/changes/<name>/`.

To pick up where we left off later:
- `openspec-continue` (o «continuar el change <name>») — Retomar creación de artefactos
- `openspec-apply` (o «implementar el change <name>») — Saltar a implementación si ya hay tasks

The work won't be lost. Come back whenever you're ready.
```

Exit gracefully without pressure.

### User just wants skill reference

If the user says they just want to see the workflow skills or skip the tutorial:

```
## OpenSpec Quick Reference (skills en este repo)

**Flujo principal:**

| Skill | Cómo invocar | Qué hace |
|-------|----------------|----------|
| `openspec-propose` | Lenguaje natural / auto; `/openspec-propose` | Change + todos los artefactos de planificación |
| `openspec-explore` | Lenguaje natural / auto; `/openspec-explore` | Explorar sin cambiar código de aplicación |
| `openspec-apply` | Lenguaje natural / auto; `/openspec-apply` | Implementar tareas |
| `openspec-archive` | Lenguaje natural / auto; `/openspec-archive` | Archivar cuando termines |

**Adicionales:** `openspec-new`, `openspec-continue`, `openspec-ff`, `openspec-verify` — mismo patrón de invocación (`/openspec-<slug>` o lenguaje natural).

Catálogo completo: skill `openspec-specialist`.

Pide `openspec-propose` o describe tu primera feature para empezar.
```

Exit gracefully.
</graceful_exit>

<!-- <guardrails> -->
## Guardrails

- **Follow the EXPLAIN → DO → SHOW → PAUSE pattern** at key transitions (after explore, after proposal draft, after tasks, after archive)
- **Keep narration light** during implementation—teach without lecturing
- **Don't skip phases** even if the change is small—the goal is teaching the workflow
- **Pause for acknowledgment** at marked points, but don't over-pause
- **Handle exits gracefully**—never pressure the user to continue
- **Use real codebase tasks**—don't simulate or use fake examples
- **Adjust scope gently**—guide toward smaller tasks but respect user choice
- **Skills-only UX**—teach workflow via `openspec-<slug>` skills only; do not add duplicate OpenSpec workflow files under `.claude/commands/`
- **Recap tables**—use Skill + Cómo invocar + Qué hace (see Phase 11), aligned with `openspec-specialist` `<skill_catalog>`
<!-- </guardrails> -->
