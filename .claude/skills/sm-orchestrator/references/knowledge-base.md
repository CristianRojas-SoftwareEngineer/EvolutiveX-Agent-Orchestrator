# Knowledge Base (MEMORY.md index pattern)

The knowledge base is the ONLY deliberately persisted memory. It follows the MEMORY.md index
convention: one lesson per file under `.claude/memory/`, indexed by `MEMORY.md` (one line per lesson).
Claude Code does NOT load MEMORY.md automatically; phase 03 reads it as an explicit recall step.
It holds non-derivable learnings — NOT case summaries (those live in the case file).

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

## Recall protocol (phase 03)
1. Derive `component` / `defect-class` from the phase-02 problem statement; take `profile` from case.md.
2. Query MEMORY.md by those tags; open the matching lessons.
3. Cite recalled lessons as prior art in 03-research.md.
Recall is a PROCEDURE (which tags to query and how to incorporate), not a promise a lesson exists.

## Ownership
- Phase 09 WRITES one lesson on verdict. Phase 03 READS by tags.
- The base grows by LEARNING, not by case volume. Curate: merge redundant lessons, fix tags.
