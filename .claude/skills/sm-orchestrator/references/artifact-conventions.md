# Artifact Conventions (two-chain version)

## Naming
- Case folder: `maintenance-cases/<case-id>/` with `case-id = YYYYMMDD-<slug>`.
- If `maintenance-cases/<case-id>/` already exists, append an incremental suffix: `-2`, `-3`,
  etc. (e.g. `20260606-login-timeout-2`). Concurrent locking is out of scope by deliberate
  design choice.
- Manifest: `case.md`. Phase artifacts (full mode): `NN-<phase>.md`, NN in `01..18`. The
  numbers 09 and 10 are vacante (renumbered to 17 and 18).
- Consolidated mode: phase content lives in `## NN — <Phase>` subsections of `case.md`. No
  separate artifacts.

## Frontmatter (phase artifact) — two-chain version

```yaml
---
case_id: <id>
profile: <corrective|adaptive|perfective|preventive>
phase: <NN-phase>                            # e.g. 16-solution-analysis
chain: <cause|solution|closure>              # NEW in two-chain system
version: vMAJOR.MINOR
timestamp: <ISO-8601 UTC>
status: <pending|in_progress|done|superseded>
inputs: [<prior artifacts>]
produces: <this file>
links: { previous: <file>, next: <file> }    # + previous_version: <file> on the new version when it supersedes a prior one
---
```

The `chain` field is **optional but recommended**. Values:
- `cause` for phases 01–08
- `solution` for phases 11–16
- `closure` for phases 17–18

The orchestrator infers it from the phase number if absent, but writing it explicitly makes
the chain separation auditable at a glance.

## Versioning
- MINOR++ when re-running a phase on the same inputs (refinement).
- MAJOR++ when upstream inputs changed (phase redone from scratch).
- The superseded artifact sets `status: superseded`; the new version links back to it via
  `links.previous_version` (direction: vigente → anterior).
- In the cause refutation loop (Bucle A), the 04–08 artifacts of the refuted hypothesis go
  `superseded` with **MAJOR++**.
- In the solution batch loop (Bucle B), **13–16** go `superseded` with **MAJOR++**; **12** gets
  **MINOR++** when appending new hypotheses to the same map 11; **11** is preserved without
  `superseded`.
- After Bucle C re-opening, closure artifacts 17–18 from the prior run go `superseded` when new
  17–18 are emitted (not on `case_run` increment; frontmatter `case_run` must match the canonical
  block).
- Fine-grained history lives in git (one commit per phase recommended).

## Commit ↔ case link (commit metadata)
- Every commit for a case ends with the git commit metadata (*trailer*) `Case: <case-id>`.
- This gives bidirectional traceability: case → commits (`git log --grep "Case: <case-id>"`)
  and changelog entry → case (the trailer is preserved per entry).
- On the close path, the commit body cites the winning solution:
  `(ver 16-solution-analysis.md ## Solución ganadora)`.
- On the pause path, the commit body documents `case_paused_at` and the Bucle C re-opening
  offer.

## Experimentation artifacts (`experiments/`)
- Cause-chain artifacts: `maintenance-cases/<case-id>/experiments/cause-<id>/`.
- Solution-chain artifacts: `maintenance-cases/<case-id>/experiments/solution-<id>/<hypothesis-id>/`
  (one subfolder per solution hypothesis).
- They are exploratory and discardable — evidence for the conclusion, not production code,
  specs, or formal changes.
- Small scripts/data go directly in the folder (script, raw data, notes, result-summary).
  Voluminous data is stored externally with a `data-location.md` pointer.
- **Throwaway branches** for larger throwaway implementations:
  `exp/<case-id>/hypothesis-X`. Their commits carry the `Case: <case-id>` trailer but are
  **never merged**; the branch stays in history as reference. The keep/delete decision is
  documented at close.

## Retention at close
- Default policy: **what sustains evidence cited in `17-conclusion.md` is kept; the rest is
  discarded** at close (phase 18). The case archive must let a future reviewer verify the
  conclusion without rerunning the experiments.
- Kept: scripts/data backing cited evidence (from BOTH chains); analysis notes with
  reusable insight. Discarded: ephemeral artifacts of purely operational value
  (regenerable logs, temp files). Throwaway branches are decided branch-by-branch. The
  decision is recorded in `18-communication.md`.

## Derived state (do NOT hand-edit)
- `CHANGELOG.md` is derived from conventional commits by the on-demand generator (see
  references/changelog.md). Phase 18 runs it with `--pending`; it is idempotent without
  `--pending`.
- The case index is derived from `maintenance-cases/*/case.md` + `CHANGELOG.md`. There is no
  ledger file.
- Only lessons are persisted deliberately (see references/knowledge-base.md).
