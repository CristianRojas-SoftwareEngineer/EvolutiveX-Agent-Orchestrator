---
name: synchronize-specification-delta
description: >
  Stage 9 of the specification-delta pipeline. Synchronizes canonical state: merges
  the delta specs into openspec/specs/ AND updates repo documentation (README.md,
  docs/) to reflect the real post-change state. Locates delta specs via the status
  JSON. Does not archive. Invoked only by orchestrate-specification-delta.
when_to_use: >
  Used by orchestrate-specification-delta after the verify gate passes, to bring
  canonical state up to date before archive. Not a standalone entry point.
argument-hint: "[--change <name>]"
---

# Synchronize Specification-Delta

<!-- <overview> -->
Stage 9 (mutates state). Single responsibility (concern: keep canonical state
coherent): merge the delta specs into `openspec/specs/` **and** update the repo's
documentation (`README.md`, `docs/`) so it reflects reality after the change. Both
tasks belong to one concern by documentary integrity. It does **not** archive.
<!-- </overview> -->

<!-- <user_communication> -->
Ask, confirm, and respond to the user in **Spanish**. Keep this skill's instructions
in **English** for token efficiency. Canonical policy: `<language_policy>` in
[artifact-structuring](../artifact-structuring/SKILL.md). User-facing rules:
[AGENTS.md](../../../AGENTS.md) §0.
<!-- </user_communication> -->

<!-- <workflow> -->
## Part A — Merge delta specs into openspec/specs/

Locate the delta specs via the status JSON, not a fixed path:

```bash
node_modules/.bin/openspec status --change "<name>" --json
```

Read `artifactPaths.specs.existingOutputPaths` for the concrete delta-spec files. If
empty, log that there is nothing to merge and continue to Part B.

This is an **agent-driven** merge (intelligent, partial). For each capability with a
delta spec:

- Read the delta spec (sections `## ADDED`, `## MODIFIED`, `## REMOVED`,
  `## RENAMED`).
- Read the main spec at `openspec/specs/<capability>/spec.md` (create it if missing).
- Apply changes intelligently: **ADDED** → add (or update if already present);
  **MODIFIED** → apply the change, preserving scenarios not mentioned in the delta;
  **REMOVED** → remove the requirement block; **RENAMED** → rename FROM → TO.

The merge is idempotent: running it twice yields the same result. The delta
represents *intent*, not a wholesale replacement.

## Part B — Update repo documentation (docs sub-plan)

Bring `README.md` and `docs/` in line with the real post-change state: synchronize the
project documentation so it reflects what the change actually built. Build a candidate
list from the proposal's
Impact section plus a grep of `docs/`/`README.md` for terms touched by the change.
For each candidate, classify the gap (false «done», stale/contradictory, missing
update) and **edit existing docs only** — per AGENTS.md §3, do not create new files
under `docs/` without explicit approval; surface the need instead. Quote the changed
lines for the user.

## Close

Report the capabilities updated and the docs edited; state that the change remains
**active** (sync does not archive). The canonical state is now coherent — the
precondition for `archive` (stage 10). Hand control back to the orchestrator.
<!-- </workflow> -->

<!-- <constraints> -->
- Locate delta specs via `artifactPaths.specs.existingOutputPaths`, never a hardcoded
  path.
- The spec merge must be idempotent; preserve content not mentioned in the delta.
- Edit existing docs only; do not create files under `docs/` without explicit
  approval (AGENTS.md §3).
- **Never archive here** — that is stage 10's concern. This stage and `archive` never
  embed each other.
<!-- </constraints> -->
