---
name: propose-specification-delta
description: >
  Stage 3 of the specification-delta pipeline. Thin wrapper that writes the
  proposal.md artifact (the WHY). Delegates all writing guidance to the schema via
  openspec instructions proposal --change <name> --json and writes to
  resolvedOutputPath. Never embeds writing prose. Invoked only by
  orchestrate-specification-delta.
when_to_use: >
  Used by orchestrate-specification-delta after the delta is created, to write
  proposal.md. Not a standalone entry point.
argument-hint: "[--change <name>]"
---

# Propose Specification-Delta

<!-- <overview> -->
Stage 3 (mutates state). Single responsibility: write `proposal.md` (the WHY) for the
current delta. Do not write any other artifact; do not implement, verify, or sync.
This is a **thin wrapper** — the schema owns the writing guidance.
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
   node_modules/.bin/openspec instructions proposal --change "<name>" --json
   ```
   The JSON returns `instruction` (schema guidance), `template` (the output
   structure), `context` and `rules` (constraints for you, **not** content for the
   file), `dependencies` (completed artifacts to read for context), and
   `resolvedOutputPath` (where to write).
2. Read any completed dependency files for context. Follow `instruction` and
   `template` exactly to write the proposal, and write it to **`resolvedOutputPath`**
   (never to the bare `outputPath` pattern). Apply `context`/`rules` as constraints;
   never copy them into the file.
3. Re-run `openspec status --change "<name>" --json`, report completion and the next
   `ready` artifact inline; the orchestrator resolves and invokes the next stage in the
   same turn.

## Capabilities parity (mandatory)

The Capabilities section is the contract `define` must fulfill, and it declares the delta's
**structural class**: a delta is EITHER *behavioral* OR *non-canonical*, never both. Route
each What Changes item accordingly:

- Touches agreed/canonical behavior (adds, modifies, or removes a requirement that exists
  in `openspec/specs/`) → a **New** or **Modified** capability (behavioral delta).
- Has no canonical counterpart — whether it *retires* dead code (files, reference trees,
  zombies) or *adds* non-canonical artifacts (integration tests, tooling, CI scripts) with
  no requirement in `openspec/specs/` → an entry under **### Non-canonical change**
  (non-canonical delta).

A `REMOVED`/`MODIFIED` capability MUST have a counterpart requirement in
`openspec/specs/<cap>/spec.md`; never declare one for code that was never canonical — that
is a non-canonical item, not a `REMOVED`. Declaring "none"/«ninguna» across all subsections
while What Changes lists changes is **prohibited** (it strands `define`), and so is
declaring both classes at once. `openspec:verify-stage-completion` (run downstream) hard-
blocks every one of these.
<!-- </workflow> -->

<!-- <constraints> -->
- Artifact content (proposal/specs/design/tasks) MUST be written in **Spanish** per
  the `<language_policy>` of [artifact-structuring](../artifact-structuring/SKILL.md)
  and AGENTS.md §0. Technical terms (skill, gate, sentinel, handoff, etc.) remain in
  English when translation adds ambiguity.
- Never embed writing prose in this skill — the schema is the single source of truth.
- Never create specs, design, or tasks here.
- Write to `resolvedOutputPath` from the instructions JSON; the resemantic
  `outputPath` is only a pattern (see the `#contrato-cli` section of
  `docs/specification-delta-workflow.md`).
- `context`/`rules` are constraints for you, never content for the artifact.
<!-- </constraints> -->
