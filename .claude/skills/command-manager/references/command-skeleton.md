---
description: Template for creating project slash commands (hybrid format, frontmatter). Load when command-manager routes to the command template.
---

# Template — slash command

<overview>
Copy and adapt when creating `.claude/commands/<kebab-name>.md`.
</overview>

<command_template>
## Command file (template)

```markdown
---
description: Brief text visible in the / commands menu.
argument-hint: "[param1] [param2]"
---

# <Readable title>

<overview>
One sentence: what `/name` automates and when to use it.
</overview>

<user_communication>
Ask, confirm, and respond to the user in **Spanish** (native Spanish-speaking audience). Keep this artifact's instructions in **English** for token efficiency. Canonical policy: `<language_policy>` in [.claude/skills/artifact-structuring/SKILL.md](../artifact-structuring/SKILL.md). User-facing rules: [AGENTS.md](../../../AGENTS.md) §0.
</user_communication>

<parameters>
## Expected parameters

Invoke with or without `$ARGUMENTS`. With arguments, interpret the free-form description. Without arguments, request missing information **in Spanish**.

- **Name**: `kebab-case` if not defined
- **Purpose**: what repetitive task it automates
- **Inputs**: `$ARGUMENTS` or clarification criteria
- **Process**: expected steps
- **Output**: response format
- **Constraints**: tools, validations, language, limits

If name or purpose is missing, stop and ask **in Spanish**.
</parameters>

<objective>
## Objective

<single sentence operational goal>
</objective>

<process>
## Process

### Step 1: ...

### Step 2: ...
</process>

<constraints>
## Rules

1. Follow `<language_policy>` in [artifact-structuring](../artifact-structuring/SKILL.md).
2. Single file under `.claude/commands/` only.
3. No overwrite without reading and user confirmation.
4. No speculation beyond user request.
</constraints>

<delivery_format>
## Delivery format

Respond in Spanish per AGENTS.md (§0) with:

- **File created or updated**: full path
- **Purpose**: one sentence
- **Open items**: decisions requiring human review
</delivery_format>

<verification>
## Final verification

1. File exists only in `.claude/commands/`.
2. Purpose clear in H1 and overview.
3. No overwrite without confirmation.
4. If scope grew beyond ~100 lines, user was offered migration to a skill.
</verification>
```
</command_template>

<frontmatter_notes>
## Frontmatter

Omit the YAML block entirely for very simple commands.

| Field | Use |
|-------|-----|
| `description` | Short label in the `/` menu (not skill auto-activation) |
| `argument-hint` | Hint for positional args when invoking `/name` |

Do not use `paths` or `allowed-tools` in this repo — see [claude-code-commands-platform.md](claude-code-commands-platform.md).
</frontmatter_notes>

<writing_patterns>
## Writing patterns

- Imperative; explain the *why* of important rules.
- XML blocks per concern when the command has multiple sections (parameters, process, verification).
- Plain Markdown is fine for short commands (< ~500 tokens, single concern).
- Hybrid XML + Markdown: see [.claude/skills/artifact-structuring/SKILL.md](../../artifact-structuring/SKILL.md).
- **Language:** read `<language_policy>` in [artifact-structuring/SKILL.md](../../artifact-structuring/SKILL.md); English body, Spanish user communication.
- If the procedure needs `references/`, `scripts/`, or auto-activation by context, migrate to `.claude/skills/` via `/skill-manager`.
</writing_patterns>
