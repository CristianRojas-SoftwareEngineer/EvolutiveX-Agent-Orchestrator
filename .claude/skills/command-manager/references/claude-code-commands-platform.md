---
description: Claude Code platform reference for project slash commands. Load when command-manager routes to platform docs.
---

# Claude Code — project slash commands platform

<!-- <<overview> -->
Reference for slash commands in `.claude/commands/` in this repository.

Official documentation: https://code.claude.com/docs/en/skills (commands and skills share discovery and `/name` routing).
<!-- </overview> -->

<!-- <<user_communication> -->
Ask, confirm, and respond to the user in **Spanish** when this reference informs user-facing output. Instructions stay in **English**. Canonical policy: `<language_policy>` in [.claude/skills/artifact-structuring/SKILL.md](../../artifact-structuring/SKILL.md). User-facing rules: [AGENTS.md](../../../../AGENTS.md) §0.
<!-- </user_communication> -->

<!-- <<location> -->
## Location and discovery

| Concept | Value in this repo |
|----------|-------------------|
| Path | `.claude/commands/<kebab-name>.md` |
| Slash command | `/kebab-name` (file basename without `.md`) |
| Scope | Project only; do not use `~/.claude/commands/` |

**Discovery:**

- Commands in `.claude/commands/` from the start directory and each parent directory up to the repo root.
- In monorepos, nested `.claude/commands/` under subdirectories are also discovered when working in those paths.
- Changes to command files are detected hot during the session (no restart needed unless `.claude/commands/` is created for the first time after the session starts).

**Merge with skills:** `.claude/commands/<name>.md` and `.claude/skills/<name>/SKILL.md` expose the same `/name`. If both exist, the **skill takes priority**; the `.md` command file is ignored for that name. Avoid name collisions unless intentional.
<!-- </location> -->

<!-- <<command_vs_skill> -->
## Command vs skill

| Prefer **command** | Prefer **skill** |
|--------------------|------------------|
| Single-file automation, user invokes `/name` | Auto-activation by context (`description` in skill catalog) |
| Roughly < ~100 lines, no bundled resources | Needs `references/`, `scripts/`, `assets/`, or `TEST-CASES.md` |
| Repetitive task with clear steps | Knowledge, conventions, or multi-step flows with progressive disclosure |
| No subagent isolation required | `context: fork`, dynamic `!`cmd`` injection, subagents |

To create or refine skills, use `.claude/skills/skill-manager/SKILL.md` (`/skill-manager`).
<!-- </command_vs_skill> -->

<!-- <<frontmatter> -->
## Frontmatter (YAML)

Commands do not require frontmatter. Use it only when it adds value for the `/` menu.

### Safe in Smart Code Proxy

| Field | Use |
|-------|-----|
| `description` | Short label in the commands menu (not skill catalog auto-trigger) |
| `argument-hint` | Hint shown for positional args (e.g. `"[issue-id]"`) |

Commands accept `$ARGUMENTS` and positional `$0`, `$1`, … when invoked as `/name arg1 arg2` (same as skills).

### Avoid in this repo

| Field | Reason |
|-------|--------|
| `paths` | CLI may silently reject the entire artifact |
| `allowed-tools` | Same; use `<constraints>` in the body for restrictions |

For language: follow `<language_policy>` in [artifact-structuring/SKILL.md](../../artifact-structuring/SKILL.md) — English artifact text, Spanish user I/O via `<user_communication>` or `<constraints>` in the body.

Skill-specific frontmatter (`name`, `when_to_use`, `disable-model-invocation`, `context: fork`, etc.) applies only under `.claude/skills/`. See [skill-manager/references/claude-code-platform.md](../../skill-manager/references/claude-code-platform.md).
<!-- </frontmatter> -->

<!-- <<session_lifecycle> -->
## Session lifecycle

- On invoke, the command file content enters the conversation and **remains** for the rest of the session (the file is not re-read each turn).
- Commands are **not** listed in the skill catalog for auto-activation; users (or explicit instructions) invoke them with `/name`.
- If behavior weakens after compaction: re-invoke `/command-name` or strengthen step-by-step instructions in the body.
<!-- </session_lifecycle> -->

<!-- <<limitations> -->
## What commands cannot do in this repo

- No `references/`, `scripts/`, or `assets/` sibling directories — use a skill instead.
- No skill-catalog `description` auto-trigger — use a skill if context-based loading is required.
- No `${CLAUDE_SKILL_DIR}` — that variable applies to skill directories only.

If a command outgrows a single file, migrate to `.claude/skills/<name>/SKILL.md` and invoke `/skill-manager`.
<!-- </limitations> -->
