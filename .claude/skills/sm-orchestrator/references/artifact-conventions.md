# Artifact Conventions

## Naming
- Case folder: `maintenance-cases/<case-id>/` with `case-id = YYYYMMDD-<slug>`.
- If `maintenance-cases/<case-id>/` already exists, append an incremental suffix: `-2`, `-3`, etc.
  (e.g. `20260606-login-timeout-2`). Concurrent locking is out of scope by deliberate design choice.
- Manifest: `case.md`. Phase artifacts (full mode): `NN-<phase>.md`, NN in 01..10.
- Consolidated mode: phase content lives in `## NN — <Phase>` subsections of `case.md`. No separate artifacts.

## Frontmatter (phase artifact)
```yaml
---
case_id: <id>
profile: <corrective|adaptive|perfective|preventive>
phase: <NN-phase>
version: vMAJOR.MINOR
timestamp: <ISO-8601 UTC>
status: <pending|in_progress|done|superseded>
inputs: [<prior artifacts>]
produces: <this file>
links: { previous: <file>, next: <file> }   # + previous_version: <file> on the new version when it supersedes a prior one
---
```

## Versioning
- MINOR++ when re-running a phase on the same inputs (refinement).
- MAJOR++ when upstream inputs changed (phase redone from scratch).
- The superseded artifact sets `status: superseded`; the new version links back to it via `links.previous_version`.
- Fine-grained history lives in git (one commit per phase recommended).

## Commit ↔ case link (metadato de commit)
- Every commit for a case ends with the git commit metadata (*trailer*) `Case: <case-id>`.
- This gives bidirectional traceability: case → commits (`git log --grep "Case: <case-id>"`) and
  changelog entry → case (the commit metadata (*trailer*) is preserved per entry).

## Experimentation artifacts (`experiments/`) — integration doc §6
- Experimental artifacts live in `maintenance-cases/<case-id>/experiments/<hypothesis-X>/`, one
  subfolder per alternative considered in phase 04. They are exploratory and discardable — evidence
  for the conclusion, not production code, specs, or formal changes.
- Small scripts/data go directly in `experiments/<hypothesis-X>/` (script, raw data, notes,
  result-summary). Voluminous data is stored externally with a `data-location.md` pointer instead of
  being committed.
- **Throwaway branches** for larger throwaway implementations: `exp/<case-id>/hypothesis-X`. Their
  commits carry the `Case: <case-id>` commit metadata (*trailer*) but are **never merged**; the
  branch stays in history as reference. The keep/delete decision is documented at close.

## OpenSpec change naming (integration doc §8.1, §10.2 r6)
- Convention `case-id = OpenSpec change name`, keeping the `YYYYMMDD-<slug>` format on both sides
  (e.g. case `20260601-proxy-timeout-anthropic` ↔ change `20260601-proxy-timeout-anthropic`). This
  enables direct navigation between `maintenance-cases/<case-id>/` and `openspec/changes/<case-id>/`.
- Applies only when both records exist: Solo-SM has no change; Solo-OpenSpec has no case-id.

## Retention at close (integration doc §6.4, §12.8)
- Default policy: **what sustains evidence cited in `09-conclusion.md` is kept; the rest is
  discarded** at close (phase 10). The case archive must let a future reviewer verify the conclusion
  without rerunning the experiments.
- Kept: scripts/data backing cited evidence; analysis notes with reusable insight. Discarded:
  ephemeral artifacts of purely operational value (regenerable logs, temp files). Throwaway branches
  are decided branch-by-branch. The decision is recorded in `10-communication.md`.

## Derived state (do NOT hand-edit)
- CHANGELOG.md is derived from conventional commits by the on-demand generator
  (see references/changelog.md). Phase 10 runs it with `--pending`; it is idempotent without `--pending`.
- The case index is derived from `maintenance-cases/*/case.md` + CHANGELOG.md. There is no ledger file.
- Only lessons are persisted deliberately (see references/knowledge-base.md).
