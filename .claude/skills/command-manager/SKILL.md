---
name: command-manager
description: >
  Create, refine, and improve project slash commands in Claude Code (.claude/commands/).
  Use when the user asks to create a command, new slash command, custom command,
  .claude/commands file, argument-hint, refine command, improve command, invoke
  /command-manager, or mentions crear comando, comando nuevo, refinar comando.
  For skills (SKILL.md, auto-activation, TEST-CASES), use skill-manager instead.
  Follow the routing table in the body; read references/ only per that table.
  Activate when evaluating or iterating behavior of an existing command.
  Also trigger for optimizar menú del comando or argument-hint in Spanish.
---

<!-- <<overview> -->
## Command Manager — overview

Skill to create, plan refinements for, and iteratively improve **project** slash commands in Claude Code (`.claude/commands/<name>.md`).

This skill uses XML blocks per section because it orchestrates conditional flows. Commands you create must follow `.claude/skills/artifact-structuring/SKILL.md` (mostly Markdown, XML only for hard boundaries).

High-level flow:

1. Define what the command should automate
2. Draft `.claude/commands/<name>.md` (hybrid format; see `artifact-structuring`)
3. Test with `/command-name` (manual invocation only)
4. Evaluate with the user (qualitative or objective)
5. Iterate based on feedback
6. Optionally optimize menu frontmatter (`description`, `argument-hint`)

Detect which stage the user is in and act per `<routing>`. If they prefer to iterate without formal evaluation, adapt.

**Skills:** This skill does **not** create or refine `.claude/skills/`. For skills, activate [.claude/skills/skill-manager/SKILL.md](../skill-manager/SKILL.md) (`/skill-manager` only; the legacy `/create-skill` command was removed).
<!-- </overview> -->

<!-- <<routing> -->
## Routing by intent

**Rule:** do not read both references by default; only the one indicated in the table. Follow this table before loading `references/`.

| User intent | Go to first | Read reference if… |
|----------------------|--------------|---------------------|
| New command from scratch | `<creation_process>` | Platform details, name collision with skills → [references/claude-code-commands-platform.md](references/claude-code-commands-platform.md) |
| Refine / plan improvements (no impl yet) | `<refinement_planning>` | — |
| Implement after a refinement plan | `<updating_commands>` | — |
| Test / validate command | `<testing_process>` | Full matrix → [references/testing-workflows.md](references/testing-workflows.md) |
| Edit existing command (direct) | `<updating_commands>` | — |
| Improve after feedback | `<improvement_process>` | — |
| Menu `description` / `argument-hint` only | `<menu_metadata_optimization>` | [references/claude-code-commands-platform.md](references/claude-code-commands-platform.md) |
| Command vs skill decision | `<command_vs_skill>` | [references/claude-code-commands-platform.md](references/claude-code-commands-platform.md) |
| Create / refine / test a **skill** | — | Delegate to `/skill-manager`; do not load command references |
| XML/Markdown format | — | [.claude/skills/artifact-structuring/SKILL.md](../artifact-structuring/SKILL.md) |
| Language policy (EN artifacts / ES user) | — | `<language_policy>` in [artifact-structuring](../artifact-structuring/SKILL.md) |
<!-- </routing> -->

<!-- <<user_communication> -->
Ask, confirm, and respond to the user in **Spanish** (native Spanish-speaking audience). Keep this artifact's instructions in **English** for token efficiency. Canonical policy: `<language_policy>` in [artifact-structuring](../artifact-structuring/SKILL.md). User-facing rules: [AGENTS.md](../../AGENTS.md) §0.

Adapt vocabulary to the user's level:

- "plan prescriptivo" and "baseline" are usually acceptable
- "frontmatter" and "argument-hint" only without explanation if there are clear signals of technical familiarity

Briefly explain unclear terms when it helps.
<!-- </user_communication> -->

<!-- <<creation_process> -->
## Create a command

### Capture intent

If the conversation already contains the desired flow ("turn this into a command"), extract from history: tools, sequence, user corrections, input/output formats. Confirm gaps with the user **in Spanish** before writing files.

If the user invokes `/command-manager` with text in `$ARGUMENTS`, treat it as a free-form description of the command to create and start this flow without repeating the initial interview.

1. What repetitive task should `/name` automate?
2. What inputs does it accept (`$ARGUMENTS`, positional args)?
3. Expected output format?
4. Should it stay a command or become a skill? (see `<command_vs_skill>`)

### Required parameters

Before writing files, collect:

- **Name**: `kebab-case` (basename = `/name`)
- **Purpose**: what it automates
- **Inputs**: `$ARGUMENTS` or clarification criteria
- **Process**: expected steps
- **Output**: response format
- **Constraints**: tools, validations, language, limits — in `<constraints>` block in the body

If name or purpose is missing, ask **in Spanish**. Do not create incomplete files.

### Repo ecosystem

Before drafting:

1. List existing commands with `glob` on `.claude/commands/*.md` to avoid duplicate purpose or names.
2. Check `.claude/skills/<same-name>/SKILL.md` — if a skill exists with the same name, warn that it **shadows** any `.md` command; pick a different name or migrate intent to the skill.

### Interview and research

Ask about edge cases, formats, examples, and success criteria. Do not draft the file until scope is clear.

Use `glob`/`grep` to explore the repo (do not rely only on `list_dir`; see `.claude/skills/filesystem-reliability/SKILL.md`).

### Verify existing file

Target path: `.claude/commands/<name>.md`

- Does not exist or empty → create
- Exists with content → read, summarize for the user in Spanish, ask for confirmation before replacing

### Write the command

**Location:** `.claude/commands/<kebab-name>.md` (single file only)

**Template:** copy and adapt [references/command-skeleton.md](references/command-skeleton.md).

**Optional frontmatter** (menu only; omit if unnecessary):

```yaml
---
description: Brief text visible in the / menu.
argument-hint: "[param1] [param2]"
---
```

**Body:** follow [artifact-structuring](../artifact-structuring/SKILL.md). English instructions; Spanish user I/O via `<user_communication>` or `<constraints>`.

**Size guard:** if the draft exceeds ~100 lines or needs `references/` / `scripts/`, stop and suggest migrating to `.claude/skills/<name>/SKILL.md` via `/skill-manager` per `<command_vs_skill>`.

**No-surprise principle:** no malware, unauthorized access, or misleading content relative to what is described.

**Style:** imperative; explain the *why* before MUST/NEVER in caps; generalize, do not overfit to one example.

### Test prompts (draft)

After the draft, propose 2–3 realistic `/name` invocations or user phrases. Detail → [references/testing-workflows.md](references/testing-workflows.md).
<!-- </creation_process> -->

<!-- <<refinement_planning> -->
## Plan command refinements

Absorbs the former `refine-command` flow for **commands only**. Produces a prescriptive plan; does **not** edit files unless the user explicitly asks to implement afterward.

### Required parameters

- **Command name**: `kebab-case` (e.g. `analyze-session`)
- **Improvement proposal**: what to change and why — structure, content, wording, or behavior

If name or proposal is missing, ask **in Spanish**. Do not infer undeclared improvements.

If the user asks to refine a **skill**, stop and delegate to `/skill-manager` without planning command paths.

### Process

1. Interpret `$ARGUMENTS` or conversation context.
2. Read `.claude/commands/<name>.md`. If missing, notify and ask how to proceed.
3. Analyze which sections the proposal affects; consistency with `artifact-structuring` and [claude-code-commands-platform.md](references/claude-code-commands-platform.md).
4. Use `EnterPlanMode` if available; otherwise structured markdown plan **without** file changes.
5. Deliver plan in **Spanish** with:
   - **Artifact**: command, name, path
   - **Proposal summary**: one sentence
   - **Stages and tasks**: add, update, remove (current → proposed when helpful)
   - **Open items**: decisions requiring human confirmation

**Constraints:** single command per plan; no out-of-scope refactors; Claude Code paths only under `.claude/commands/`.

After the user approves the plan, switch to `<updating_commands>` to implement.
<!-- </refinement_planning> -->

<!-- <<testing_process> -->
## Test and evaluate

Summary; detail in [references/testing-workflows.md](references/testing-workflows.md) (read only if designing or running a full test battery).

1. **With command** — `/command-name` or `/command-name args`
2. **Baseline** — same request without invoking the command
3. **Present** both results to the user (Spanish)
4. **Feedback** → iterate the `.md` file

Commands are not auto-triggered from the skill catalog; do not test auto-activation here.
<!-- </testing_process> -->

<!-- <<improvement_process> -->
## Improve the command

After tests and user feedback:

1. **Generalize** — must work beyond the 2–3 test examples
2. **Stay lean** — remove instructions that do not add value
3. **Explain why** — instead of rigid ALWAYS/NEVER without context
4. **Escalate to skill** — if logic needs bundled files or auto-activation, propose `/skill-manager`

Loop: apply changes → re-run cases → present → repeat until satisfied or stalled.

Version comparison: see [references/testing-workflows.md](references/testing-workflows.md).
<!-- </improvement_process> -->

<!-- <<menu_metadata_optimization> -->
## Optimize menu metadata

Optional frontmatter on commands affects the `/` menu label and argument hint — **not** skill-catalog auto-activation.

**Steps:**

1. Is `description` short and accurate for the menu?
2. Does `argument-hint` match how users invoke `/name`?
3. Omit frontmatter entirely if the command is internal or rarely menu-browsed

Do not confuse with skill `description` optimization — that is only in `/skill-manager`.

Platform notes: [references/claude-code-commands-platform.md](references/claude-code-commands-platform.md).
<!-- </menu_metadata_optimization> -->

<!-- <<command_vs_skill> -->
## Command vs skill

| Choose **command** | Choose **skill** (`/skill-manager`) |
|--------------------|-------------------------------------|
| User invokes `/name` manually | Auto-activation by context |
| Single `.md` file, ~< 100 lines | `references/`, `scripts/`, `TEST-CASES.md` |
| Repetitive automation with clear steps | Conventions, knowledge, progressive disclosure |
| No `context: fork` / subagents | Subagents, `!`cmd`` injection, fork testing |

If both `.claude/commands/<name>.md` and `.claude/skills/<name>/SKILL.md` exist, the **skill wins** for `/name` — remove or rename the command file to avoid confusion.
<!-- </command_vs_skill> -->

<!-- <<updating_commands> -->
## Update existing commands

- Read `.claude/commands/<name>.md` before changing; summarize for the user; confirm if replacing
- **Preserve** the file basename (slash command name)
- **Incremental** changes; test with `/name` after each meaningful change
- Do not break use cases that already work
- After an approved refinement plan from `<refinement_planning>`, implement only what the plan specifies
<!-- </updating_commands> -->

<!-- <<references> -->
## References (level 3)

| File | When to read |
|---------|----------------|
| [references/claude-code-commands-platform.md](references/claude-code-commands-platform.md) | Discovery, frontmatter, skill/command collision, limitations |
| [references/testing-workflows.md](references/testing-workflows.md) | Testing matrix, meta prompts, version comparison |
| [references/command-skeleton.md](references/command-skeleton.md) | When writing a new command |
| [.claude/skills/artifact-structuring/SKILL.md](../artifact-structuring/SKILL.md) | XML + Markdown format; `<language_policy>` |
| [.claude/skills/skill-manager/SKILL.md](../skill-manager/SKILL.md) | Skills only — delegate, do not duplicate |
| [code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills) | Official documentation |
<!-- </references> -->

<!-- <<delivery_format> -->
## Delivery format to the user

**After creating, improving, or updating a command**, respond in **Spanish** with:

- **Command created/updated**: full path to `.md`
- **Summary**: one sentence of purpose
- **Changes**: brief description (on updates)
- **Open items**: pending decisions

**After refinement planning only**, respond in **Spanish** with:

- **Refined artifact**: command name and path
- **Proposal summary**
- **Numbered stages and tasks**
- **Open items**
- Note that implementation waits for user confirmation unless they asked to apply the plan immediately
<!-- </delivery_format> -->

<!-- <<verification> -->
## Verification before responding

Per active phase (see `<routing>`):

**Creation:** parameters collected; format per `artifact-structuring`; single file under `.claude/commands/`; no overwrite without confirmation; sibling commands reviewed with `glob`; skill name collision checked; offer to test with `/name` after draft; skill migration suggested if scope too large.

**Refinement planning:** current command read; plan only unless user requested implementation; scope limited to proposal; skill requests delegated to skill-manager.

**Testing:** cases with command active; baseline for at least one case; results presented; feedback collected.

**Improvement:** feedback addressed; generalizable changes; leaner prompt; skill migration offered if needed.

**Menu metadata:** `description` / `argument-hint` accurate; not confused with skill auto-trigger.

**Update:** basename preserved; incremental tested changes; plan implementation matches approved tasks.
<!-- </verification> -->
