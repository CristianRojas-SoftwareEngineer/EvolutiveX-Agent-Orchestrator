---
description: Testing and validation workflows for project skills (TEST-CASES, fork context). Load when skill-manager routes to testing reference.
---

# Skill testing and evaluation

<!-- <<overview> -->
Workflows to validate project skills in Claude Code before closing an iteration.
<!-- </overview> -->

<!-- <<user_communication> -->
Ask, confirm, and respond to the user in **Spanish** (native Spanish-speaking audience). Keep this artifact's instructions in **English** for token efficiency. Canonical policy: `<language_policy>` in [.claude/skills/artifact-structuring/SKILL.md](../../artifact-structuring/SKILL.md). User-facing rules: [AGENTS.md](../../../../AGENTS.md) §0.
<!-- </user_communication> -->

<!-- <<methods_matrix> -->
## Methods matrix

| Method | How | When to use |
|--------|------|----------------|
| **Direct invocation** | `/skill-name` or `/skill-name arg1 arg2` | Verify the instruction body runs correctly |
| **Auto-trigger** | Natural prompt aligned with `description` | Validate Claude loads the skill without `/` |
| **Baseline** | Same request without invoking the skill | Compare quality with/without skill |
| **Isolation** | Test skill with `context: fork` + `agent: Explore` | Evaluate without chat history noise |
| **Objective verification** | Script in `scripts/` + check output/files | Deterministic outputs (transformations, extraction, codegen) |
<!-- </methods_matrix> -->

<!-- <<qualitative_flow> -->
## Recommended flow (qualitative)

1. Draft 2–3 realistic prompts (as a user would say them).
2. Confirm with the user **in Spanish** that cases cover the scope.
3. Run each case **with** the skill (`/skill-name` or natural trigger).
4. Run the same case **without** the skill (baseline).
5. Present both results to the user in Spanish.
6. Collect feedback and document in `TEST-CASES.md` if applicable.
7. Iterate SKILL.md and repeat.

If the user prefers to iterate without formal evaluation, adapt; do not force the full matrix.
<!-- </qualitative_flow> -->

<!-- <<test_cases_template> -->
## TEST-CASES.md template

Save in `.claude/skills/<skill-name>/TEST-CASES.md` when the skill has verifiable behavior or the team wants traceability.

```markdown
# Test cases — <skill-name>

## Test 1
**Prompt:** ...
**Invocation:** /skill-name | auto-trigger
**Expected behavior:** ...
**Notes:** ...

## Test 2
**Prompt:** ...
**Expected behavior:** ...
```

Skills with subjective output (style, tone) may omit this file.
<!-- </test_cases_template> -->

<!-- <<fork_testing> -->
## Testing with subagent (`context: fork`)

Useful for **task** skills with explicit steps:

```yaml
---
name: my-skill-test
description: ...
context: fork
agent: Explore
---
```

The body becomes the subagent prompt; it does not see prior history. Explore/Plan omit CLAUDE.md to keep context small.

**When to use fork:** research or validation tasks that must not mix with the main thread.

**When not to:** **reference** skills (conventions) — prefer inline invocation so they coexist with current work.
<!-- </fork_testing> -->

<!-- <<script_verification> -->
## Verification with scripts

For objective outputs:

1. Place script in `scripts/validate.sh` (or `.py`).
2. Reference from SKILL.md with `${CLAUDE_SKILL_DIR}/scripts/...`.
3. In tests, check exit code or expected file diff.
4. Document success criteria in TEST-CASES.md.

The script runs without loading its full source into context (only the output).
<!-- </script_verification> -->

<!-- <<version_comparison> -->
## Version comparison (optional)

If the user asks whether the new version is better:

1. Same prompts with previous version (git stash or temporary copy).
2. Same prompts with new version.
3. Present outputs side by side.
4. Incorporate findings in the next SKILL.md revision.
<!-- </version_comparison> -->

<!-- <<meta_testing> -->
## Testing skill-manager (meta)

| Test prompt | Expected behavior |
|------------------|-------------------------|
| "Create a skill for X" | Follow `<creation_process>`; read `skill-skeleton.md`; link `artifact-structuring` |
| "Optimize my skill description" | Go to `<description_optimization>`; do not load `testing-workflows.md` by default |
| "How do I test this skill?" | `<testing_process>` + this file |

Direct invocation: `/skill-manager`.
<!-- </meta_testing> -->

<!-- <<verification> -->
## Checklist before closing an iteration

- [ ] Cases run with skill active
- [ ] Baseline run for at least one representative case
- [ ] Results presented to the user
- [ ] Feedback incorporated or open items documented
- [ ] `description` tested with prompt wording variations
- [ ] TEST-CASES.md updated if documentation was agreed
<!-- </verification> -->
