---
description: Testing workflows for project slash commands. Load when command-manager routes to testing reference.
---

# Command testing and evaluation

<!-- <<overview> -->
Workflows to validate project slash commands in Claude Code before closing an iteration.
<!-- </overview> -->

<!-- <<user_communication> -->
Ask, confirm, and respond to the user in **Spanish** (native Spanish-speaking audience). Keep this artifact's instructions in **English** for token efficiency. Canonical policy: `<language_policy>` in [.claude/skills/artifact-structuring/SKILL.md](../../artifact-structuring/SKILL.md). User-facing rules: [AGENTS.md](../../../../AGENTS.md) §0.
<!-- </user_communication> -->

<!-- <<methods_matrix> -->
## Methods matrix

| Method | How | When to use |
|--------|------|----------------|
| **Direct invocation** | `/command-name` or `/command-name arg1 arg2` | Verify the instruction body runs correctly |
| **Baseline** | Same request without invoking the command | Compare quality with/without command |
| **Objective verification** | Check files, exit codes, or diffs the command promises | Deterministic outputs (codegen, validation, extraction) |

Commands do **not** support skill-catalog auto-trigger tests. If that is required, migrate to a skill and use [skill-manager/references/testing-workflows.md](../../skill-manager/references/testing-workflows.md).
<!-- </methods_matrix> -->

<!-- <<qualitative_flow> -->
## Recommended flow (qualitative)

1. Draft 2–3 realistic prompts (as a user would say them, or as `/name` invocations with args).
2. Confirm with the user **in Spanish** that cases cover the scope.
3. Run each case **with** the command (`/command-name`).
4. Run the same case **without** the command (baseline).
5. Present both results to the user in Spanish.
6. Collect feedback and iterate the `.md` file.
7. Repeat until satisfied or stalled.

If the user prefers to iterate without formal evaluation, adapt; do not force the full matrix.
<!-- </qualitative_flow> -->

<!-- <<traceability> -->
## Optional traceability

Commands do not have a standard `TEST-CASES.md` location. If the team wants documented cases:

- Keep a short checklist in the command body under a `## Test notes` section, or
- After migrating to a skill, use `.claude/skills/<name>/TEST-CASES.md` per skill-manager.
<!-- </traceability> -->

<!-- <<version_comparison> -->
## Version comparison (optional)

If the user asks whether the new version is better:

1. Same prompts with previous version (git stash or temporary copy).
2. Same prompts with new version.
3. Present outputs side by side.
4. Incorporate findings in the next command revision.
<!-- </version_comparison> -->

<!-- <<meta_testing> -->
## Testing command-manager (meta)

| Test prompt | Expected behavior |
|------------------|-------------------------|
| "Create a command for X" | `<creation_process>`; read `command-skeleton.md`; link `artifact-structuring` |
| "Refine command analyze-session" | `<refinement_planning>`; plan in Spanish; no file edits unless user asks |
| "Create a skill for Y" | Route to `/skill-manager`; do not load command references |
| "Optimize argument-hint for my command" | `<menu_metadata_optimization>` |

Direct invocation: `/command-manager`.
<!-- </meta_testing> -->

<!-- <<verification> -->
## Checklist before closing an iteration

- [ ] Cases run with command active (`/name`)
- [ ] Baseline run for at least one representative case
- [ ] Results presented to the user
- [ ] Feedback incorporated or open items documented
- [ ] User offered skill migration if command exceeded ~100 lines or needs bundled files
<!-- </verification> -->
