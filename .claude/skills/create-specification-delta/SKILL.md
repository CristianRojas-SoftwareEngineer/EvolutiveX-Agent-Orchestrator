---
name: create-specification-delta
description: >
  Stage 2 of the specification-delta pipeline. Materializes the delta: derives the
  incremental identifier c<NNNNN>-<slug> by stateless scan, then wraps the native
  openspec new change command to scaffold openspec/changes/<name>/ with .openspec.yaml.
  This is the only stage where the numeric id is minted. Invoked only by
  orchestrate-specification-delta.
when_to_use: >
  Used by orchestrate-specification-delta to initialize a new delta after explore.
  Not a standalone entry point.
argument-hint: "[slug] [--change <name>]"
---

# Create Specification-Delta

<!-- <overview> -->
Stage 2 (mutates state). Single responsibility: derive the incremental change id and
scaffold the change folder. This is the **only** stage where the name
`c<NNNNN>-<slug>` is minted; every other stage operates on the full name via
`--change`. It writes no planning artifacts.
<!-- </overview> -->

<!-- <user_communication> -->
Ask, confirm, and respond to the user in **Spanish**. Keep this skill's instructions
in **English** for token efficiency. Canonical policy: `<language_policy>` in
[artifact-structuring](../artifact-structuring/SKILL.md). User-facing rules:
[AGENTS.md](../../../AGENTS.md) §0.
<!-- </user_communication> -->

<!-- <workflow> -->
**Input**: a descriptive kebab-case `slug` (from explore or the orchestrator). If
absent or unclear, ask the user what the delta is about and derive a slug (e.g.
"add user authentication" → `add-user-auth`).

## Step 1 — Derive the incremental id (stateless scan)

The change name has the form `c<NNNNN>-<slug>`: a mandatory lowercase `c` prefix +
an incremental integer zero-padded to **5 digits** + the kebab-case slug. The `c`
prefix is required because OpenSpec rejects names that start with a digit or contain
uppercase (`validateChangeName`).

Derive the next integer by scanning, with no persistent counter:

1. List active change directories under `openspec/changes/` (exclude `archive/` and
   `.gitkeep`).
2. List archived directories under `openspec/changes/archive/`, discounting the
   `YYYY-MM-DD-` date prefix the archive step adds.
3. From every name, extract the head integer matching `^c(\d+)`.
4. Take the maximum (0 if none exists) and add one.
5. Zero-pad to 5 digits → `c<NNNNN>`. Compose `c<NNNNN>-<slug>`.

The same rule applies to all changes, including the L1/L2 changes of a roadmap (where
the `phaseid` lives inside the slug: `c<NNNNN>-<prefix>-<phaseid>-<slug>`).

## Step 2 — Scaffold via the native command

Wrap the native command (`new` is a group whose only subcommand is `change`):

```bash
node_modules/.bin/openspec new change "c<NNNNN>-<slug>"
```

This creates `openspec/changes/c<NNNNN>-<slug>/` with `.openspec.yaml` using the
active schema (`sequential-spec-driven-design` from `openspec/config.yaml`).

## Step 3 — Confirm via the status JSON

```bash
node_modules/.bin/openspec status --change "c<NNNNN>-<slug>" --json
```

Use `planningHome`, `changeRoot`, `artifactPaths`, and `nextSteps` from the JSON —
never assume `openspec/changes/<name>/`. Report the minted name, location, the schema
and its artifact sequence, and the first `ready` artifact. Hand control back to the
orchestrator.
<!-- </workflow> -->

<!-- <constraints> -->
- Mint the id **only here**; never re-derive numbering in other stages.
- The `c` prefix is mandatory and lowercase; the integer is zero-padded to 5 digits.
- Scaffold strictly via `openspec new change`; do not hand-create the folder.
- Do not create any planning artifact (proposal/specs/design/tasks) here.
- If a change with the derived name already exists, re-scan — do not overwrite.
<!-- </constraints> -->
