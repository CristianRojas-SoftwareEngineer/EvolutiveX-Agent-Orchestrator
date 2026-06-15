---
name: plan-specification-delta
description: >
  Stage 6 of the specification-delta pipeline. Thin wrapper that writes tasks.md (the
  breakdown). Delegates all writing guidance to the schema via openspec instructions
  tasks --change <name> --json and writes to resolvedOutputPath. Includes the cleanup
  tasks that will execute the legacy retirement designed upstream. Invoked only by
  orchestrate-specification-delta.
when_to_use: >
  Used by orchestrate-specification-delta after design.md, to write tasks.md. Not a
  standalone entry point.
argument-hint: "[--change <name>]"
---

# Plan Specification-Delta

<!-- <overview> -->
Stage 6 (mutates state). Single responsibility: write `tasks.md` (the implementation
breakdown) for the current delta. Do not write any other artifact and do not
implement. This is a **thin wrapper** — the schema owns the writing guidance.
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
   node_modules/.bin/openspec instructions tasks --change "<name>" --json
   ```
   The JSON returns `instruction`, `template`, `context`, `rules`, `dependencies`,
   and `resolvedOutputPath`. The schema requires the exact `- [ ] X.Y description`
   checkbox format under `## numbered headings` — the apply stage parses it.
2. Read the proposal, specs, and design (dependencies) for context. Follow
   `instruction` and `template` exactly to write the task list, and write it to
   **`resolvedOutputPath`**. Apply `context`/`rules` as constraints; never copy them
   into the file.
3. Re-run `openspec status --change "<name>" --json`, report completion (the delta is
   now apply-ready), and hand control back to the orchestrator.

## Cleanup tasks

This is the **third link** of the legacy-remediation threading. Include explicit
cleanup tasks that will execute the retirement strategy designed in `design`
(removing or deprecating the replaced code/doc). `apply` only executes these tasks —
it never invents cleanup of its own.
<!-- </workflow> -->

<!-- <constraints> -->
- Never embed writing prose in this skill — the schema is the single source of truth.
- Never create proposal, specs, or design here; never implement.
- Write to `resolvedOutputPath` from the instructions JSON; never the bare
  `outputPath` pattern.
- `context`/`rules` are constraints for you, never content for the artifact.
<!-- </constraints> -->
