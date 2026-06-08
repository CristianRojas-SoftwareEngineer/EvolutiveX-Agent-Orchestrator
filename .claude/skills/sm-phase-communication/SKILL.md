---
name: sm-phase-communication
description: >
  Scientific-method phase 10 (Communication) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Produces the final human-facing communication (PR, changelog, report, commit
  draft) adapting via case.md phase_policy.communication. Produces 10-communication.md.
---

# Phase 10 — Communication

<user_communication>Spanish for user interaction AND for the produced PR/commit drafts (repo policy).
See ../artifact-structuring/SKILL.md §language_policy and the conventional-commits skill.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.communication); the full 01→09 chain.

## Procedure
1. Read the policy entry. Read `integration_mode` and `openspec_change` from the canonical block.
2. Summarize for the target audience: what changed, why, evidence, risks, links to artifacts.
3. Draft the commit/PR message in Spanish following the repo's conventional-commits skill, ending with
   the commit metadata (*trailer*) `Case: <case-id>` (see ../sm-orchestrator/references/changelog.md).

## OpenSpec close-out (integration doc §5.3/§10.2/§10.3)
Applies only when the case has an OpenSpec change (`openspec_change` set; Completo/Rápido modes). The
`openspec-sync`/`archive` steps run under the orchestrator's Etapa C authorization (this skill drafts
and records; see integration doc §3.3):
- **Hypothesis confirmed** (verify left no unaccepted CRITICALs): after `openspec-sync` +
  `openspec-archive`, the closing commit carries **double commit metadata** `Case: <case-id>` +
  `OpenSpec-Change: <name>` (the latter **only if the change was archived**). The changelog entry
  references the archived change.
- **Hypothesis refuted**: close with the lesson; **no sync/archive** and **no `OpenSpec-Change:`**
  trailer. If `openspec-apply` ran code, document the `git revert` as a close-out step the **user**
  executes (SM documents, does not execute — integration doc §11.2).
- **Solo-SM**: no change, no `OpenSpec-Change:` trailer; changelog + lesson only.
</phase_procedure>

## Output
Write `10-communication.md`: Applied policy, Executive summary, Changes, Evidence (links), Risks,
retention decision for `experiments/` (integration doc §6.4), Commit/PR draft (Spanish, with `Case:`
commit metadata and, only on the confirmed+archived path, `OpenSpec-Change:`).

## Acceptance
Self-contained; links evidence; correct audience; no unsupported claims; commit draft carries the
`Case:` commit metadata (*trailer*), and `OpenSpec-Change:` only when the change was archived.

<constraints>Communicate; do not introduce new changes or conclusions. Run the changelog generator with the
pending entry (`--pending "<subject>" --case <id>`) and include CHANGELOG.md in the commit. Never
hand-write changelog entries.</constraints>
