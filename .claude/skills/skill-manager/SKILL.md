---
name: skill-manager
description: >
  Create, edit, and improve project skills in Claude Code (.claude/skills/).
  Use when the user asks to create a skill, new skill, SKILL.md, agent skill,
  migrate CLAUDE.md to a skill, optimize description or frontmatter, invoke
  /skill-manager or /create-skill, or mentions auto-activation, undertrigger,
  test cases, or TEST-CASES. Canonical entry for skill creation (replaces the
  legacy create-skill command). For slash commands (.claude/commands/), use
  command-manager instead.
  Follow the routing table in the body; read references/ only per that table
  (platform or testing-workflows). Activate when evaluating or iterating behavior
  of an existing skill. Also trigger for crear skill, skill nueva, optimizar description,
  casos de prueba, or auto-activación in Spanish.
---

<!-- <<overview> -->
## Skill Manager — overview

Skill to create and iteratively improve **project** skills in Claude Code (`.claude/skills/<name>/`).

**Canonical entry:** `/skill-manager` replaces the former `/create-skill` command (absorbed into `<creation_process>`). Use this skill for the full flow; do not recreate `.claude/commands/create-skill.md`.

This skill uses XML blocks per section because it orchestrates conditional flows. Skills you create must follow `.claude/skills/artifact-structuring/SKILL.md` (mostly Markdown, XML only for hard boundaries).

High-level flow:

1. Define what the skill should do and how
2. Draft SKILL.md (hybrid format; see `artifact-structuring`)
3. Test with realistic prompts (`/skill-name` and/or auto-trigger)
4. Evaluate with the user (qualitative or objective)
5. Iterate based on feedback
6. Optimize `description` for reliable auto-activation

Detect which stage the user is in and act per `<routing>`. If they prefer to iterate without formal evaluation, adapt.
<!-- </overview> -->

<!-- <<routing> -->
## Routing by intent

**Rule:** do not read both references by default; only the one indicated in the table. Follow this table before loading `references/`.

| User intent | Go to first | Read reference if… |
|----------------------|--------------|---------------------|
| New skill from scratch | `<creation_process>` | Advanced frontmatter, fork, `!`cmd`` injection → [references/claude-code-platform.md](references/claude-code-platform.md) |
| Improve `description` only | `<description_optimization>` | Truncated catalog, `/doctor`, `skillOverrides` → [references/claude-code-platform.md](references/claude-code-platform.md) |
| Test / validate | `<testing_process>` | Full matrix, TEST-CASES, `context: fork` → [references/testing-workflows.md](references/testing-workflows.md) |
| Edit existing skill | `<updating_skills>` | — |
| XML/Markdown format | — | [.claude/skills/artifact-structuring/SKILL.md](.claude/skills/artifact-structuring/SKILL.md); do not duplicate Boundary Rule here |
| Language policy (EN artifacts / ES user) | — | `<language_policy>` in [.claude/skills/artifact-structuring/SKILL.md](../artifact-structuring/SKILL.md) |
| Slash commands (`.claude/commands/`) | — | Delegate to [.claude/skills/command-manager/SKILL.md](../command-manager/SKILL.md) (`/command-manager`) |
<!-- </routing> -->

<!-- <<user_communication> -->
Ask, confirm, and respond to the user in **Spanish** (native Spanish-speaking audience). Keep this artifact's instructions in **English** for token efficiency. Canonical policy: `<language_policy>` in [artifact-structuring](../artifact-structuring/SKILL.md). User-facing rules: [AGENTS.md](../../AGENTS.md) §0.

Adapt vocabulary to the user's level:

- "evaluación" and "benchmark" are usually acceptable
- "JSON" and "assertion" only without explanation if there are clear signals of technical familiarity

Briefly explain unclear terms when it helps.
<!-- </user_communication> -->

<!-- <<creation_process> -->
## Create a skill

### Capture intent

If the conversation already contains the desired flow ("turn this into a skill"), extract from history: tools, sequence, user corrections, input/output formats. Confirm gaps with the user **in Spanish** before writing files.

If the user invokes `/skill-manager` or `/create-skill` with text in `$ARGUMENTS`, treat it as a free-form description of the skill to create and start this flow without repeating the initial interview.

1. What should Claude Code be enabled to do?
2. When should it activate? (user phrases and contexts)
3. Expected output format?
4. Test cases? Skills with objective output benefit; subjective output often does not. Suggest the appropriate default and let the user decide.

### Required parameters

Before writing files, collect:

- **Name**: `kebab-case` (directory = `/name` command)
- **Purpose**: what it does and when
- **Activation**: auto (reference) vs manual (task with `disable-model-invocation: true`)
- **Instructions**: procedure or knowledge
- **Resources**: `references/`, `scripts/`, `assets/` only if needed
- **Language / constraints**: Spanish user I/O in `<user_communication>`; tool/path limits in `<constraints>` when needed

If name or purpose is missing, ask **in Spanish**. Do not create incomplete files.

### Repo ecosystem

Before drafting, list existing skills with `glob` on `.claude/skills/**/SKILL.md` to avoid duplicating `description` or overlapping purpose with sibling skills.

### Interview and research

Ask about edge cases, formats, examples, success criteria, and dependencies. Do not draft tests until this is closed.

Use `glob`/`grep` to explore the repo (do not rely only on `list_dir`; see `.claude/skills/filesystem-reliability/SKILL.md`).

### Verify existing files

Target path: `.claude/skills/<name>/SKILL.md`

- Does not exist or empty → create
- Exists with content → read, summarize for the user in Spanish, ask for confirmation before replacing

### Write SKILL.md

**Location:** `.claude/skills/<kebab-name>/SKILL.md`

**Directory structure:**

```text
.claude/skills/<kebab-name>/
├── SKILL.md              # Required
├── references/           # Optional — on-demand docs
├── scripts/              # Optional — executable code
└── TEST-CASES.md         # Optional — test cases
```

Create `references/` or `scripts/` only if content does not fit in SKILL.md (approx. < 500 lines) or is executable code.

**Template:** copy and adapt [references/skill-skeleton.md](references/skill-skeleton.md) when writing files.

**Minimum frontmatter:**

```yaml
---
name: <kebab-name>
description: >
  <WHAT>. Use when <WHEN — explicit keywords>, even if they do not ask for the skill by name.
---
```

- `name`: identifier (defaults to directory name if omitted)
- `description`: WHAT + WHEN; all activation info goes here, not in the body. Claude tends to **undertrigger** — write explicitly. Include Spanish trigger phrases when users may speak Spanish.

**Optional frontmatter:** `when_to_use` (counts toward 1536 character limit with `description`); `disable-model-invocation: true` for tasks. In this repo do not use `paths` or `allowed-tools` — see [references/claude-code-platform.md](references/claude-code-platform.md).

### Post-write checks

Before delivery, confirm:

1. Valid `name` and `description` in frontmatter.
2. `description` includes WHAT and WHEN (explicit against undertriggering).
3. `<user_communication>` in the body for Spanish user I/O; `<constraints>` when tool or path limits apply.
4. No unnecessary `references/` or `scripts/` files.

**Body:** follow [.claude/skills/artifact-structuring/SKILL.md](../artifact-structuring/SKILL.md), especially `<language_policy>`. Do not restate the full language policy here — English instructions, Spanish user I/O via `<user_communication>`.

**Types:**

- **Reference** — knowledge; Claude auto-invokes
- **Task** — flows with side effects; `disable-model-invocation: true`

**Advanced platform:** [references/claude-code-platform.md](references/claude-code-platform.md) (extra frontmatter, subagents, dynamic injection).

**No-surprise principle:** no malware, unauthorized access, or misleading content relative to what is described.

**Style:** imperative; explain the *why* before MUST/NEVER in caps; generalize, do not overfit to one example.

### Test cases (draft)

After the draft, propose 2–3 realistic prompts. Optional template: `TEST-CASES.md`. Detail → [references/testing-workflows.md](references/testing-workflows.md).
<!-- </creation_process> -->

<!-- <<testing_process> -->
## Test and evaluate

Summary; detail in [references/testing-workflows.md](references/testing-workflows.md) (read only if designing or running a full test battery).

1. **With skill** — `/skill-name` or prompt that triggers auto-activation
2. **Baseline** — same request without invoking the skill
3. **Present** both results to the user (Spanish)
4. **Feedback** → iterate SKILL.md
5. **Document** in `TEST-CASES.md` if applicable

Objective output: scripts in `scripts/`. Isolation without history: `context: fork` + `agent: Explore` (see platform).
<!-- </testing_process> -->

<!-- <<improvement_process> -->
## Improve the skill

After tests and user feedback:

1. **Generalize** — must work beyond the 2–3 test examples
2. **Stay lean** — remove instructions that do not add value
3. **Explain why** — instead of rigid ALWAYS/NEVER without context
4. **Package repetitive work** — move repeated patterns to `scripts/`

Loop: apply changes → re-run cases → present → repeat until satisfied or stalled.

Compare two versions of the same skill: see § Version comparison in [references/testing-workflows.md](references/testing-workflows.md).
<!-- </improvement_process> -->

<!-- <<description_optimization> -->
## Optimize the description

Frontmatter `description` is the main auto-activation mechanism. Offer to optimize it after creating or improving a skill.

**How it works:** Claude loads names + descriptions at start; body only on invoke. Single-step queries may not trigger the skill; multi-step or specialized tasks usually trigger if `description` matches.

**Steps:**

1. Is it specific? Does it include keywords the user would say?
2. Does it explain WHEN, not just WHAT?
3. Is it explicit enough against undertriggering?
4. Test prompt wording variations
5. If it does not trigger: broaden keywords at the **start** of `description` (1536 char limit with `when_to_use`)

Troubleshooting truncated catalog, `/doctor`, `skillOverrides`: [references/claude-code-platform.md](references/claude-code-platform.md).

**Example (bilingual triggers):**

Before: *How to build a quick dashboard for internal data.*

After: *Build quick internal dashboards. Use when the user mentions dashboards, data visualization, visualización de datos, internal metrics, métricas internas, or showing data, even if they do not say "dashboard".*
<!-- </description_optimization> -->

<!-- <<updating_skills> -->
## Update existing skills

- Read SKILL.md and support files before changing; summarize for the user; confirm if replacing
- **Preserve** directory name and frontmatter `name`
- **Incremental** changes; test each change
- Do not break use cases that already work
<!-- </updating_skills> -->

<!-- <<references> -->
## References (level 3)

| File | When to read |
|---------|----------------|
| [references/claude-code-platform.md](references/claude-code-platform.md) | Frontmatter, subagents, dynamic injection, lifecycle, catalog troubleshooting |
| [references/testing-workflows.md](references/testing-workflows.md) | Testing, TEST-CASES.md, `context: fork`, version comparison |
| [references/skill-skeleton.md](references/skill-skeleton.md) | When writing a new skill |
| [.claude/skills/artifact-structuring/SKILL.md](../artifact-structuring/SKILL.md) | XML + Markdown format; `<language_policy>` |
| [code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills) | Official documentation |
<!-- </references> -->

<!-- <<delivery_format> -->
## Delivery format to the user

After creating, improving, or updating a skill, respond in **Spanish** with:

- **Skill created/updated**: path to `SKILL.md`
- **Support resources**: file list or "none"
- **Summary**: one sentence of purpose
- **Changes**: brief description (on updates)
- **Open items**: pending decisions
<!-- </delivery_format> -->

<!-- <<verification> -->
## Verification before responding

Per active phase (see `<routing>`):

**Creation:** parameters collected; format per `artifact-structuring`; explicit `description`; support files only if they add value; no overwrite without confirmation; sibling skills reviewed with `glob`; offer to test with `/name` or auto-trigger after draft.

**Testing:** cases with skill active; baseline for at least one case; results presented; feedback collected; TEST-CASES.md if agreed.

**Improvement:** feedback addressed; generalizable changes; leaner prompt; scripts packaged if there was a repeated pattern.

**Description:** keywords and contexts; explicit against undertriggering; tested with varied prompts.

**Update:** name preserved; behavior understood; incremental tested changes.
<!-- </verification> -->
