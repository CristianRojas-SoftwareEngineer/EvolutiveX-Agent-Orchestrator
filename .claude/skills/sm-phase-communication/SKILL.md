---
name: sm-phase-communication
description: >
  Closure phase 18 (Communication) for the two-chain scientific-maintenance system. Invoked by
  sm-orchestrator. Produces the final human-facing communication (PR, changelog, report,
  commit draft), adapting via case.md phase_policy.communication. Produces 18-communication.md.
  The commit cites the winning solution from 16-solution-analysis.md (not the agent's first
  idea). Handles the `pausado` state: emits the canonical Bucle C re-opening offer in
  `18-communication.md` (orchestrator step 13 processes acceptance only).
---

# Phase 18 — Communication

<user_communication>Spanish for user interaction AND for the produced PR/commit drafts (repo
policy). See ../artifact-structuring/SKILL.md §language_policy and the conventional-commits
skill.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.communication).
- `17-conclusion.md` (verdict, spec, pause note, or investigativo note).
- Cause chain `01–08` always; solution chain `11–16` only per chain state §5.2 (`completa_12-16`:
  full chain; `parcial_11`: `11` only; `no_abierta`: omit 11–16).

## Procedure
1. Read the policy entry. Read `status` from the canonical block: `done` (close) or
   `pausado` (pause).
2. **Close path (`status: done`):** summarize for the target audience: what changed, why,
   evidence from both chains, risks, links to artifacts.
3. **Pause path (`status: pausado`):** emit a "no resuelto" communication summarizing what was
   tried (cause candidates explored, solution candidates explored if the chain opened),
   what the lesson learned, and the **canonical Bucle C offer** (text + suggested context
   `ctx-a`/`ctx-b`/`ctx-c` per §3.1.3 mapping: `C1`→`ctx-a`, `C2`→`ctx-b`, `C3`→`ctx-a` or
   `ctx-c`; note that `ctx-c` triggers profile re-selection on acceptance). The orchestrator does
   not re-offer; step 13 processes user acceptance after commit.
4. Draft the commit/PR message in Spanish following the repo's conventional-commits skill,
   ending with the git commit metadata (*trailer*) `Case: <case-id>` (see
   ../sm-orchestrator/references/changelog.md).
5. **The commit body cites the winning solution from `16-solution-analysis.md ## Solución
   ganadora`** (not the agent's first idea). The reference format is
   `(ver 16-solution-analysis.md ## Solución ganadora)` so the chain of evidence is
   navigable from the commit.
6. On the pause path, the commit body additionally documents the `case_paused_at` timestamp
   and the Bucle C re-opening offer.
</phase_procedure>

## Output
Write `18-communication.md` with `chain: closure` in the frontmatter: Applied policy,
Executive summary, Changes (or pause note), Evidence (links to both chains), Risks,
Commit/PR draft (Spanish, with `Case:` commit metadata, citing 16-solution-analysis.md
## Solución ganadora on the close path, or case_paused_at + Bucle C offer on the pause path).

## Acceptance
Self-contained; links evidence from both chains; correct audience; no unsupported claims;
commit draft carries the `Case:` commit metadata (*trailer*); on the close path, the commit
body cites 16-solution-analysis.md ## Solución ganadora; on the pause path, the commit body
documents case_paused_at and the Bucle C offer.

<constraints>Communicate; do not introduce new changes or conclusions. Run the changelog
generator with the pending entry (`--pending "<subject>" --case <id>`) and include
CHANGELOG.md in the commit. Never hand-write changelog entries.</constraints>
