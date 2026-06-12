---
name: sm-phase-solution-research
description: >
  Solution-space phase 11 (Solution Research) for the two-chain scientific-maintenance system.
  Invoked by sm-orchestrator ONLY after phase 08 has confirmed a cause (the `## Causa confirmada`
  section in 08-analysis.md is the precondition). Maps the full space of viable solutions for the
  confirmed cause; gathers alternatives, frameworks, patterns, prior lessons; produces
  11-solution-research.md. Adapts via case.md phase_policy.solution-research.
---

# Phase 11 — Solution Research

Maps the solution space. Operates on the SOLUTION axis (the cause axis is closed by phase 08).
Generic, profile-parameterized.

<!-- <user_communication> -->
Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.
<!-- </user_communication> -->

<!-- <phase_procedure> -->
## Inputs
- case.md (phase_policy.solution-research).
- `08-analysis.md` with the mandatory `## Causa confirmada` section (precondition §5.2).
- The knowledge base (.claude/memory/ via MEMORY.md) — applied to the SOLUTION space
  (alternatives, patterns), not the cause space.

## Procedure
1. Read the policy entry (`phase_policy.solution-research`).
2. **Recall protocol (solution space):** derive `component` / `defect-class` from the confirmed
   cause; take `profile` from case.md. Query MEMORY.md by those tags; open and cite matching
   lessons as **solution precedents** (not as cause precedents — same tags, different space).
3. **Map the solution space:** enumerate ALL viable solutions for the confirmed cause. For each,
   record: name, mechanism, predicted trade-offs (latency, complexity, blast radius, dependencies,
   reversibility, risk), references (code:line, docs, lessons). Aim for breadth — the next phase
   narrows to falsifiable hypotheses; this phase does not.
4. Profile-driven emphasis: the profile's `focus` selects which dimension of trade-offs to
   prioritize (corrective → reversibility + minimal diff; adaptive → reversibility + flag
   isolation; perfective → metric dominance + benchmark cost; preventive → coverage of
   materialization paths).
<!-- </phase_procedure> -->

## Output
Write `maintenance-cases/<case-id>/11-solution-research.md` from templates/phase-artifact.md
with `chain: solution` in the frontmatter:
- Applied policy (echo), Recalled lessons (links), Solution space map (rows: candidate; columns:
  `status: pending|explored|discarded`, mechanism, predicted trade-offs, references), Coverage
  statement (which kinds of solution were considered and excluded — and why). New candidates
  enter as `pending`; Bucle B consults this column for exhaustion.

## Acceptance
At least two viable candidates enumerated; each with description, predicted trade-offs and
references; recall executed by the relevant tags; coverage statement explains the boundaries
of the space.

<!-- <constraints> -->
No hypothesis formulation here. Map the space; do not yet propose what to test.
<!-- </constraints> -->
