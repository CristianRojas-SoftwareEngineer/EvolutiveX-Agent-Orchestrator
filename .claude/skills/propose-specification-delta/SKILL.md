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
   `ready` artifact, and hand control back to the orchestrator.
<!-- </workflow> -->

<!-- <constraints> -->
- Never embed writing prose in this skill — the schema is the single source of truth.
- Never create specs, design, or tasks here.
- Write to `resolvedOutputPath` from the instructions JSON; the resemantic
  `outputPath` is only a pattern (see the `#contrato-cli` section of
  `docs/specification-delta-workflow.md`).
- `context`/`rules` are constraints for you, never content for the artifact.
<!-- </constraints> -->
