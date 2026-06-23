---
name: archive-specification-delta
description: >
  Stage 10 of the specification-delta pipeline. Freezes the delta: moves it to
  openspec/changes/archive/, emits the conventional commit, and leaves a clean
  worktree. Derives the archive path from planningHome.changesDir and applies the
  workspace guard. Does NOT spec-sync (that was stage 9). Invoked only by
  orchestrate-specification-delta.
when_to_use: >
  Used by orchestrate-specification-delta as the final stage, after synchronize, to
  freeze the verified and synchronized delta. Not a standalone entry point.
argument-hint: "[--change <name>]"
---

# Archive Specification-Delta

<!-- <overview> -->
Stage 10 (mutates state). Single responsibility (concern: freeze the delta): move the
delta to `archive/`, emit the conventional commit, and leave the worktree clean. The
commit + clean worktree are part of the freeze concern, not embedded stages. Unlike
native `archive`, it does **not** spec-sync — that was the mandatory stage 9.
<!-- </overview> -->

<!-- <user_communication> -->
Ask, confirm, and respond to the user in **Spanish**. Keep this skill's instructions
in **English** for token efficiency. Canonical policy: `<language_policy>` in
[artifact-structuring](../artifact-structuring/SKILL.md). User-facing rules:
[AGENTS.md](../../../AGENTS.md) §0.
<!-- </user_communication> -->

<!-- <workflow> -->
## Step 1 — Read status and apply the workspace guard

```bash
node_modules/.bin/openspec status --change "<name>" --json
```

Read `planningHome.changesDir` (the canonical changes base) and `actionContext`.
**Workspace guard**: if `actionContext.mode == "workspace-planning"` and
`allowedEditRoots` is empty, **stop** — archiving is not supported in that mode.

Optionally confirm artifacts are `done` and tasks are `- [x]` (the verify gate
already enforced this; surface, don't block, on residual warnings).

## Step 2 — Move the delta to archive

Derive the archive directory from `planningHome.changesDir` (never hardcode
`openspec/changes/archive`). Target name: `YYYY-MM-DD--<change-name>` (today's date,
**double hyphen** before the change name).

```bash
mkdir -p "<changesDir>/archive"
mv "<changesDir>/<name>" "<changesDir>/archive/YYYY-MM-DD--<name>"
```

On Windows, if `mv` fails with `Permission denied`, use instead:

```powershell
powershell -Command "Move-Item -Path '<changesDir>/<name>' -Destination '<changesDir>/archive/YYYY-MM-DD--<name>'"
```

**Post-mv verification (mandatory before Step 3):**

```bash
test -d "<changesDir>/archive/YYYY-MM-DD--<name>"
test ! -d "<changesDir>/<name>"
```

If either check fails → CRITICAL: the move did not complete — do not proceed to
Step 3, report the failure and the fallback command above.

If the target already exists, stop with an error (suggest a different date or
renaming the existing archive). `.openspec.yaml` moves with the directory.

## Step 3 — Conventional commit (freeze)

Compose the commit per [conventional-commits](../conventional-commits/SKILL.md):
deterministic `type(scope)` from the change name and the proposal's Impact; a Spanish
body with the three mandatory blocks (**Propósito**, **Objetivos**, **Resumen de
cambios**). The working tree at this point holds the code changes, the synced
`openspec/specs/`, the doc edits (from stage 9), and the new archive directory.

```bash
git add -A
git commit -F - <<'EOF'
<message>
EOF
```

## Step 4 — Confirm a clean worktree

Verify `git status --short` is clean (the freeze is complete). Report the change name,
the archive location, and the commit hash inline; this is stage 10, the pipeline's
terminal stage — the AUTO run is now complete.
<!-- </workflow> -->

<!-- <constraints> -->
- **Never spec-sync here** — stage 9 (`synchronize`) owns that concern; the two
  stages never embed each other.
- Derive the archive path from `planningHome.changesDir`, never a hardcoded path.
- Honor the workspace guard: stop on `workspace-planning` with empty
  `allowedEditRoots`.
- The commit body is in Spanish with the three conventional-commits blocks; first line
  ≤72 chars, imperative, no trailing period.
- Leave the worktree clean — an unclean tree means the freeze is incomplete.
- After Step 2, the target directory must exist and the source directory must be
  absent before Step 3 runs. A failed `mv` is CRITICAL — never commit without
  confirming the move succeeded.
<!-- </constraints> -->
