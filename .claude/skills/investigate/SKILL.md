---
name: investigate
description: >
  Self-contained investigation workflow: formalize an internal investigation plan
  (purpose, objectives, tasks with concrete sources), execute it against those sources
  (repo files, URLs, named elements), and report findings directly in the assistant
  message — walkthrough plus structured results, no report files. Mutates nothing: no
  code changes, validations, or commits. Similar to an Explore agent, but reusable and
  auto-discoverable as a skill.
when_to_use: >
  Invoke with /investigate [requirements] or when the user asks to explore,
  investigate, analyze, or research something without changing the project (explorar,
  investigar, analizar, investigación, análisis de arquitectura, entender cómo funciona
  X), including online research. For work that changes the project, use
  create-plan instead.
argument-hint: "[requirements]"
---

# Workflow: Investigate and report

<!-- <table_of_contents> -->
## Contents

1. [How to operate this workflow](#how-to-operate-this-workflow)
2. [Maintenance profiles (optional exploration modes)](#maintenance-profiles-optional-exploration-modes)
3. [Investigation rules](#investigation-rules)
4. [Report format](#report-format)
5. [Final verification before reporting](#final-verification-before-reporting)
<!-- </table_of_contents> -->

<!-- <user_communication> -->
Ask, confirm, and respond to the user in **Spanish** (native Spanish-speaking audience). Keep this artifact's instructions in **English** for token efficiency. Canonical policy: `<language_policy>` in [.claude/skills/artifact-structuring/SKILL.md](../artifact-structuring/SKILL.md). User-facing rules: [AGENTS.md](../../../AGENTS.md) §0.
<!-- </user_communication> -->

<!-- <operation> -->
## How to operate this workflow

This skill is **self-contained**: it formalizes an internal investigation plan (by sub-invoking `create-plan`), executes it, and reports the results — all in one flow. The plan is an internal formalization step, never the deliverable; the deliverable is the report in the assistant message.

**Sub-invoked mode**: when another skill invokes this one as a sub-step, follow the `<sub_invocation_protocol>` of [artifact-structuring](../artifact-structuring/SKILL.md): the report keeps its canonical structure but is delivered as a hand-off to the invoking flow instead of a conversational close-out, and scope questions are still presented to the user.

**Harness tooling (reflective, not mechanical)**: this skill targets Claude Code first but is written to run in any agentic harness. Before starting, survey the **capabilities** your harness exposes and reflect on which fits each step below, named by function with their Claude Code incarnation as the reference example: structured user questions with options (`AskUserQuestion`), delegable exploration subagents (`Agent`), web search and fetch (`WebSearch`/`WebFetch`), and task-list management (`TaskCreate`/`TaskUpdate`). In another harness, map each capability to its closest equivalent; where one has no equivalent, achieve the intent by other means rather than skipping the intent. Prefer a real tool over improvising its effect in prose.

**Task tracking**: trace the investigation with the harness task-list tools: create one task per investigation task of the plan plus one for the final report, mark them in progress when started and completed when verified. This gives the user visibility and prevents silently dropped steps.

1. **Requirements**: the user may pass requirements as `$requirements` (text after the slash command). If the request actually demands changes to the project, this is the wrong skill — route to `create-plan`; if genuinely ambiguous, ask (structured question with both options) instead of guessing. If `$requirements` is empty and no requirements appear elsewhere in the message, request them **in Spanish** (phenomenon to explore, idea to analyze, or topic to research; questions to answer; restrictions; context to size scope) before starting. Never invent or assume requirements.
2. **Discovery**: resolve every source (repo file, document, URL or named external source, precisely-named element) from requirements and codebase layout. Delegate independent discovery tasks to exploration subagents when the harness offers them (Claude Code: `Agent` with `subagent_type: "Explore"`), in parallel when possible; use web search to confirm that external sources exist and are pertinent before relying on them. If a required source cannot be resolved, **stop and ask** — never investigate against placeholder sources.
3. **Scope decisions**: if requirements are ambiguous, incomplete, or contradictory, stop and ask. Determine the maintenance profile as a scope decision per `<maintenance_profiles>` (explicit → accept; inferred → confirm via structured question; not maintenance-related → omit). If you detect a scoping decision point the user did not resolve (competing investigation angles, depth versus breadth, which questions matter most), surface it via the structured-question capability — one question per decision, your recommendation first and marked as such — and continue only after the user decides.
4. **Formalize the plan (sub-invocation of create-plan)**: sub-invoke [create-plan](../create-plan/SKILL.md) per the `<sub_invocation_protocol>` of [artifact-structuring](../artifact-structuring/SKILL.md) to formalize the investigation as a read-only plan. Pass as invocation context the investigation material: the purpose (both components — observed need and proposed investigation with its added value), the objectives formulated as questions to answer or determinations to produce (never «redactar el reporte» — reporting is the fixed final step), and the investigation tasks, each with one concrete read-only source per action line in backticks (repo-relative path, URL or named external source, or precisely-named element — never placeholders). If a profile is active, modulate each task's focus, required evidence, and depth per the `<maintenance_profiles>` table and declare it to the sub-invocation. The plan's approval gate is presented to the user as-is. Consume the approved plan as the hand-off that drives execution; keep it internal — do not write it to a file and do not deliver it as the response.
5. **Execute the investigation**: work through the tasks in numbering order — a valid execution order by construction (every dependency numbered lower than its dependent in the plan built by `create-plan`) — executing or delegating mutually independent tasks in parallel when possible, examining each declared source and extracting the findings or determinations it targets. Record findings as you go (which source, what was found, fact vs. interpretation). Investigation mutates nothing — see `<investigation_rules>`. If execution reveals that a planned source is missing or insufficient, adapt the plan (note the deviation for the report) or ask if the gap blocks an objective.
6. **Report**: synthesize all findings per `<report_format>` and deliver them **in Spanish** as the final assistant message. Do not persist the report in project files unless the user explicitly requests it. Do not mention harness tools, modes, subagents, or internal XML block names in the report.
<!-- </operation> -->

<!-- <maintenance_profiles> -->
## Maintenance profiles (optional exploration modes)

When the investigation is tied to a software-maintenance problem, an active profile modulates the exploration focus, the minimum evidence required, and the reasoning effort of the internal plan's tasks:

| Profile | Exploration focus | Minimum evidence | Reasoning effort |
|---|---|---|---|
| **Correctivo** (bug, regression, incident) | Symptoms + reproduction steps; recent regressions; root cause | Stack trace or failure characterization; reproduction steps; related commits | Medium |
| **Perfectivo** (performance, readability, quality, no functional change) | Target metric + captured baseline; published benchmarks; optimization patterns | Baseline measured with variance; explicit improvement threshold; functional invariant | Medium |
| **Preventivo** (risk, hardening, audit, recurring defect class) | Weak signals and trends; analogous defect classes; risk materialization mechanism | Documented signals; probability/impact of the risk; materialization paths | High |
| **Adaptativo** (migration, dependency upgrade, external change) | Environment delta; v_old↔v_new diff; breaking changes; public contract | Current usage of the affected API; breaking-changes list; affected public contract | High (research) |

**Classification tie-breakers:**

- "Optimize something broken" → correctivo first (fix, then improve).
- "Migrate and improve" → adaptativo (the external change drives scope).
- "Audit because something failed" → correctivo for the concrete failure, preventivo for the defect class.

**Profile determination rule:**

- The user declares a profile explicitly → accept it as-is.
- The skill infers a profile from the request → confirm it with the user via a structured question before executing.
- The investigation is not maintenance-related (general research, architecture discovery) → omit the profile without friction; no profile is a valid state.
<!-- </maintenance_profiles> -->

<!-- <investigation_rules> -->
## Investigation rules

- **No mutations**: investigation tasks read, examine, compare, and determine — they never edit project files, run state-changing commands, or commit. If the request implies a mutation, it belongs to `create-plan`.
- **Evidence discipline**: distinguish facts verified against a source from interpretations and hypotheses, and keep the source attached to each finding. On contradictory findings between sources, prefer the more authoritative and current one, and report the contradiction explicitly.
- **Scope discipline**: investigate only what the objectives require. New questions discovered mid-investigation go to the report as open questions — do not expand scope unilaterally.

### Action line examples

Bad — no concrete source per step; agent must guess what to read or where to search:

```markdown
1. Investigar cómo funciona el enrutamiento del proxy.
2. Buscar documentación relevante sobre redirecciones HTTP.
```

Good:

```markdown
1. **`src/proxy/router.ts`** — función `resolveUpstream`: examinar la estrategia de selección de upstream y determinar si soporta pesos dinámicos.
2. **`https://datatracker.ietf.org/doc/html/rfc9110`** — sección 15.4 (redirecciones): extraer los requisitos de preservación de método relevantes para el proxy.
```
<!-- </investigation_rules> -->

<!-- <report_format> -->
## Report format

The report is the deliverable: the final assistant message, in Spanish, clear and structured. It must:

1. **Recorrido (walkthrough)**: open with a post-execution account of how the investigation proceeded — which tasks were executed, against which sources — and any drift between the plan (built via the `create-plan` sub-invocation) and the actual execution (sources replaced, tasks adapted, scope adjustments), or an explicit note that there was none. This Recorrido is the investigation's walkthrough — it owns that role here; the sub-invoked plan's own closure phase is not produced separately.
2. **Respuestas a los objetivos**: answer explicitly each objective of the internal plan (or declare what remained unanswered and why). Keep each answer a concise verdict (a short paragraph or list item per objective); the supporting evidence and development belong in the findings section — do not grow sub-sections here that duplicate it.
3. **Hallazgos por tema**: present findings organized by theme — not by execution order — distinguishing verified facts from interpretations and hypotheses, citing the examined sources next to each relevant finding (paths as `file:line` when applicable).
4. **Conclusiones**: close with conclusions and, when appropriate, recommendations or open questions for a next iteration.

**Heading structure**: render the four components above as same-level sections (`##`), in that order, each opening with prose — never a heading followed immediately by another heading. Sub-headings (`###`) are allowed only inside the findings section, one per theme; the other three sections use prose and lists, no sub-headings.

Detail matters: the report must let someone who did not watch the investigation reach the same conclusions from the cited evidence. No report files unless explicitly requested.
<!-- </report_format> -->

<!-- <verification> -->
## Final verification before reporting

Before delivering the report, run this checklist mentally; fix gaps before delivering if any check fails:

1. Was the plan formalized via a `create-plan` sub-invocation before execution — purpose (both components), verifiable objectives, concrete read-only source action lines, and a valid execution order (every dependency numbered lower than its dependent, no "caution" dependencies between independent tasks) — and was its approval gate presented to the user?
2. Was every declared source actually examined (or its absence reported), with zero mutations to the project?
3. Does the report open with the Recorrido (process followed plus drift versus the internal plan, or its explicit absence), answer every objective explicitly, organize findings by theme, distinguish facts from interpretations, cite sources per finding, and follow the heading structure of `<report_format>` (four `##` sections opening with prose; `###` only inside findings)?
4. Were all unresolved scoping decision points consulted with the user before or during execution?
5. Were task-list entries created and closed for each investigation task and the report?
6. Is the report entirely in Spanish, with no internal vocabulary from this skill (XML block names, harness tools) leaked into it, and not persisted to any file?
7. If a maintenance profile was active, was it determined per the rule (explicit, or inferred and confirmed with the user), and did the investigation tasks reflect its focus and required evidence?
<!-- </verification> -->
