---
description: Claude Code platform reference for project skills (discovery, frontmatter, fork). Load when skill-manager routes to platform docs.
---

# Claude Code — project skills platform

<!-- <<overview> -->
Reference for Claude Code capabilities applicable to skills in `.claude/skills/` in this repository.

Official documentation: https://code.claude.com/docs/en/skills
<!-- </overview> -->

<!-- <<user_communication> -->
Ask, confirm, and respond to the user in **Spanish** when this reference informs user-facing output. Instructions stay in **English**. Canonical policy: `<language_policy>` in [artifact-structuring](../../artifact-structuring/SKILL.md). User-facing rules: [AGENTS.md](../../../../AGENTS.md) §0.
<!-- </user_communication> -->

<!-- <<location> -->
## Location and discovery

| Concept | Value in this repo |
|----------|-------------------|
| Path | `.claude/skills/<kebab-name>/SKILL.md` |
| Slash command | `/kebab-name` (directory name) |
| Scope | Project only; do not use `~/.claude/skills/` |

**Discovery:**

- Skills in `.claude/skills/` from the start directory and each parent directory up to the repo root.
- In monorepos, skills in nested `.claude/skills/` under subdirectories are also discovered when working in those paths.
- Changes to skill files are detected hot during the session (no restart needed unless `.claude/skills/` is created for the first time after the session starts).

**Merge with commands:** `.claude/commands/<name>.md` and `.claude/skills/<name>/SKILL.md` expose the same `/name`; the skill takes priority and supports bundled files.
<!-- </location> -->

<!-- <<skill_types> -->
## Skill types

| Type | Content | Typical invocation |
|------|-----------|-------------------|
| **Reference** | Knowledge, conventions, patterns | Claude auto-loads when `description` matches |
| **Task** | Steps with side effects (commit, deploy) | User with `/name`; add `disable-model-invocation: true` |
<!-- </skill_types> -->

<!-- <<frontmatter> -->
## Frontmatter (YAML)

Only `name` and `description` are required. `description` is the main auto-activation mechanism: include WHAT it does and WHEN to use it (third person).

### Safe in Smart Code Proxy

| Field | Use |
|-------|-----|
| `name` | Identifier; if omitted, uses directory name (max 64 chars, kebab-case) |
| `description` | Auto-trigger; combine with `when_to_use` if more context is needed |
| `when_to_use` | Additional phrases or scenarios; concatenated to `description` (combined limit 1536 characters) |
| `disable-model-invocation: true` | Manual `/name` only; not in context for auto-trigger |
| `user-invocable: false` | Claude only; hidden from `/` menu |
| `context: fork` | Runs in isolated subagent; SKILL.md body is the task prompt |
| `agent` | Subagent with `context: fork` (`Explore`, `Plan`, `general-purpose`, custom in `.claude/agents/`) |
| `arguments` / `$ARGUMENTS` / `$0` | Positional arguments when invoking `/skill arg` |
| `${CLAUDE_SKILL_DIR}` | Path to the skill directory (packaged scripts) |

### Avoid in this repo

| Field | Reason |
|-------|--------|
| `paths` | CLI may silently reject the entire skill |
| `allowed-tools` | Same; use `<constraints>` in the body for restrictions |

See `docs/references/historical/smart-code-proxy/MAINTENANCE.md`. For language: follow `<language_policy>` in [artifact-structuring/SKILL.md](../../artifact-structuring/SKILL.md) — English artifact text, Spanish user I/O via `<constraints>` in the body (not extra frontmatter fields). Do not duplicate the full policy here.
<!-- </frontmatter> -->

<!-- <<dynamic_injection> -->
## Dynamic injection

Lines `!`command`` or blocks opened with ` ```! ` run shell **before** Claude sees the content. It is preprocessed: Claude only receives the substituted output.

Minimal example in SKILL.md:

```yaml
---
name: summarize-changes
description: Summarize uncommitted changes. Use when asked what changed or for a commit message draft.
---

## Current changes

!`git diff HEAD`

## Instructions

Summarize in two or three bullets. If the diff is empty, state that there are no uncommitted changes.
```

On Windows, `shell: powershell` in frontmatter if the project uses PowerShell for `!` blocks (requires `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`).
<!-- </dynamic_injection> -->

<!-- <<progressive_disclosure> -->
## Progressive disclosure (three levels)

1. **Metadata** (`name` + `description`) — always in the skill catalog (~100 words).
2. **SKILL.md** — full body when the skill is invoked (ideal < 500 lines).
3. **Bundled resources** (`references/`, `scripts/`, `assets/`) — on demand; scripts run without loading source code into context.

Patterns:

- Link `references/` from SKILL.md with when to read each file.
- References > 300 lines: include a table of contents at the top.
- Domain variants: `references/aws.md`, `references/gcp.md`, etc., chosen by context.
<!-- </progressive_disclosure> -->

<!-- <<session_lifecycle> -->
## Session lifecycle

- On invoke, rendered SKILL.md content enters the conversation and **remains** for the rest of the session (the file is not re-read each turn).
- After compaction: re-attached up to 5000 tokens per skill (max 25000 tokens combined across invoked skills), prioritizing the most recent.
- If the skill stops influencing after several turns: strengthen `description`/instructions or re-invoke `/skill-name` after compaction.
<!-- </session_lifecycle> -->

<!-- <<troubleshooting> -->
## Catalog budget and troubleshooting

- All skills list `name`; `description` entries are shortened if there are many skills (~1% of context window budget).
- Each entry: max 1536 characters (`description` + `when_to_use`); put keywords at the **start**.
- `/doctor` — diagnose catalog overflow.
- Skill does not trigger: broaden keywords in `description`, try `/skill-name`, verify it appears in the listing.
- Skill triggers too often: more specific `description` or `disable-model-invocation: true`.
- `skillOverrides` in `.claude/settings.local.json` — control visibility without editing SKILL.md (`/skills` menu).
<!-- </troubleshooting> -->

<!-- <<directory_layout> -->
## Recommended directory layout

```
skill-name/
├── SKILL.md              # Required
├── TEST-CASES.md         # Optional — test cases
├── references/           # On-demand docs
├── scripts/              # Executable code
└── assets/               # Templates, icons, etc.
```
<!-- </directory_layout> -->
