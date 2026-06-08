---
description: Template for creating project skills (SKILL.md hybrid format). Load when skill-manager routes to the creation template.
---

# Template — project skill

<overview>
Copy and adapt when creating `.claude/skills/<kebab-name>/SKILL.md`.
</overview>

<user_communication>
Ask, confirm, and respond to the user in **Spanish** when this reference informs user-facing output. Instructions stay in **English**. Canonical policy: `<language_policy>` in [artifact-structuring](../../artifact-structuring/SKILL.md). User-facing rules: [AGENTS.md](../../../../AGENTS.md) §0.
</user_communication>

<skill_template>
## SKILL.md (template)

```markdown
---
name: <kebab-name>
description: >
  <WHAT it does in one sentence>. Use when the user <WHEN — explicit keywords,
  synonyms, and domains>, even if they do not ask for the skill by name.
---

# <Readable title>
<!-- Instructions: English; user I/O: Spanish — see language_policy in artifact-structuring -->

<user_communication>
Ask, confirm, and respond to the user in **Spanish** (native Spanish-speaking audience). Keep this artifact's instructions in **English** for token efficiency. Canonical policy: `<language_policy>` in [.claude/skills/artifact-structuring/SKILL.md](../artifact-structuring/SKILL.md). User-facing rules: [AGENTS.md](../../../AGENTS.md) §0. Keep standard technical terms in English when clarity benefits (e.g. streaming, API, tokens).
</user_communication>

## When it applies

- <scenario 1>
- <scenario 2>

## Workflow

1. <step>
2. <step>
3. <step>

## Output format

Use English placeholders in the skill body; require **Spanish** headings and prose in delivered output via `<user_communication>` and `<constraints>` when present (e.g. `## Resumen` instead of `## Summary` when the skill emits user-facing markdown).

<output_template>
# {{title}}
## Summary
{{summary}}
</output_template>

## Examples

**Example 1:**
Input: <typical input>
Output: <expected output>
```
</skill_template>

<activation_variants>
## Activation variants

**Reference** (knowledge, auto-trigger): omit `disable-model-invocation`.

**Task** (commit, deploy, side effects):

```yaml
disable-model-invocation: true
```
</activation_variants>

<optional_resources>
## Optional resources

Create only if content does not fit in SKILL.md (< 500 lines) or is reusable:

```
<kebab-name>/
├── SKILL.md
├── references/     # Long or domain-specific docs
├── scripts/        # Validation or repetitive tasks
└── TEST-CASES.md   # Documented test cases
```

Multi-domain organization:

```
<kebab-name>/
├── SKILL.md          # Variant selection + common workflow
└── references/
    ├── aws.md
    └── gcp.md
```

In SKILL.md, indicate when to read each `references/` file.
</optional_resources>

<writing_patterns>
## Writing patterns

- Imperative; explain the *why* of important rules.
- Few-shots with Input/Output when output format is critical.
- Do not duplicate in the body what is already in `description` (activation).
- Advanced frontmatter and `!`cmd`` injection: see [claude-code-platform.md](claude-code-platform.md).
- Hybrid XML + Markdown format: see [.claude/skills/artifact-structuring/SKILL.md](../../artifact-structuring/SKILL.md).
- **Language:** read `<language_policy>` in [artifact-structuring/SKILL.md](../../artifact-structuring/SKILL.md) before authoring; English body and English placeholders in `<output_template>`; Spanish in all user-facing delivered text (translate section titles such as Summary → Resumen when applicable).
</writing_patterns>
