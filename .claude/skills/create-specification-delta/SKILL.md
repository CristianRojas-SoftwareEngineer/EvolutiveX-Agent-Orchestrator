---
name: create-specification-delta
description: >
  Stage 2 of the specification-delta pipeline. Materializes the delta: derives the
  incremental identifier c<NNNNN>-<slug> by stateless scan, then runs the canonical
  create script to scaffold openspec/changes/<name>/ with enriched .openspec.yaml.
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

## Step 1 — Derive the incremental id (canonical script)

The change name has the form `c<NNNNN>-<slug>`: a mandatory lowercase `c` prefix +
an incremental integer zero-padded to **5 digits** + the kebab-case slug. The `c`
prefix is required because OpenSpec rejects names that start with a digit or contain
uppercase (`validateChangeName`).

**You MUST NOT reimplement the scan inline.** Derive `c<NNNNN>` exclusively from the
canonical script:

```bash
npm run openspec:next-change-id
```

Stdout is exactly one line (`c<NNNNN>`). Compose `c<NNNNN>-<slug>` with the slug from
explore. Implementation lives in `scripting/openspec/change-id.ts`.

### Algorithm (reference pseudocode)

The script implements this scan — documented here so agents understand the contract:

```
function stripArchiveDatePrefix(name):
  if name matches ^\d{4}-\d{2}-\d{2}--(.+)$ → return capture group 1
  else → return name

function parseNumericId(name):
  normalized = stripArchiveDatePrefix(name)
  if normalized matches ^c(\d+) → return integer
  else → return null   // nombres sin prefijo c no participan en el incremento

maxId = 0
for dir in active_dirs(openspec/changes/) excluding archive/ and .gitkeep:
  maxId = max(maxId, parseNumericId(dir) ?? 0)
for dir in dirs(openspec/changes/archive/):
  maxId = max(maxId, parseNumericId(dir) ?? 0)
for dir in dirs(openspec/changes/archive/*/phases/) with date-prefixed names:
  maxId = max(maxId, parseNumericId(dir) ?? 0)
return "c" + zero_pad(maxId + 1, 5)
```

### Counterexample — why date normalization is mandatory

Archived folder: `2026-06-16--c00068-fix-change-id-increment`

- **Wrong** (naive `^c(\d+)` on raw name): no match → max stays 0 → next id `c00001`
  again → **collision** with the existing `c00001-*` delta.
- **Correct**: strip date → `c00068-fix-change-id-increment` → id `68` → next `c00069`.

The same rule applies to all changes, including the L1/L2 changes of a roadmap (where
the `phaseid` lives inside the slug: `c<NNNNN>-<prefix>-<phaseid>-<slug>`).

## Step 2 — Scaffold via the canonical script

```bash
npm run openspec:create-specification-delta -- --slug "<slug>"
```

Stdout is the minted change name (`c<NNNNN>-<slug>`). The script derives the id
internally via `computeNextChangeId`, writes `.openspec.yaml` (schema, created, title,
status, updated), `conversation.md` stub, and gates on `openspec status --change … --json`.

Optional: `--title "<human title>"`, `--json`, `--dry-run`.

## Step 3 — Confirm via the status JSON

```bash
node_modules/.bin/openspec status --change "c<NNNNN>-<slug>" --json
```

Use `planningHome`, `changeRoot`, `artifactPaths`, and `nextSteps` from the JSON —
never assume `openspec/changes/<name>/`. Report the minted name, location, the schema
and its artifact sequence, and the first `ready` artifact. Report the result inline;
the orchestrator resolves and invokes the next stage in the same turn.
<!-- </workflow> -->

<!-- <constraints> -->
- Mint the id **only here**; never re-derive numbering in other stages.
- Derive `c<NNNNN>` **only** via `npm run openspec:next-change-id`; never scan inline.
- The `c` prefix is mandatory and lowercase; the integer is zero-padded to 5 digits.
- Scaffold strictly via `npm run openspec:create-specification-delta`; do not hand-create the folder or call `openspec new change`.
- Do not create any planning artifact (proposal/specs/design/tasks) here.
- If a change with the derived name already exists, re-scan — do not overwrite.
<!-- </constraints> -->
