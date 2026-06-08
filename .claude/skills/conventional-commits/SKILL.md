---
name: conventional-commits
description: Activate when user requests commit, drafting commit message, Claude Code is about to execute git commit, or reviewing/improving existing commit message. Generate Conventional Commits with structured first line (type(scope)> description) and mandatory body containing Propósito (narrative opening with the observation that motivates the change), Objetivos, and Resumen de cambios.
---

# Conventional Commits Policy

<overview>
All commit messages must follow Conventional Commits with a structured first line and a mandatory body in three blocks.

This skill's instructions are in **English** (token efficiency). **Commit messages** and explanations to the user are in **Spanish** — see `<language_policy>` in [artifact-structuring](../artifact-structuring/SKILL.md) and [AGENTS.md](../../AGENTS.md) §0.
</overview>

<user_communication>
Ask, confirm, and respond to the user in **Spanish** (native Spanish-speaking audience). Keep this artifact's instructions in **English** for token efficiency. Canonical policy: `<language_policy>` in [artifact-structuring](../artifact-structuring/SKILL.md). User-facing rules: [AGENTS.md](../../AGENTS.md) §0.
</user_communication>

<activation>
## When to activate

- The user asks to create a commit or draft its message.
- Claude Code is about to run `git commit` on its own after completing a task.
- The user asks to review or improve an existing commit message.
- Any scenario where a commit message must be generated or validated.
</activation>

<commit_types>
## Commit types

| Type | When to use |
|---|---|
| `feat` | New functionality |
| `fix` | Bug fix |
| `refactor` | Change without new functionality or bug fix |
| `docs` | Documentation only |
| `test` | Add or fix tests |
| `chore` | Maintenance, dependencies, configuration |
| `ci` | CI/CD pipeline changes |
| `perf` | Performance improvement |
| `build` | Build system or external dependencies |
| `style` | Formatting, spacing, no logic change |
| `revert` | Revert a previous commit |
</commit_types>

<first_line>
## First line structure

```
type(scope): imperative description
```

- **Scope**: module name in parentheses; omit if the change is cross-cutting.
- **Description**: imperative mood in **Spanish** in the delivered message (see output template), no trailing period.
- **Limit**: 72 characters total.
- **Breaking change**: add `!` before `:` — `type(scope)!:` — or footer `BREAKING CHANGE:`.
</first_line>

<body_structure>
## Mandatory body structure (Spanish in the commit message)

Separate from the first line with a blank line. Include these three blocks **in order**, using the **Spanish section headers** exactly as shown (they are part of the commit message, not this skill's instruction language):

| Header | Content |
|--------|---------|
| **Propósito** | Single narrative under one header only — **never** a separate Motivación section. Open with the **observation that motivates the change**: what was seen, missing, or failing (bug, defect to prevent, new capability, or change to existing behavior). Continue with the **reason and value of implementing** that change. Flowing prose or consecutive paragraphs; same opening pattern as `/create-plan` Propósito. |
| **Objetivos** | Bullet list of concrete goals fulfilled by this commit. |
| **Resumen de cambios** | Files or components modified: what was added, updated, or removed and where. |

Canonical narrative rules: `.claude/commands/create-plan.md` `<purpose_objectives_model>` § Purpose.
</body_structure>

<footer>
## Optional footer

- `BREAKING CHANGE:` followed by a **Spanish** description for compatibility-breaking changes.
- `Closes #N` if the commit closes an issue.
</footer>

<output_template>
## Commit message output (Spanish)

The generated commit message must use this shape. Section headers and prose are **Spanish**; keep type prefixes (`feat`, `fix`, etc.) and standard technical terms in English when clarity benefits.

```
docs(commands): alinear narrativa de propósito en conventional-commits

Propósito
El skill conventional-commits enmarcaba «motivación» como elemento narrativo
principal aparte del propósito, en lugar de componer una sola sección Propósito
que abra con la observación que dispara el cambio. Eso desalineaba el skill
respecto al patrón de create-plan y podía producir mensajes de commit fragmentados.
Unificar la redacción bajo un solo header Propósito — observación primero, razón
y valor de implementar después — mantiene coherencia en todo el flujo plan →
implementación → commit.

Objetivos
- Redefinir Propósito como narrativa única que abre con la observación motivante.
- Actualizar el ejemplo del output_template y la checklist de verification.
- Referenciar purpose_objectives_model como fuente canónica.

Resumen de cambios
- `.claude/skills/conventional-commits/SKILL.md`: body_structure, template y checklist.
```

Note: **Propósito** is one header and one narrative. Open with the observation that motivates the change; continue with reason and value of implementing it. Use one or two paragraphs; never a separate **Motivación** header.
</output_template>

<verification>
## Verification checklist

Before proposing the message, confirm:

1. Does the first line not exceed 72 characters or end with a period?
2. Does the body contain the three Spanish headers: Propósito, Objetivos, and Resumen de cambios?
3. Does the type correctly reflect the nature of the change?
4. Does scope appear only when a module is clearly affected?
5. Are breaking changes marked?
6. Does Propósito open with the observation that motivates the change and continue with the reason and value of implementing it — without duplicating Objetivos?
7. Is there no separate Motivación header in the message body (the full narrative lives under Propósito only)?
</verification>
