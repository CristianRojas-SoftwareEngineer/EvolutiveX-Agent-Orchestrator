<scientific_maintenance>
# Scientific Maintenance Subsystem — persistent instructions

This repository runs software maintenance as reproducible scientific experiments through the
`sm-*` skill family. Treat every maintenance request as a *case* driven by `sm-orchestrator`.

## Non-negotiable rules
- Artifacts are the source of truth, not the conversation. Every phase writes one versioned
  artifact under `maintenance-cases/<case-id>/`. The case manifest is `case.md`.
- Never skip phases. Trivial cases may run phases with `reasoning_effort: low` (short artifacts) but the
  full 01→10 chain must exist.
- Profiles set policy; phases execute procedure. Never put profile logic inside a phase, nor
  phase procedure inside a profile.
- Phase behavior varies only through the phase-policy matrix in `case.md`
  (see references/phase-policy-schema.md). Do not fork phases per profile.
- Derived state over duplicated state. CHANGELOG.md and the case index are DERIVED (from commits
  and the filesystem); never hand-edit them. Only lessons are persisted deliberately.

## Case identity
- `case-id = YYYYMMDD-<slug>` (kebab slug from the problem).
- All artifacts for a case live in `maintenance-cases/<case-id>/`.

## Knowledge & traceability
- Knowledge base = MEMORY.md index convention (not runtime-loaded): one lesson per file under
  .claude/memory/, indexed by MEMORY.md, tagged `component`/`defect-class`/`profile`. Claude Code
  does NOT load MEMORY.md automatically; phase 03 reads it as an explicit recall step. This CLAUDE.md
  references MEMORY.md so it enters context each session. Phase 09 writes lessons.
- Case index is DERIVED from maintenance-cases/ and CHANGELOG.md — never a hand-kept ledger.
- Every commit for a case carries the commit metadata (*trailer*) `Case: <case-id>`. CHANGELOG.md is regenerated from
  git log by the on-demand generator (Keep a Changelog). Phase 10 runs it. See references/changelog.md.

## Default policies
- Default rollback for any experiment: revert the change / disable the feature flag.
- On verdict: write a lesson (phase 09) and commit with the `Case:` commit metadata (*trailer*) (phase 10). Do NOT edit
  the changelog or any case ledger by hand — both are derived.

## Memory index (explicit reference — MEMORY.md is not auto-loaded by the runtime)
See: .claude/memory/MEMORY.md
</scientific_maintenance>

<user_communication>
All user-facing output is in Spanish. Skill bodies and artifact header fields are in English for
token efficiency; explanations, questions, and summaries to the user are Spanish. See
.claude/skills/artifact-structuring/SKILL.md §language_policy.
</user_communication>
