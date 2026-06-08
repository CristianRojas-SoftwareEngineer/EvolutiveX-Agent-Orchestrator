---
name: openspec-roadmap-manager
description: >
  Decompose a large set of high-level changes into a two-level OpenSpec roadmap: one L1 orchestrator
  change (governance only) + N L2 phase changes (1:1 to phases, chained, iterative, incremental),
  with phase registry, documentary governance, and a pre-archive gate. Use when the user wants to
  descomponer cambios, migración por fases, changes encadenados iterativos incrementales,
  orquestador de changes, hoja de ruta openspec, roadmap de migración, gate de fase,
  validar antes de archivar fase, construir orquestador, crear change de fase.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: Cristián Rojas Arredondo
  version: "1.0"
---

# OpenSpec Roadmap Manager

<!-- Instructions: English; user I/O: Spanish — see language_policy in artifact-structuring -->

<user_communication>
Ask, confirm, and respond to the user in **Spanish** (native Spanish-speaking audience). Keep this artifact's instructions in **English** for token efficiency. Canonical policy: `<language_policy>` in [.claude/skills/artifact-structuring/SKILL.md](../artifact-structuring/SKILL.md). User-facing rules: [AGENTS.md](../../../AGENTS.md) §0. Keep standard technical terms in English when clarity benefits (e.g. gate, change, specs, roadmap, orchestrator).
</user_communication>

<overview>
Decompose a large set of high-level changes into a prescriptively governed two-level OpenSpec roadmap.

- **Input:** a set of high-level changes + source design document(s) + a base name for the orchestrator.
- **Output:** one L1 orchestrator change (governance only, no `src/` code) + N L2 phase changes (1:1 to phases), chained by dependency, iteratively created and implemented, with phase registry, documentary governance, and a pre-archive gate before each phase is closed.

This skill generalizes the process proven in the `gateway-migration` (C0–P2, closed 2026-06-01). It prescribes structure; it delegates all artifact creation to `openspec-propose`, implementation to `openspec-apply`, verification to `openspec-verify`, spec sync to `openspec-sync`, and archiving to `openspec-archive`.
</overview>

<repo_context>
Two-level model:

- **L1 orchestrator change** (e.g. `<name>-migration`, `<name>-roadmap`): governance only. Owns the phase registry and the per-phase Definition of Done (DoD). Never touches `src/`.
- **L2 phase changes** (e.g. `<prefix>-<phaseid>-<slug>`): map 1:1 to implementation phases; contain the real code work.

**Location of L2 phase changes (CRITICAL).** Each L2 phase change lives at the OpenSpec-indexed path
`openspec/changes/<phase-change-name>/` (sibling of the L1 orchestrator at `openspec/changes/`). The
OpenSpec CLI indexes changes by name at that root path; moving an L2 into a subfolder of the
orchestrator (e.g. `openspec/changes/<orchestrator>/phases/<l2>/`) breaks `openspec list`,
`openspec validate`, `openspec-apply`, `openspec-archive` and the verification chain for that L2
because the CLI cannot resolve the change. **Do not nest L2 directories inside the L1 folder during
the phase loop.** The L2 stays at `openspec/changes/<l2>/` for its full lifecycle: scaffold →
propose → apply → gate → sync → archive. Only at the very end of the roadmap (Phase 4 — close-out)
is the L2 physically moved under the orchestrator's archive folder together with the L1 archive
itself, as part of `openspec-archive` on the L1. Treating the nested layout as a runtime
convention (rather than a post-archive layout) is what caused the prior indexing breakage.

Sources of truth this skill reads:

- **DoD criteria per phase** → the orchestrator's governance `specs/` (single contract).
- **Phase dependency graph (DAG)** → the registry table in the orchestrator's `design.md`.

This skill **delegates** to:

- [openspec-verify](../openspec-verify/SKILL.md) — per-change completeness/correctness/coherence. The `<phase_gate>` reuses its findings verbatim; never re-implements them.
- [openspec-propose](../openspec-propose/SKILL.md), [openspec-apply](../openspec-apply/SKILL.md), [openspec-sync](../openspec-sync/SKILL.md), [openspec-archive](../openspec-archive/SKILL.md) — creation, implementation, sync, archive.

Invocation model: see `<invocation_model>` in [openspec-specialist](../openspec-specialist/SKILL.md). Never run `openspec update` / `openspec init --force`.
</repo_context>

<when_it_applies>
## When it applies

**Use this skill** when:

- There is a large set of high-level changes with internal dependencies that cannot safely be applied as a single change.
- There is a risk of regression across phases that requires validated, incremental delivery.
- The work involves multiple layers (domain → services → operations → API → UI) and coordination across them needs governance.
- The user mentions: descomponer cambios, migración por fases, orquestador de changes, roadmap, gate de fase, construir en orden iterativo-incremental.

**Do not use this skill** when:

- The change is a single, self-contained unit → use `openspec-propose` directly.
- The set of changes is small and has no internal dependency risk → use `openspec-propose` per change.
- The user only needs to validate one already-existing phase before archiving → jump to `<phase_gate>`.
</when_it_applies>

<inputs>
## Inputs

- **Set of high-level changes** (description or source design document with sections enumerating them).
- **Source design document(s)** — link by path/section; do not copy content into the orchestrator.
- **Base name for the orchestrator** — convention: `<domain>-migration` or `<domain>-roadmap`. L2 names follow `<prefix>-<phaseid>-<slug>` (e.g. `auth-p1-token-model`).
- **Orchestrator change name** — if already exists, infer from `openspec list`; do not re-create.
- **Phase change name** (for gate mode) — default: infer from conversation. If ambiguous, run `openspec list --json` and ask the user to choose. Do NOT auto-select.
</inputs>

<workflow>
## Workflow — 4 phases

### Phase 1: Analysis and decomposition

Derive from the high-level change set:

1. **Atomic phases** — each phase delivers one coherent capability or layer increment; it can be independently implemented and validated.
2. **Thematic blocks** — group related phases (e.g. Block C: correlation, Block G: domain refactor, Block P: persistence).
3. **Dependency DAG** — which phases must be archived before another can start.

Decomposition criteria:

- **Vertical cut:** each phase adds a slice of working functionality or a complete layer refactor, not a partial horizontal cut that leaves the system broken.
- **Incremental:** each phase can be implemented, verified, and archived independently.

Quality analysis of the decomposition:

- **Coherence** — every phase is traceable to at least one high-level objective.
- **Consistency** — no two phases own overlapping capability scope; if overlap exists, merge or boundary-clarify.
- **Completeness** — the union of all phases covers the full initial change set; gaps → CRITICAL, confirmed-future → note in orchestrator `proposal.md` as out-of-scope.

Deliver to the user: a decomposition table (phase → block → dependency → gate → docs → legacy → status) before proceeding to Phase 2. Ask for confirmation before building the orchestrator.

### Phase 2: Build the L1 orchestrator

Use `openspec-propose` with the orchestrator template from [references/templates.md](references/templates.md) (Orchestrator L1 template).

The orchestrator change:

- Defines the phase registry (table: phase · child change · block · dependency · validation gate · docs to update · legacy to retire · status).
- Defines the per-phase DoD in governance `specs/` (Given/When/Then requirements).
- Defines naming convention for L2 changes and the back-reference rule.
- Never touches `src/`; it is governance-only.
- Uses schema `spec-driven`; artifacts in Spanish per `openspec/config.yaml`.

Do NOT create all L2 phase changes upfront. The registry enumerates them; each is created at the start of its phase.

### Phase 3: Phase loop (in dependency order)

For each phase, in DAG order (prerequisites first):

1. **Verify dependencies satisfied** — confirm all prerequisite phases are archived in `openspec/changes/archive/`. If not, block and report.
2. **Create L2 phase change** — if it does not already exist, use `openspec new change <l2-name>` /
   `openspec-propose` so that the change is scaffolded at `openspec/changes/<l2-name>/` (the
   OpenSpec-indexed root path). See `<repo_context>` § "Location of L2 phase changes (CRITICAL)":
   **do not** move or nest the L2 inside the orchestrator's folder during the phase loop. If the
   directory already exists at `openspec/changes/<l2-name>/`, use `openspec validate <l2-name>`
   instead of re-creating.
3. **Implement** — `openspec-apply` on the phase change, respecting PKA layer order (domain → services → operations → API → UI) within each phase.
4. **Gate** — run `<phase_gate>` on the phase change. Must be **PASS** before proceeding.
5. **Spec sync** — if the phase modifies agreed behavior, run `openspec-sync` to promote deltas to `openspec/specs/`.
6. **Update docs** — update each doc listed in the registry row for this phase to reflect the actual post-phase state. A doc claiming "done" for unbuilt work is a CRITICAL gate violation.
7. **Retire legacy** — remove or explicitly deprecate (with retirement date) every code/doc element the registry lists as legacy for this phase.
8. **Archive** — `openspec-archive` on the phase change.
9. **Update registry** — mark the phase status as `archivada` in the orchestrator's registry table; commit.

### Phase 4: Roadmap close-out

When all L2 phases are archived:

1. **E2E verification** — run `openspec-verify` globally; all Completeness/Correctness/Coherence checks must pass.
2. **No legacy/zombie** — grep for any dangling references to retired code or docs.
3. **Docs reflect final state** — every doc updated in the registry reflects post-roadmap reality.
4. **Archive orchestrator** — `openspec-archive` on the L1 orchestrator change. This is the
   **only** moment when the L1 and L2 directories are physically moved into
   `openspec/changes/archive/<date>-<orchestrator>/` together. Never move L2 directories
   under the L1 folder before this step.
5. **Commit** with a message describing the roadmap close-out (Spanish, per conventional-commits).
</workflow>

<phase_gate>
## Phase gate (pre-archive check)

Run this gate when the user wants to validate one L2 phase change before archiving it. The gate is **read-only**: it proposes fixes with `file:line` references but never applies them.

**Precondition:** the L1 orchestrator must exist with its governance `specs/` and registry `design.md`. If missing, report «no verificable» instead of guessing.

### 6 checks

**Check 1 — Per-change verification (delegate to openspec-verify)**

Invoke [openspec-verify](../openspec-verify/SKILL.md) on the phase change. Reuse its Completeness / Correctness / Coherence findings and severities verbatim. Do not duplicate that logic.

**Check 2 — Phase traceability**

Confirm the phase change's `proposal.md` declares:
- Its phase id (e.g. `P1`, `C2`).
- An explicit back-reference to the orchestrator change name.
- That the phase id exists in the orchestrator registry.

Missing link or unknown phase → CRITICAL.

**Check 3 — Dependency gate**

From the orchestrator registry DAG, confirm every prerequisite phase is already `archivada`. A phase verified before its prerequisites are archived → CRITICAL.

**Check 4 — Definition of Done**

For each governance requirement in the orchestrator `specs/` that applies to this phase, map requirement → evidence (validation command passed, scope respected, tests green). Any unmet DoD requirement → CRITICAL.

Read DoD only from the orchestrator's governance `specs/`. Do not invent criteria. Do not hardcode project-specific section numbers or test case IDs here; those belong in the orchestrator's own specs.

**Check 5 — Documentation sync**

For each doc the registry lists for this phase, confirm it reflects reality after the phase. Grep affected docs and changed code areas. Stale/contradictory docs → WARNING. A doc claiming "implemented/done" for unbuilt work → CRITICAL.

**Check 6 — Legacy / zombie reduction**

Confirm code/doc replaced by this phase was removed or explicitly marked deprecated (with retirement date). Look for dangling imports, duplicated doc sections, and obsolete references introduced by the phase. Residue → WARNING.

### Verdict

Combine all checks into **PASS** / **FAIL**. FAIL if any CRITICAL exists across any check.

Severity conventions (reused from openspec-verify): prefer SUGGESTION > WARNING > CRITICAL when uncertain, except for the CRITICAL cases listed in each check above.

### Optional: delegate heavy verification to a read-only sub-agent

**Default mode is inline** — run all 6 checks in the main thread. In long roadmaps the main thread accumulates many `propose → apply → verify` cycles, and the gate's fan-out steps (Check 1 openspec-verify, Check 5 doc grep, Check 6 legacy/zombie scan) generate enough read-only noise to crowd out the working context.

When that context pressure is real, delegate **only** those fan-out checks to a read-only sub-agent (e.g. an `Explore`-style agent, no write tools):

- **Pass it:** the phase change name + orchestrator change name (so it can read the registry DAG and governance `specs/`).
- **It returns:** only the structured findings per check (issue + severity + `file:line`), not the raw search output.
- **The main thread keeps ownership of:** Checks 2–4 (cheap reads of the orchestrator contract), the final PASS/FAIL verdict, and all user-facing output in Spanish per `<output_format>`. The sub-agent never applies fixes (the gate is read-only) and never emits the verdict itself.

Escalate to this mode only when context cost is a **measured** problem in the current roadmap, not preventively (see `<guardrails>`).
</phase_gate>

<output_format>
## Output format

All output delivered to the user **in Spanish**.

### A — Decomposition table (Phase 1 output)

<output_template_decomposition>
## Descomposición del roadmap: {{orchestrator-name}}

| Fase | Bloque | Dependencia | Gate de validación | Docs a actualizar | Legacy a retirar | Estado |
|------|--------|-------------|-------------------|-------------------|-----------------|--------|
| {{phase-id}} — {{slug}} | {{block}} | {{deps or «ninguna»}} | {{gate command / criterion}} | {{doc list}} | {{legacy list or «ninguno»}} | pendiente |

**Coherencia:** {{observation}}
**Consistencia:** {{observation}}
**Completitud:** {{observation or gaps}}
</output_template_decomposition>

### B — Phase gate report

<output_template_gate>
## Gate de fase: {{phase-change-name}}

**Veredicto:** {{PASS | FAIL}}

| Comprobación | Estado |
|---|---|
| Verificación por-change (openspec-verify) | {{ok / issues}} |
| Trazabilidad de fase | {{ok / CRITICAL}} |
| Gate de dependencias | {{ok / CRITICAL}} |
| Definición de Hecho (specs orquestador) | {{ok / CRITICAL}} |
| Sync documental | {{ok / WARNING / CRITICAL}} |
| Reducción de legacy/zombie | {{ok / WARNING}} |

### CRITICAL (bloquean el gate)
- {{issue}} → {{recomendación accionable, file:line}}

### WARNING
- {{issue}} → {{recomendación}}

### SUGGESTION
- {{issue}} → {{recomendación}}

**Cierre:** {{si FAIL: corregir CRITICAL antes de archivar | si PASS: listo para archivar la fase}}
</output_template_gate>
</output_format>

<guardrails>
- Delegate to existing skills; never re-implement their logic.
- **L2 phase changes MUST live at `openspec/changes/<l2-name>/` during the phase loop.** Never
  move or nest them inside the orchestrator folder (e.g. `openspec/changes/<orchestrator>/phases/<l2>/`)
  before the L1 archive step at roadmap close-out. Doing so breaks the OpenSpec CLI index for the
  L2 (`openspec list`, `validate`, `apply`, `archive` all fail with "change not found") and
  invalidates the phase gate. The nested layout is a **post-archive** convention, not a runtime one.
- Gate is read-only: propose fixes with `file:line`, never apply them.
- Read DoD only from the orchestrator's governance `specs/`; never hardcode project-specific criteria here.
- Back-reference to the orchestrator is mandatory in every L2 change's `proposal.md`.
- Create phases incrementally: one L2 change per phase, created when that phase begins. Do NOT create all L2 changes upfront.
- If the orchestrator does not exist or its specs are missing → report «no verificable».
- If a phase change directory already exists under `openspec/changes/`, do not re-run `openspec-propose` on it; use `openspec validate <change-name>` instead.
- Never run `openspec update` / `openspec init --force`.
- Templates for the orchestrator and phase changes live in [references/templates.md](references/templates.md).
- Gate runs inline by default. Delegating the fan-out checks to a read-only sub-agent (see `<phase_gate>` § "Optional: delegate heavy verification") is an escalation for measured context pressure in long roadmaps, not a preventive default; the main thread always owns the verdict and the Spanish output.
</guardrails>

## Examples

**Example — full roadmap decomposition:**
Input: «quiero descomponer los cambios del sistema de autenticación en fases encadenadas» + design doc.
Output: Phase 1 decomposition table with phases, blocks, deps, gates, and docs; then prompt to confirm before building the orchestrator with `openspec-propose`.

**Example — phase gate (concrete):**
Input: «valida la fase auth-p2 antes de archivarla» (orchestrator `auth-migration`).
Output: Spanish gate report; FAIL because `auth-p1` is not yet archived (Check 3 CRITICAL) and `docs/auth-model.md` still claims old layout (Check 5 CRITICAL), with `file:line` recommendations.

**Example — gate: only one phase to validate:**
Input: «gate de la fase auth-p1» where auth-p1 has no dependencies.
Output: PASS if openspec-verify passes, back-reference present, DoD met, docs updated, no legacy residue.
