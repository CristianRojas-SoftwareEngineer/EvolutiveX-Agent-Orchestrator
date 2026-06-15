---
name: define-specification-delta
description: >
  Stage 4 of the specification-delta pipeline. Thin wrapper that writes the delta
  specs (the WHAT) under specs/**/*.md. Delegates all writing guidance and glob
  iteration to the schema via openspec instructions specs --change <name> --json and
  writes to resolvedOutputPath. Declares the legacy to retire as REMOVED requirements.
  Invoked only by orchestrate-specification-delta.
when_to_use: >
  Used by orchestrate-specification-delta after proposal.md, to write the delta specs.
  Not a standalone entry point.
argument-hint: "[--change <name>]"
---

# Define Specification-Delta

<!-- <overview> -->
Stage 4 (mutates state). Single responsibility: write the delta specs
(`specs/**/*.md`, the WHAT) for the current delta — the contract layer. Do not write
any other artifact. This is a **thin wrapper** — the schema owns the writing guidance
and the per-capability iteration.
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
   node_modules/.bin/openspec instructions specs --change "<name>" --json
   ```
   The JSON returns `instruction`, `template`, `context`, `rules`, `dependencies`,
   and `resolvedOutputPath` (a glob, `specs/**/*.md`, resolved under the change dir).
2. Read the proposal's Capabilities section (a dependency) for context. Follow what
   the instructions return for the per-capability iteration — **delegate the glob
   iteration entirely** to the schema; do not embed capability-by-capability logic
   here. Write one spec file per capability at the path the schema's `instruction`
   and the resolved glob dictate (a concrete `specs/<capability>/spec.md`).
3. Re-run `openspec status --change "<name>" --json`, report completion and the next
   `ready` artifact, and hand control back to the orchestrator.

## Legacy declared a priori

This is the **first link** of the legacy-remediation threading (define → design →
plan → apply). Declare every behavior/contract being replaced as a **REMOVED**
requirement, each with `**Reason**` and `**Migration**` (per the schema's delta-spec
rules). `design` will then plan the migration/retirement strategy and `plan` the
cleanup tasks. Do not invent cleanup beyond what the change actually replaces.
<!-- </workflow> -->

<!-- <constraints> -->
- Never embed writing prose or capability-iteration logic — the schema owns both.
- Never create proposal, design, or tasks here.
- Write to `resolvedOutputPath` from the instructions JSON; never the bare
  `outputPath` pattern.
- `context`/`rules` are constraints for you, never content for the artifact.
<!-- </constraints> -->
