---
name: design-specification-delta
description: >
  Stage 5 of the specification-delta pipeline. Thin wrapper that writes design.md
  (the HOW). Delegates all writing guidance to the schema via openspec instructions
  design --change <name> --json and writes to resolvedOutputPath. Includes the
  migration/retirement strategy for the legacy declared REMOVED in define. Invoked
  only by orchestrate-specification-delta.
when_to_use: >
  Used by orchestrate-specification-delta after the delta specs, to write design.md.
  Not a standalone entry point.
argument-hint: "[--change <name>]"
---

# Design Specification-Delta

<!-- <overview> -->
Stage 5 (mutates state). Single responsibility: write `design.md` (the HOW) for the
current delta. Do not write any other artifact. This is a **thin wrapper** — the
schema owns the writing guidance. The linear DAG guarantees this runs against closed
`specs` (`design requires [proposal, specs]`).
<!-- </overview> -->

<!-- <user_communication> -->
Ask, confirm, and respond to the user in **Spanish**. Keep this skill's instructions
in **English** for token efficiency. Canonical policy: `<language_policy>` in
[artifact-structuring](../artifact-structuring/SKILL.md). User-facing rules:
[AGENTS.md](../../../AGENTS.md) §0.
<!-- </user_communication> -->

<!-- <workflow> -->
1. Get the enriched writing instruction from the schema:
   ```bash
   node_modules/.bin/openspec instructions design --change "<name>" --json
   ```
   The JSON returns `instruction`, `template`, `context`, `rules`, `dependencies`,
   and `resolvedOutputPath`.
2. Read the proposal and the delta specs (dependencies) for context.
3. **Resolve open decisions before writing.** After reading the dependencies, identify
   every architectural or design choice that has more than one viable approach and
   cannot be decided unilaterally (e.g. data-access pattern, layer placement, caching
   strategy, API contract shape). If any such decisions exist, sub-invoke
   [resolve-open-decisions](../resolve-open-decisions/SKILL.md) (Pattern A of
   `artifact-structuring`) before writing a single line of `design.md`. Pass the list
   of open decisions with their candidate options and the active change name. Receive
   the resolved decisions as a hand-off and incorporate them into the design.
4. Follow `instruction` and `template` exactly to write the design, and write it to
   **`resolvedOutputPath`**. Apply `context`/`rules` as constraints; never copy them
   into the file. Reflect the resolved decisions; do not re-open them.
5. Re-run `openspec status --change "<name>" --json`, report completion and the next
   `ready` artifact inline; the orchestrator resolves and invokes the next stage in the
   same turn.

## Legacy migration strategy

This is the **second link** of the legacy-remediation threading. For every
requirement `define` declared **REMOVED**, design the migration/retirement strategy
here (how the replaced code/doc is migrated and retired). `plan` will turn this into
concrete cleanup tasks.
<!-- </workflow> -->

<!-- <constraints> -->
- Artifact content (proposal/specs/design/tasks) MUST be written in **Spanish** per
  the `<language_policy>` of [artifact-structuring](../artifact-structuring/SKILL.md)
  and AGENTS.md §0. Technical terms (skill, gate, sentinel, handoff, etc.) remain in
  English when translation adds ambiguity.
- Never embed writing prose in this skill — the schema is the single source of truth.
- Never create proposal, specs, or tasks here.
- Write to `resolvedOutputPath` from the instructions JSON; never the bare
  `outputPath` pattern.
- `context`/`rules` are constraints for you, never content for the artifact.
- Open design decisions must be resolved via `resolve-open-decisions` **before**
  writing `design.md` — never inline a "¿A o B?" question or resolve a choice
  unilaterally.
<!-- </constraints> -->
