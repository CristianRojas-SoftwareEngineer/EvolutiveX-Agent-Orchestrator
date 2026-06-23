---
name: verify-specification-delta
description: >
  Stage 8 of the specification-delta pipeline. Read-only hard gate before
  synchronize/archive. Produces a CRITICAL/WARNING/SUGGESTION report combining
  a 4C check (Completeness/Correctness/Coherence/Consistency over all applied
  changes), a change-id uniqueness gate (CRITICAL), a documentary-synchronization
  check, a legacy-reduction check, and a framework-agnostic test gate (CRITICAL). It only detects;
  remediation lives upstream. Invoked only by orchestrate-specification-delta.
when_to_use: >
  Used by orchestrate-specification-delta after apply, as the gate before sync and
  archive. Not a standalone entry point.
argument-hint: "[--change <name>]"
---

# Verify Specification-Delta

<!-- <overview> -->
Stage 8 (read-only). Produces a verification report and acts as the **hard gate**
before sync/archive. It combines five checks with severities
CRITICAL/WARNING/SUGGESTION. Any CRITICAL stops the pipeline. It **only detects** —
remediation lives upstream (sync for docs, apply for legacy). It mutates nothing.
<!-- </overview> -->

<!-- <user_communication> -->
Ask, confirm, and respond to the user in **Spanish**. Keep this skill's instructions
in **English** for token efficiency. Canonical policy: `<language_policy>` in
[artifact-structuring](../artifact-structuring/SKILL.md). User-facing rules:
[AGENTS.md](../../../AGENTS.md) §0.
<!-- </user_communication> -->

<!-- <workflow> -->
Resolve the artifacts first:

```bash
node_modules/.bin/openspec status --change "<name>" --json
node_modules/.bin/openspec instructions apply --change "<name>" --json
```

Read all artifacts from `contextFiles` (proposal, specs, design, tasks). Then run the
five checks.

## Plan the checks (sub-invocation of create-plan)

Before running the checks, sub-invoke [create-plan](../create-plan/SKILL.md) per the
`<sub_invocation_protocol>` of [artifact-structuring](../artifact-structuring/SKILL.md)
to structure the four checks as a **read-only** verification plan: pass the delta
artifacts (proposal, specs, design, tasks) as the sources and the five checks below
(4C, change-id uniqueness, documentary synchronization, legacy reduction, test gate)
as read-only tasks ordered by dependency. The plan is read-only and its closure phase produces no effects
— this stage mutates nothing. The verdict and the CRITICAL/WARNING/SUGGESTION report
below are unchanged by it. Then execute the plan's tasks in order.

## 4C — Completeness / Correctness / Coherence / Consistency

This check evaluates all four dimensions over **all applied changes** (the full diff),
not only the evidence mapped requirement by requirement.

- **Completeness**: count `- [x]` vs `- [ ]` in `tasks.md`; for each requirement in
  the delta specs, search the codebase for evidence. Incomplete task or unimplemented
  requirement → **CRITICAL**. The optional inline tags (`~state` / `@assignee`) sit
  after the checkbox+description, so they do not affect the `- [x]`/`- [ ]` count — no
  functional change to this check.
- **Correctness**: map each requirement to `file:line` evidence; check scenario
  coverage. Divergence from spec intent → **WARNING**; uncovered scenario → WARNING.
- **Coherence**: compare the implementation to `design.md` decisions; flag pattern
  inconsistencies. Contradiction of a design decision → WARNING; style nit →
  **SUGGESTION**.
- **Consistency**: uniformity of naming, conventions, and idioms across all applied
  changes and alignment with the surrounding code. A contradiction between applied
  changes or a broken invariant → **CRITICAL**; a convention divergence → **WARNING**;
  a stylistic non-uniformity → **SUGGESTION**.

## Documentary synchronization

Confirm the affected documentation reflects the real post-change state. A doc that
claims «done/implementado/soportado» for work not built → **CRITICAL**; a
stale/contradictory doc → **WARNING**. (Remediation is `synchronize`'s job, stage 9;
this check only confirms it happened.)

## Legacy / Zombie reduction

Confirm the code/doc the delta replaced was removed or explicitly deprecated (with a
retirement date). Dangling imports, duplicated sections, obsolete references →
**WARNING**. (Remediation is the cleanup tasks `apply` executed; this check only
confirms the residue is gone.)

## Change id uniqueness gate (CRITICAL)

Before the test gate, verify that the delta's numeric prefix `c<NNNNN>` is unique
across all directories under `openspec/changes/` and `openspec/changes/archive/`
(date prefix normalized). Run:

```bash
npm run openspec:verify-change-id -- --change "<name>"
```

A non-zero exit code is **CRITICAL** — it hard-blocks the gate. Report every
conflicting directory path from stderr. (Remediation: rename the colliding archive or
active change upstream in `apply` or before `create`.)

## Test gate (framework-agnostic, CRITICAL)

Run the repo's automated test suite by delegating to whatever framework is installed
and configured, via its `test` script:

```bash
npm test
```

A failing suite is **CRITICAL** — it hard-blocks the gate exactly like any 4C
finding. If no test framework is configured in the repo, fall back to an analysis of
completeness, correctness, coherence, and consistency; a failure there is equally
CRITICAL. Never hardcode a specific runner — stay agnostic to language and framework.

## Report and verdict

Render a scorecard (one row per 4C dimension — Completeness, Correctness, Coherence,
Consistency) plus grouped issue lists
(CRITICAL/WARNING/SUGGESTION) with `file:line` references and actionable
recommendations. Verdict: **FAIL** if any CRITICAL exists (the orchestrator routes
back to `apply`); otherwise **PASS** (warnings are surfaced for the user to decide).
Report the verdict inline; the orchestrator resolves and invokes the next stage in the
same turn.

## Optional escalation (measured context pressure only)

Under **measured** context pressure, the fan-out checks (4C, documentary
synchronization, legacy reduction) may be delegated to a
read-only sub-agent (an `Explore`-style agent, no write tools) that returns only
structured findings (issue + severity + `file:line`) and never mutates anything. This
is never a preventive default; the main thread always owns the verdict and the
Spanish output. (This escalation lives here, not in `orchestrate-roadmap`.)
<!-- </workflow> -->

<!-- <constraints> -->
- Read-only: this stage never mutates code, artifacts, docs, or specs. The `create-plan`
  sub-invocation structures the checks as a read-only plan and introduces no mutation —
  the stage's read-only invariant holds.
- Integrate the 4C, change-id uniqueness, documentary-synchronization and
  legacy-reduction checks + the test gate **only**; do **not** port the roadmap-scoped
  checks (phase traceability, dependency gate, Definition of Done) — they need the L1
  registry, which a single delta cannot see.
- Detection only; remediation lives upstream (`synchronize` for docs, `apply` for
  legacy).
- A duplicate `c<NNNNN>` across change directories is CRITICAL (change-id uniqueness
  gate).
- A failing test suite is CRITICAL. Stay framework-agnostic — never encode a runner.
- Prefer SUGGESTION > WARNING > CRITICAL when uncertain, except the explicit CRITICAL
  cases above.
<!-- </constraints> -->
