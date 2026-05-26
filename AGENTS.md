# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

---

## 0. Language & Token Efficiency

**Optimize for clarity externally, efficiency internally.**

- Internal reasoning may be conducted in English to optimize token usage and reduce verbosity.
- All user-facing responses MUST be in Spanish.
- Comments generated or modified in source code MUST also be in Spanish.
- Messages generated for `git commit` MUST also be in Spanish.
- Exception: keep highly standardized technical terms in English when:
  - translating them adds no value, or
  - translation introduces ambiguity (e.g., "prompt", "token", "runtime", "framework", "API").
- This exception applies equally to user responses and code comments.
- Do not mix languages unnecessarily. Default to Spanish unless there is a clear technical reason not to.

---

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

---

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

---

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

---

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## 5. Version Control

**Make every commit self-explanatory and descriptive.**

- All commits must include a message describing the purpose, objectives, and functionality of the implemented changes.
- Messages generated for `git commit` MUST be in Spanish.

---

## 6. No Unapproved Artifacts or Automation

**Do not add process, files, or tooling the user did not explicitly request or approve.**

Even when it seems helpful (verification scripts, patch pipelines, extra docs, npm scripts, workflow automation), unrequested additions create accidental complexity and maintenance debt for the user.

### Default rule

- **Do not create** new files under `scripts/`, `docs/`, `.claude/`, or similar, unless the user explicitly asked for that artifact in the current task or approved it after you proposed it.
- **Do not extend** the repo with new automation (shell/PowerShell scripts, CI steps, `package.json` scripts) unless it is part of an agreed plan.
- **Prefer** solving the task with edits to existing files, inline commands, or a short explanation in chat.

### Before creating anything new

1. State what you would add and why (one or two sentences).
2. Ask whether to proceed, or wait for explicit approval.
3. Implement only after a clear yes (or an explicit create/add request in the same message).

### Allowed without extra approval

- Editing files the user already pointed at or that the task clearly requires.
- Fixing bugs in scripts/docs that **already exist** when the user asked to fix or use them.
- Mentioning a possible script or doc in the response **without** writing it.

### Over-engineering

Same spirit as §2 (Simplicity First): no speculative abstractions, no “while we're here” tooling, no preventive infrastructure unless the user scoped it.

**These guidelines are working if:** the diff only contains what the user asked for, and new files appear only when they explicitly wanted them.
