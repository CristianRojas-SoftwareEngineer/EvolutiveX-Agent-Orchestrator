---
description: >
  Generic prescriptive templates for the two-level roadmap model: L1 orchestrator change, L2 phase change,
  phase registry table, and block validation strategy. Use with openspec-roadmap-manager when building
  the orchestrator or a phase change via openspec-propose.
---

# Roadmap templates — generic (two-level model)

<!-- <<overview> -->
These templates are **generic and reusable** across any two-level roadmap, not tied to any specific project.
Fill in `{{placeholders}}` when invoking `openspec-propose`. The orchestrator template (Prompt A) is used
once per roadmap; the phase template (Prompt B) is used once per phase, in dependency order.
<!-- </overview> -->

---

## Prompt A — Create the L1 orchestrator change

```text
# Task: create the L1 orchestrator change for the {{domain}} roadmap

Follow the openspec-propose skill. Create a single OpenSpec change named `{{orchestrator-name}}`
(e.g. `auth-migration`, `payment-roadmap`) with all artifacts (proposal.md, specs/, design.md,
tasks.md) under openspec/changes/{{orchestrator-name}}/. Schema: spec-driven. Artifacts in Spanish.

## Source of truth
- Design document: {{path/to/design-doc.md}}
- High-level change set: {{section references — link, do not copy}}
- Current vs target state: {{section references}}

## Nature of this change (CRITICAL)
This change does NOT implement code for any phase. It is an ORCHESTRATOR change that:
1. Defines the macro roadmap from current state to target state.
2. Defines the PHASES of iterative-incremental development and their dependencies (traceable 1:1
   to the source change set).
3. Defines, for each phase, the WORK that its L2 child change will own, the VALIDATION GATES
   required, the DOCUMENTATION to update, and the LEGACY to retire.
4. Maintains a PHASE REGISTRY with status and dependencies that the orchestrator tracks.

Two-level model:
- Level 1 = this change `{{orchestrator-name}}` (governance only).
- Level 2 = one change per phase, named `{{prefix}}-<phaseid>-<slug>` (e.g. {{prefix}}-p1-token-model),
  created incrementally when each phase begins. Each L2 change carries a back-reference to
  `{{orchestrator-name}}` in its proposal.md. The parent→child relationship is expressed via the
  orchestrator registry + that back-reference (OpenSpec has no native hierarchy).

## proposal.md (Why / What Changes / Capabilities / Non-goals / Impact)
- Why: gap between current state and target; need for incremental, validated delivery without
  accumulating zombie code/docs.
- What Changes: introduces a phased governance framework (does not implement phases).
- Capabilities → New: `{{orchestrator-name}}-governance`.
- Non-goals: no concrete implementation tasks for any phase; does not touch src/ as part of
  this change; each phase is implemented in its own L2 change.
- Impact: openspec/changes/ (child changes), docs/ (ongoing maintenance), and any other
  directories affected by the roadmap. State which PKA layers each block touches.

## specs/ — capability `{{orchestrator-name}}-governance` (delta ADDED, verifiable, Given/When/Then)
Define normative requirements for HOW the roadmap is executed, for example:
- The roadmap is divided into phases traceable 1:1 to the source change set.
- Each phase is materialized as an independent L2 OpenSpec change.
- A phase is NOT complete without: (a) technical validation gate passed, (b) affected docs
  updated to the real post-phase state, (c) phase-associated legacy reduced.
- Phase dependencies from the DAG must be archived before a dependent phase begins.
- The orchestrator maintains a phase registry (status: pendiente / en curso / validada / archivada).
- After each phase, all docs listed in the registry for that phase reflect actual implementation
  (no "done" claims for unbuilt work).
- No zombie/legacy code or docs: replaced items are removed or explicitly deprecated with a
  retirement date.
Write each requirement with at least one verifiable Given/When/Then scenario.

## design.md (how governance works, respecting PKA and repo rules)
- Phase registry: table — phase · child change (name) · block · dependency (DAG) · validation
  gate (command/criterion) · docs to update · legacy to retire.
- Child change naming convention and back-reference rule.
- How the parent→child relationship is expressed without native OpenSpec hierarchy support.
- Validation strategy per block (see block strategy table in templates.md).
- Doc maintenance and legacy reduction strategy per phase.
- Incremental creation policy for L2 changes (registry enumerates all phases; changes are
  created one-by-one when each phase starts, using openspec-propose).
- PKA layer order within each phase (domain → services → operations → API → UI).

## tasks.md (GOVERNANCE checklist, not code tasks)
One section per phase. Each section:
- [ ] Verify §DAG dependencies satisfied
- [ ] Create L2 phase change `{{prefix}}-<phaseid>-<slug>` (skill openspec-propose)
- [ ] Track implementation of child change
- [ ] Validation gate passed (gate command)
- [ ] Documentation updated (list affected docs/)
- [ ] Legacy retired or explicitly deprecated
- [ ] Spec sync if phase modifies agreed behavior (skill openspec-sync)
- [ ] Mark phase as validated in registry and archive child change (skill openspec-archive)
Add a final "Roadmap close-out" section: E2E verification; confirmed absence of legacy/zombie;
archived orchestrator.

## Constraints
- Comply with openspec/config.yaml: proposal without checklist or design; specs as verifiable
  deltas; design without task breakdown; tasks with per-task acceptance criteria.
- Link docs/ instead of copying content; keep standard technical terms in English (API, specs,
  gateway, hooks, etc.).
- Do NOT run openspec update or regenerate .claude/.
```

---

## Prompt B — Create an L2 phase change

```text
# Task: create the L2 phase change {{phase-id}} of the {{orchestrator-name}} roadmap

Follow the openspec-propose skill. Create the change `{{phase-change-name}}`
(e.g. `{{prefix}}-{{phase-id}}-{{slug}}`) corresponding to phase {{phase-id}} of
the phase registry in the L1 orchestrator change `{{orchestrator-name}}`.
Schema: spec-driven. Artifacts in Spanish.

## Location (CRITICAL)
Scaffold the L2 at the OpenSpec-indexed root path `openspec/changes/{{phase-change-name}}/`
(sibling of the orchestrator at `openspec/changes/{{orchestrator-name}}/`). Do NOT move or
nest the L2 inside the orchestrator folder (e.g.
`openspec/changes/{{orchestrator-name}}/phases/{{phase-change-name}}/`) during the phase
loop — that breaks `openspec list`, `validate`, `apply`, and `archive` for the L2 because
the CLI indexes changes by name at the root path. The nested layout is only created at
roadmap close-out, when `openspec-archive` moves the L1 and the L2s into the archive
folder together. See the orchestrator skill `openspec-roadmap-manager` § "Location of L2
phase changes (CRITICAL)" for the full rationale.

## Source of truth
- Phase registry and Definition of Done: L1 orchestrator change `{{orchestrator-name}}`
  (design.md phase registry + specs/ governance requirements).
- Technical scope of this phase: {{path/to/design-doc.md §section}} (link, do not copy).

## Nature
This change DOES implement the phase. Generate proposal.md, specs/ (verifiable Given/When/Then
deltas), design.md (respecting PKA: domain → services → operations → API → UI), and tasks.md
(each task with acceptance criteria; validation: {{gate command}}).

## Required
- proposal.md includes explicit back-reference to `{{orchestrator-name}}` and to phase {{phase-id}}.
- Dependencies from the registry DAG for this phase: {{dep-list or «none (entry phase)»}}.
- Complies with the phase Definition of Done (technical gate, docs to update, legacy to retire)
  as defined by the orchestrator specs/.
- Complies with openspec/config.yaml. Links docs/ instead of copying. Does NOT run openspec update.

After implementation: validate with the openspec-roadmap-manager phase gate before archiving.
```

---

## Phase registry table schema

Use this table in the orchestrator's `design.md`. One row per phase.

| Fase | Change hijo | Bloque | Dependencia | Gate de validación | Docs a actualizar | Legacy a retirar | Estado |
|------|-------------|--------|-------------|-------------------|-------------------|-----------------|--------|
| {{phase-id}} | `{{prefix}}-{{phase-id}}-{{slug}}` | {{block-name}} | {{dep-phase-ids or «ninguna»}} | {{gate command / criterion}} | {{doc list}} | {{legacy list or «ninguno»}} | pendiente |

**Status values:** `pendiente` → `en curso` → `validada` → `archivada`.

**Naming convention:** `{{prefix}}-{{phaseid}}-{{slug}}` where:
- `{{prefix}}` = short domain identifier (same across all L2 changes of this roadmap).
- `{{phaseid}}` = short id matching the registry (e.g. `c1`, `g2`, `p0`).
- `{{slug}}` = brief kebab-case description of the phase work.

**Back-reference rule:** every L2 change `proposal.md` must include a line such as:
> `Orchestrator: {{orchestrator-name}} — Phase {{phase-id}}`

---

## Block validation strategy (generic)

Adapt the gate command/criterion column of the registry per block nature:

| Block type | Typical gate | Notes |
|---|---|---|
| **Domain model / type changes** | `npm run test:quick` (lint + typecheck + unit) | Each phase independently passes lint and type checks |
| **Service / integration layer** | `npm run test` (full unit + integration suite) | Integration tests must hit real collaborators, not mocks |
| **E2E / correlation** | E2E suite + correlation/identity/close scenarios | Use a dedicated E2E command; define expected scenario ids in orchestrator specs/ |
| **Persistence / layout** | Structural subset of acceptance matrix | Define specific acceptance scenario ids in orchestrator specs/ for each persistence phase |
| **Documentation / spike (no src/ changes)** | Doc coherence review (no automated gate) | Use openspec-verify on the change; doc-only phases may skip automated test gates |
| **Close-out (E2E global)** | Full acceptance matrix + no legacy grep | All phases archived; grep for zombie references; docs reflect final state |

Do not hardcode scenario ids or test case numbers in this template. Define them in the orchestrator's governance `specs/` as verifiable Given/When/Then requirements.
