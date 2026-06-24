---
name: artifact-structuring
description: >
  Guide for structuring Claude Code artifacts (skills, slash commands, CLAUDE.md,
  rule files, hook payloads, system prompts) using the hybrid XML + Markdown pattern.
  Use when creating, editing, reviewing, or refactoring any LLM-facing artifact under
  .claude/ or equivalent. Also trigger when the user mentions artifact structuring,
  XML boundaries, prompt layout, SKILL.md format, command structure, or improving
  instruction-following across Claude Code artifacts. Also trigger for language policy,
  idioma, español, token cost, or Spanish vs English artifact conventions.
---

# Artifact Structuring for Claude Code

<!-- <overview> -->
How to combine XML tags with Markdown to structure Claude Code artifacts
(skills, commands, rules, hooks, system prompts) that the model follows precisely
at a reasonable token cost.

This document applies its own pattern: XML at semantic boundaries (level 1), Markdown inside each block (level 2), nested XML only for constraints or templates (level 3). In `.md` files, XML boundaries are written as HTML comments so Markdown renderers ignore them; raw XML is used only in non-Markdown contexts.
<!-- </overview> -->

<!-- <language_policy> -->
## Repository language policy

LLM-facing artifacts under `.claude/` (skills, slash commands, references) are written in **English** to reduce token cost when they are loaded and cached repeatedly across a session.

**Primary audience:** the project maintainer and main users are **native Spanish speakers**. User messages are typically in Spanish.

**Human interaction — always Spanish unless the user writes in another language:**

- Responses, summaries, reports, and plans shown to the user
- Questions, clarifications, and confirmations when data is missing (parameters, scope, approvals)
- Explanations while executing a skill or command

Assume Spanish by default for all user-facing text.

**When authoring new skills or commands:**

- Instruction body and XML blocks: **English**
- Add a `<constraints>` block (or equivalent) requiring **Spanish** for all user-facing output
- Include Spanish trigger phrases in frontmatter `description` when they improve auto-activation

**Git commits:** message body in Spanish per [AGENTS.md](../../../AGENTS.md) §0 and the [conventional-commits](../conventional-commits/SKILL.md) skill. The conventional-commits skill keeps instructions in English; Spanish appears only in the commit message output template and required section headers.

**Generated plans and reports** (e.g. `/create-plan` plans, `/investigate` reports): invariant reasoning text in the skill artifact is English; the deliverable to the user is Spanish, including translated fundamental considerations.

**OpenSpec artefacts under `openspec/changes/<change>/` and `openspec/specs/`** (proposal, specs, design, tasks, non-canonical records): content is **user-facing** — the user reads and commits it — and therefore MUST be written in Spanish by default, per AGENTS.md §0. Skills that author these artefacts (`propose-`, `define-`, `design-`, `plan-specification-delta`) MUST declare this constraint explicitly in their `<constraints>` block.

**Output templates in skills:** use English placeholders in SKILL.md (e.g. `## Summary`); require Spanish in delivered output via `<constraints>`.

**Technical terms:** keep standard terms in English when translation adds ambiguity (e.g. `prompt`, `token`, `API`, `streaming`, `frontmatter`, `undertrigger`).

Other artifacts should reference this block instead of copying it in full — use a short `<user_communication>` section with a link here.
<!-- </language_policy> -->

<!-- <why_hybrid> -->
## Why a hybrid format

Markdown and XML solve different problems. Markdown creates **reading hierarchy** — headings, emphasis, and lists make text scannable. XML creates **semantic boundaries** — open/close tags tell the model where a block starts and ends. Neither format alone is optimal for instructional artifact authoring:

Markdown alone fails on long multi-section artifacts because boundaries are implicit. A `## Section A` ends only when the next `##` appears, which can cause instruction *bleeding* between adjacent sections. XML alone is verbose and hard for humans to read — it lacks the light hierarchy of headers, bold, and lists.

The hybrid pattern uses each format where it is strongest: XML for hard boundaries between discrete blocks, Markdown for readable content inside those blocks. It is the same pattern Anthropic uses in production system prompts.
<!-- </why_hybrid> -->

<!-- <boundary_rule> -->
## Core principle — Boundary Rule

> Use XML when the model must treat a block as an **atomic unit** it can activate, ignore, or reference separately. Use Markdown for everything that goes **inside** that unit.

Ask: "Does this section need a hard boundary so the model never mixes its content with adjacent sections?" If yes, wrap it in XML. If not, a Markdown heading is enough.

**Syntax by context:**

- **`.md` files** (SKILL.md, slash commands, CLAUDE.md): write XML boundaries as HTML comments — `<!-- <tag_name> -->` ... `<!-- </tag_name> -->`. Markdown renderers ignore HTML comments completely, so the file renders cleanly while the model still sees the semantic boundary.
- **Non-Markdown contexts** (API system prompts delivered as plain strings, JSON/YAML payloads, hook configurations): use raw XML — `<tag_name>` ... `</tag_name>`.

Code blocks inside `.md` files always render as literal text regardless of their content, so examples within fenced code blocks do not need the comment wrapping.
<!-- </boundary_rule> -->

<!-- <hierarchy> -->
## Three-level hierarchy

### Level 1 — XML wrapper (semantic boundary)

Top-level sections the model can activate conditionally, skip entirely, or that a program can inject/replace dynamically. In `.md` files, write as HTML comments:

```markdown
<!-- <routing_rules> -->
...content...
<!-- </routing_rules> -->
```

When to use level 1:

- The block has a distinct **role** (rules vs. context vs. examples vs. persona).
- The block can be **activated/deactivated** programmatically (e.g. CCR hooks that inject rules by mode).
- Two adjacent blocks contain instructions that **must not mix**.
- The block is a **data island** (user input, document content, variables) separate from instructions.

### Level 2 — Markdown headings (reading hierarchy)

Inside an XML wrapper, use `##` and `###` to organize prose. Headings create visual hierarchy for humans and light structure for the model — but they do not create hard boundaries.

```markdown
<!-- <routing_rules> -->
## Slot assignment

EXPLORE mode uses the light model for fast iteration...

### Selection criteria

When the prompt implies file discovery, route to EXPLORE.
When it requires multi-step reasoning, route to REASON.
<!-- </routing_rules> -->
```

### Level 3 — Nested XML (sub-block with its own identity)

Use a nested tag only when a sub-block inside a level-1 block must be **referenced independently** or has a different nature than surrounding content (e.g. a hard constraint inside explanatory prose).

```markdown
<!-- <routing_rules> -->
## Slot assignment

EXPLORE uses the light model for fast iteration.

<!-- <cost_limits> -->
Never exceed $0.02 per request in EXPLORE mode.
Never exceed $0.10 per request in REASON mode.
<!-- </cost_limits> -->

## Fallback behavior

If the router cannot determine a slot, default to REASON.
<!-- </routing_rules> -->
```

Nested XML should be rare. If you nest three or more levels, you are probably overusing it — flatten the structure or split into sibling level-1 blocks.
<!-- </hierarchy> -->

<!-- <practical_patterns> -->
## Practical patterns

### Pattern 1 — Persona + Rules + Context (system prompt, non-Markdown)

Typical layout for an API system prompt or plain-string config. Each top-level concern in its own XML boundary; prose in Markdown inside. Raw XML is appropriate here because this is not a `.md` file.

```xml
<persona>
You are a senior TypeScript engineer specializing in Node.js backends.
You write concise, well-tested code and prefer explicit types over inference.
</persona>

<rules>
## Code style

Use `const` by default; `let` only when reassignment is needed.
Prefer named exports over default exports.
Every public function must have JSDoc with `@param` and `@returns`.

## Error handling

Wrap async operations in try/catch. Never swallow errors silently.

<critical>
Never commit secrets, tokens, or credentials to the repository.
</critical>
</rules>

<project_context>
## Stack

Runtime: Node.js 22 on Windows 11 (native, not WSL).
Package manager: npm.
Test framework: Vitest.
</project_context>
```

### Pattern 2 — Conditional blocks for mode-aware prompts (non-Markdown)

When a hook or router injects different instructions by context (e.g. CCR), XML tags are injection points the code can replace. Raw XML since this is delivered as a string, not a `.md` file.

```xml
<base_instructions>
Read the full file before editing. Run tests after each change.
</base_instructions>

<mode_instructions>
<!-- This block is replaced dynamically by the router -->
## Current mode: EXPLORE

Prioritize reading and search over editing. Summarize findings before proposing changes.
</mode_instructions>
```

### Pattern 3 — Examples with clear boundaries (non-Markdown)

In few-shots inside API prompts, XML prevents the model from confusing example content with real instructions.

```xml
<examples>
<example name="good_commit_message">
Input: Added retry logic with exponential backoff to the HTTP client
Output: feat(http): add retry with exponential backoff
</example>

<example name="bad_commit_message">
Input: Added retry logic with exponential backoff to the HTTP client
Output: updated stuff
Reason: Too vague, missing scope and type prefix.
</example>
</examples>
```

### Pattern 4 — SKILL.md body (`.md` file)

Skills are read when activated. Optimize for quick comprehension. XML only where a hard boundary is needed — typically constraints, output templates, or data schemas. Use HTML-comment syntax since SKILL.md is a `.md` file; the rest is plain Markdown.

```markdown
---
name: my-skill
description: ...
---

# My Skill

Brief explanation of what it does and when it applies.

## Workflow

1. Read the input file.
2. Validate the schema against the reference.
3. Generate the output.

## Output format

<!-- <output_template> -->
# {{title}}
## Summary
{{summary}}
## Details
{{details}}
<!-- </output_template> -->

<!-- <constraints> -->
Output must not exceed 500 words.
Never include PII in the summary section.
<!-- </constraints> -->

## Edge cases

If the input file is empty, return an error message instead of empty output.
```
<!-- </practical_patterns> -->

<!-- <sub_invocation_protocol> -->
## Sub-invocation protocol (composition between skills)

Two composition patterns exist in this ecosystem. Skills that compose with others must reference this block instead of defining a local variant.

### Pattern A — Invocation with result consumption

The invoker runs another skill as a sub-step and consumes its canonical output (report, plan). Contract:

1. **Input context** — the invoker passes explicit context in the invocation prompt: which skill is invoking, what is already known (prior findings, active artifacts), and the complete requirements (sources to review, constraints, expected output). The sub-invoked skill never guesses the invoker's workflow.
2. **Sub-invoked mode** — the sub-invoked skill suppresses its conversational close-out: it delivers its canonical output (report or plan) as a hand-off to the invoker's flow, and does not execute its own closing stages (commits, syncs, follow-up offers) unless the invoker explicitly instructs it to.
3. **Gate propagation** — approval gates belonging to the sub-invoked skill (scope questions, plan approval) are still presented to the user through the outer flow. The invoker never absorbs or skips them.
4. **Invoker declarations** — the invoker declares whether the sub-invocation is conditional or mandatory, and what it does with the result (e.g. sync it into its own artifacts). Any artifact the invoker owns is updated by the invoker, never by the sub-invoked skill.

Living examples: `investigate` sub-invoking `create-plan` to formalize its read-only investigation plan (and consuming it as the hand-off that drives execution); `apply-specification-delta` sub-invoking `create-plan` before implementing.

### Pattern B — Shared canonical reference

The invoker neither invokes nor inlines another skill: it cites a canonical block as the single source of truth for a rule or structure and follows it in place. There is no transfer of control and no output to consume — the reference points at the authoritative definition so the invoker does not restate or fork it. Examples: `conventional-commits` referencing the `Propósito` section of `create-plan` as the canonical narrative structure; skills citing the `<language_policy>` block of this artifact instead of redefining the language rule locally.
<!-- </sub_invocation_protocol> -->

<!-- <tag_naming> -->
## Tag naming conventions

There are no magic tags — Claude treats `<rules>` and `<my_rules>` the same. Consistency helps humans and programmatic parsers.

Recommended conventions:

- `snake_case` (e.g. `<routing_rules>`, `<cost_limits>`).
- Names that describe the **role** of the content, not its format (e.g. `<constraints>`, not `<bullet_list>`).
- Short names — 1-3 words. Long tags cost tokens twice (open + close).
- Project consistency. If `CLAUDE.md` uses `<rules>`, do not switch to `<instructions>` in a skill without reason.
<!-- </tag_naming> -->

<!-- <anti_patterns> -->
## Anti-patterns to avoid

**Over-wrapping**: Wrapping every paragraph in XML. Fragments reading and inflates tokens without benefit. XML is for section-level boundaries, not paragraph-level.

```xml
<!-- BAD -->
<paragraph_1>Use const by default.</paragraph_1>

<!-- GOOD -->
<rules>
Use `const` by default. Prefer named exports.
</rules>
```

**Markdown-only on long multi-concern artifacts**: Relying only on `##` in 2000+ token documents with distinct areas (persona, rules, context, examples). Risk of bleeding between sections.

**XML-only without Markdown**: Everything in nested XML without Markdown formatting. Hard to maintain; does not use light hierarchy.

**Deeply nested XML**: Three or more levels (`<a><b><c>`). Restructure into sibling level-1 blocks or merge inner content into Markdown.

**Inconsistent boundaries**: XML on some top-level sections and only `##` on others at the same structural level. Pick one mechanism per level and apply it uniformly.

**Raw XML tags in `.md` files**: Writing `<tag>` directly in a `.md` file outside a code block breaks Markdown rendering. Use HTML comments (`<!-- <tag> -->`) instead.
<!-- </anti_patterns> -->

<!-- <token_cost> -->
## Token cost analysis

Each XML tag pair costs roughly 2-4 tokens. The HTML comment wrapper (`<!-- -->`) adds ~4 tokens per boundary. A well-structured artifact with 15-20 XML sections adds ~120-160 tokens of overhead in `.md` files. In practice this is negligible because:

- System prompts and skills are often **cached** on the API; overhead is paid once and amortized across the session.
- Improved instruction compliance offsets the marginal cost.
- Real waste comes from over-wrapping, not from well-placed section-level XML.

In cost-sensitive slots (light router), minimal XML — 2-3 critical boundaries. In complex artifacts (e.g. main `CLAUDE.md`), liberal XML per distinct concern.
<!-- </token_cost> -->

<!-- <decision_checklist> -->
## Decision checklist

When structuring a block, run through this sequence:

1. Must the block be treated as an atomic unit the model activates, skips, or that code injects/replaces? → **Level 1 XML tag**.
2. Inside the block, is there a sub-block of a different nature or separately referenceable? → **Level 3 nested XML** (infrequent).
3. Everything else inside the block? → **Level 2 Markdown headings, lists, and prose**.
4. Is this artifact a `.md` file? → Wrap all XML boundaries in HTML comments (`<!-- <tag> -->`). Otherwise use raw XML.

If the whole document is short (< ~500 tokens), linear, and without distinct concerns, plain Markdown without XML is fine. Do not add XML by ritual.
<!-- </decision_checklist> -->

<!-- <artifact_reference> -->
## Quick reference for Claude Code artifacts

| Artifact | Typical structure | Language |
|---|---|---|
| **All `.claude/` artifacts** | See `<language_policy>` above | Instructions: English; user I/O: Spanish |
| **CLAUDE.md** | Level 1 XML per concern (persona, rules, context, constraints). Markdown inside each block. | Per project root policy |
| **SKILL.md** | Mostly Markdown. XML only for output templates, constraints, or schemas with a hard boundary. | EN body; `<constraints>` for ES output |
| **Slash command** | Markdown if short. XML if mixing instructions with dynamic injection points or multiple concerns. | EN body; ES user communication |
| **Rule file (.mdc)** | Level 1 XML in the body if there are several distinct sections. Markdown if a single concern. | Per project root policy |
| **Hook payload** | XML on blocks the hook replaces dynamically. Markdown inside. | Usually English |
| **System prompt (API)** | Full hybrid pattern. Level 1 XML on each top-level concern. Markdown inside. | Context-dependent |

**XML syntax by context:**
- `.md` files (SKILL.md, commands, CLAUDE.md): `<!-- <tag_name> -->` ... `<!-- </tag_name> -->` — HTML comments preserve semantic structure without breaking Markdown rendering.
- Non-Markdown (API strings, JSON/YAML payloads, hook configs): raw `<tag_name>` ... `</tag_name>`.

**Composition between skills:** see `<sub_invocation_protocol>` above — two patterns (invocation with result consumption; shared canonical reference) and the contract for the sub-invocation pattern.
<!-- </artifact_reference> -->
