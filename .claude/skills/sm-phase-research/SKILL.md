---
name: sm-phase-research
description: >
  Scientific-method phase 03 (Research) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Gathers relevant prior knowledge (code, docs, history, literature) and recalls the
  knowledge base by tags. Adapts via case.md phase_policy.research. Produces 03-research.md.
---

# Phase 03 — Research

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.research); 02-problem-definition.md; the knowledge base (.claude/memory/ via
  MEMORY.md). See ../sm-orchestrator/references/knowledge-base.md.

## Procedure
1. Read the policy entry.
2. **Recall protocol:** derive `component`/`defect-class` from 02-problem-definition.md and take
   `profile` from case.md; query MEMORY.md by those tags; open and cite matching lessons as prior art.
   Recall is a procedure, not a guarantee a lesson exists.
3. **Enumerate the solution space:** list candidate solutions to the confirmed problem with their
   predicted trade-offs (latency, complexity, blast radius, dependencies). At least three alternatives,
   even if the obvious one is preferred. Source: domain knowledge + 03-research.md code map.
4. Gather knowledge focused by `focus`: related code (file:line), docs, recent commits.
5. Cite every source so it is locatable. Collect required `evidence`.
</phase_procedure>

## Output
Write `03-research.md`: Applied policy, Recalled lessons (with links), Findings (with sources),
Related code, Constraints, **Solution candidates** (enumerated alternatives with predicted
trade-offs; this section seeds the hypothesis phase's solution-hypothesis list).

## Acceptance
Sources cited and locatable; recall executed by the relevant tags; coverage of the affected area
sufficient.

<constraints>Gather knowledge and recall lessons; do not propose hypotheses yet.</constraints>
