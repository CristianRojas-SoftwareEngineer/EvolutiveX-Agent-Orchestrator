---
name: explore-specification-delta
description: >
  Stage 1 of the specification-delta pipeline. Frame the problem as a thinking
  partner — read, search, investigate, compare options — without implementing code
  or writing schema artifacts. Reads change context via openspec status --json.
  Escalates to a structured investigation by sub-invoking the investigate skill.
  Invoked only by orchestrate-specification-delta, never directly by the user.
when_to_use: >
  Used by orchestrate-specification-delta as the entry stage of a delta run, to
  explore ideas, clarify requirements, and frame the problem before the delta is
  created. Not a standalone entry point.
argument-hint: "[problem description] [--change <name>]"
---

# Explore Specification-Delta

<!-- <overview> -->
Stage 1 (read-only) of the fixed pipeline. A thinking partner that frames the
problem before a delta exists: read files, search code, compare options, surface
risks. This is a **stance, not a workflow** — no fixed steps, no mandatory output.
It never writes code and never writes schema artifacts (proposal/specs/design/tasks);
those belong to later stages.
<!-- </overview> -->

<!-- <user_communication> -->
Ask, confirm, and respond to the user in **Spanish**. Keep this skill's instructions
in **English** for token efficiency. Canonical policy: `<language_policy>` in
[artifact-structuring](../artifact-structuring/SKILL.md). User-facing rules:
[AGENTS.md](../../../AGENTS.md) §0.
<!-- </user_communication> -->

<!-- <workflow> -->
Enter explore mode. Think deeply, visualize freely (ASCII diagrams when they
clarify), follow the conversation where it goes.

**Input**: whatever the user wants to think about — a vague idea, a specific problem,
an existing change name to explore in context, or an options comparison.

## Read existing context

Check what already exists with the canonical JSON contract (never assume repo-local
paths):

```bash
node_modules/.bin/openspec list --json
```

If a change is named or relevant, read its artifacts via the status JSON, not by
guessing paths:

```bash
node_modules/.bin/openspec status --change "<name>" --json
```

Read the concrete files under `artifactPaths.<artifact>.existingOutputPaths`
(proposal, specs, design, tasks) to ground the conversation. Reference them
naturally; never auto-capture insights into artifacts.

## The stance

Curious not prescriptive; open threads not interrogations; visual; adaptive;
patient; grounded in the actual codebase. You might explore the problem space
(clarify, challenge assumptions, reframe), investigate the codebase (map
architecture, find integration points and patterns), compare options (tradeoff
tables, recommend a path if asked), or surface risks and unknowns.

## Structured investigation (optional, sub-invocation)

Exploration stays a posture, but some sessions benefit from a formal investigation.
Escalate to a sub-invocation of [investigate](../investigate/SKILL.md) when the work
needs examining multiple code sources with verifiable questions, the user brings a
recognizable maintenance problem (bug, quality improvement, risk, migration), or the
user explicitly asks for formal investigation. Do **not** escalate for light
discovery or conceptual option comparison.

Procedure when escalating:

1. Determine the maintenance profile per the determination rule in `investigate`
   `<maintenance_profiles>` (declared by the user, or inferred and confirmed). Do
   not duplicate its tables here.
2. Invoke `investigate` per the `<sub_invocation_protocol>` of
   [artifact-structuring](../artifact-structuring/SKILL.md), passing explicit
   context: the active change if one exists, prior findings, the determined profile,
   and the questions to answer.
3. Receive the report as a hand-off and continue exploring on top of its findings.

Capturing insights into OpenSpec artifacts is always a later, separate stage of the
pipeline (`create` onward) — never part of the sub-invocation.

## Resolving open decisions during exploration

Exploration may surface competing options where the user must choose a path before
the delta continues. When this happens, do **not** pose an inline "¿A o B?" question
in prose. Sub-invoke [resolve-open-decisions](../resolve-open-decisions/SKILL.md)
(Pattern A of `artifact-structuring`): pass the open decisions with their candidate
options, receive the resolved decisions as a hand-off, and continue exploration on
top of those choices. This respects the read-only nature of this stage — the skill
mutates nothing.

## Ending

There is no required ending. Discovery may flow toward creating a delta, or just
provide clarity. When things crystallize, optionally summarize the problem, the
approach (if one emerged), and open questions. Report the result inline; the
orchestrator resolves and invokes the next stage in the same turn.
<!-- </workflow> -->

<!-- <constraints> -->
- **Thinking, not implementing**: never write application code, and never write
  schema artifacts (proposal/specs/design/tasks) here — that is stages 3–6.
- During a sub-invocation of `investigate`, its read-only rules govern: zero
  mutations.
- Don't fake understanding, don't rush, don't force structure, don't auto-capture.
- Read change context only via `openspec status --json` / `artifactPaths`, never via
  assumed repo-local paths.
<!-- </constraints> -->
