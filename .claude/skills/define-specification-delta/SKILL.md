---
name: define-specification-delta
description: >
  Stage 4 of the specification-delta pipeline. Thin wrapper that writes the delta
  specs (the WHAT) under specs/**/*.md. Delegates the per-capability writing format to
  the schema via openspec instructions specs --change <name> --json and writes to
  resolvedOutputPath. Branches by the delta class declared in the proposal:
  *behavioral* → one delta-spec per capability (REMOVED/MODIFIED casings against
  openspec/specs/); *non-canonical* (`### Non-canonical change`) → a non-canonical
  record under specs/<area>/spec.md (retirements or additions) with no
  `## ADDED/MODIFIED/REMOVED/RENAMED` headers. specs/ is never empty in either case.
  Enforces completion via
  openspec:verify-stage-completion before returning. Invoked only by
  orchestrate-specification-delta.
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
2. Read the proposal's Capabilities section (a dependency); it declares the delta's
   **class**. Branch the write accordingly — `specs/` is **never** empty either way:
   - **Behavioral** (New/Modified Capabilities): write one delta-spec per capability at
     `specs/<capability>/spec.md` with ≥1 requirement (ADDED/MODIFIED/REMOVED/RENAMED).
     Every `REMOVED`/`MODIFIED` requirement, and every `RENAMED` FROM, MUST match a
     requirement that exists in `openspec/specs/<capability>/spec.md` (with `**Reason**`
     and `**Migration**`) — never an orphan REMOVED for code that was never canonical.
   - **Non-canonical** (`### Non-canonical change`): write a non-canonical *record* at
     `specs/<area>/spec.md` under a `## Non-canonical record` section documenting the
     non-canonical items in prose (retirements OR additions such as test suites/tooling),
     with NO `## ADDED/MODIFIED/REMOVED/RENAMED` headers (so `synchronize` never promotes
     it to the canon).
   Follow the schema's `instruction` for the per-class writing format; the proposal's
   Capabilities — not the model's discretion — determine which files exist and their form.
3. Run the completion gate as a hard check before returning control:
   ```bash
   npm run openspec:verify-stage-completion -- --change "<name>" --through specs
   ```
   A non-zero exit is a **hard block**: it names the missing/empty spec or the broken
   proposal↔specs parity. Fix the specs and re-run until it exits zero; do not report
   completion while it fails.
4. Re-run `openspec status --change "<name>" --json`, report completion and the next
   `ready` artifact inline; the orchestrator resolves and invokes the next stage in the
   same turn.

## Legacy declared a priori

This is the **first link** of the legacy-remediation threading (define → design →
plan → apply). Declare every *canonical* behavior/contract being replaced as a
**REMOVED**/**MODIFIED** requirement that casts against a requirement existing in
`openspec/specs/`, each with `**Reason**` and `**Migration**` (per the schema's delta-
spec rules). A *non-canonical* change (retiring dead code OR adding tests/tooling with no
canonical counterpart) is NOT a REMOVED requirement — it is an entry in the non-canonical
record branch. `design` will then plan the migration/retirement strategy and `plan` the
tasks. Do not invent cleanup beyond what the change actually replaces.
<!-- </workflow> -->

<!-- <constraints> -->
- Never embed writing prose — the schema owns the per-capability writing format.
- Never leave `specs/` empty and never skip a capability declared in the proposal;
  cover behavioral capabilities with ≥1 requirement (ADDED/MODIFIED/REMOVED/RENAMED,
  every REMOVED/MODIFIED/RENAMED-FROM casings against `openspec/specs/`), and cover
  non-canonical changes (retirements or additions) with a non-canonical record (no
  operation headers).
- Never declare a `REMOVED`/`MODIFIED` requirement whose name does not exist in
  `openspec/specs/<cap>/spec.md` (no orphan REMOVED).
- Never return control while `openspec:verify-stage-completion --through specs` exits
  non-zero.
- Never create proposal, design, or tasks here.
- Write to `resolvedOutputPath` from the instructions JSON; never the bare
  `outputPath` pattern.
- `context`/`rules` are constraints for you, never content for the artifact.
<!-- </constraints> -->
