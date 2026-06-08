# Knowledge Base (MEMORY.md index pattern)

The knowledge base is the ONLY deliberately persisted memory. It follows the MEMORY.md
index convention: one lesson per file under `.claude/memory/`, indexed by `MEMORY.md` (one
line per lesson). Claude Code does NOT load MEMORY.md automatically; **phase 03 (cause
chain) and phase 11 (solution chain) read it as explicit recall steps**. It holds
non-derivable learnings — NOT case summaries (those live in the case file).

## Lesson file format
```markdown
---
name: <lesson-slug>
description: <one-line summary used for recall relevance>
tags:
  component: <module, e.g. auth | payments | gateway>
  defect-class: <e.g. connection-pool | n+1 | unhandled-rejection | breaking-api-change>
  profile: <corrective | adaptive | perfective | preventive>
---

<the generalizable lesson: what was learned and how to apply it next time.>
Related case: maintenance-cases/<case-id>/case.md
```

## MEMORY.md index (one line per lesson)
```markdown
- [connection-pool timeouts](connection-pool-timeout-regressions.md) — auth/connection-pool · corrective
```

## Recall protocol — two recall points (cause space + solution space)

1. **Phase 03 (cause chain):** derive `component` / `defect-class` from the phase-02 problem
   statement; take `profile` from case.md. Query MEMORY.md by those tags; open and cite
   matching lessons as **cause precedents** in 03-research.md.
2. **Phase 11 (solution chain):** derive `component` / `defect-class` from the confirmed cause
   in `08-analysis.md ## Causa confirmada`; take `profile` from case.md. Query MEMORY.md by
   those tags; open and cite matching lessons as **solution precedents** in
   11-solution-research.md. Same tags, different space.

Recall is a PROCEDURE (which tags to query and how to incorporate), not a promise a lesson
exists.

## Ownership

- Phase 17 WRITES one lesson on verdict (on both close and pause paths). Phase 03 (cause) and
  phase 11 (solution) READ by tags.
- The base grows by LEARNING, not by case volume. Curate: merge redundant lessons, fix tags.
