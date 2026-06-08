---
name: openspec-apply
description: >
  End-to-end apply flow for an OpenSpec change: select → apply → verify →
  sync specs → sync docs → archive → commit, with CRITICAL/WARNING/SUGGESTION
  gates inherited from openspec-verify at every step. Use when the user
  invokes /openspec-apply or wants to drive a single change through the full
  close-out cycle. Also trigger for implementar cambio openspec, aplicar
  tareas, cerrar change end-to-end, aplicar y archivar, ciclo completo de
  apply, continuar implementacion.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "2.0"
  generatedBy: "1.3.1"
---

<overview>
End-to-end apply flow for a single OpenSpec change: select → apply → verify →
sync specs → sync docs → archive → commit, with CRITICAL/WARNING/SUGGESTION
gates inherited from openspec-verify.
</overview>

<user_communication>
Ask, confirm, and respond to the user in **Spanish** (native Spanish-speaking audience). Keep this artifact's instructions in **English** for token efficiency. Canonical policy: `<language_policy>` in [artifact-structuring](../artifact-structuring/SKILL.md). User-facing rules: [AGENTS.md](../../AGENTS.md) §0.
</user_communication>

<repo_context>
Workflow delivery in this repo: `.claude/skills/openspec-apply/` only. Invocation: see `<invocation_model>` in [openspec-specialist](../openspec-specialist/SKILL.md).

<delegation_map>
The skill runs mostly inline; only the archive step is delegated. Reasoning:

- **verify** (inline): a single change produces bounded context; the main thread needs the findings to drive the gate decision and to feed the commit message. Delegation would add round-trip latency for the verdict without freeing significant context.
- **sync specs** (inline): the existing `openspec-sync` is already agent-driven; re-delegating to a sub-agent would re-launch the same logic in a different thread. Inline reuses the active context.
- **sync docs** (inline): no dedicated skill exists; this is bespoke and must use the active context (Impact section + grep results).
- **archive** (delegated via Task tool): encapsulates its own status check, sync re-prompt, and `mv`. The main thread just needs the resulting summary. Delegation prevents the apply workflow from re-implementing archive logic.
- **commit** (inline): the conventional-commits message must reflect the change's own diff; this is part of the apply context.
</delegation_map>
</repo_context>

<workflow>
End-to-end apply flow for a single OpenSpec change. Seven steps run in
**strict order**: select → apply → verify → sync specs → sync docs → archive
→ commit. Every step ends with a gate (see `<gate_definitions>`); CRITICAL
pauses, WARNING asks for confirmation, SUGGESTION is logged and the flow
continues.

**Input**: Optionally a change name. If omitted: infer from conversation
context; if ambiguous, run `openspec list --json` and prompt with the
**AskUserQuestion tool**.

**Anunciar siempre** al iniciar: «Usando change: `<name>`. Para aplicar otro
change, ejecuta `/openspec-apply <otro-nombre>`.» (Una sola vez, antes del
Step 1.)

---

### Step 1 — select

1.1. **Resolve the change name** (existing logic preserved):

   - If provided by the user → use it.
   - Else infer from conversation context.
   - Else `openspec list --json` → **AskUserQuestion** for the user to pick.
   - **Never auto-select** a non-singleton when ambiguous.

1.2. **Read the schema and tasks** (gate-free, read-only):

   ```bash
   openspec status --change "<name>" --json
   openspec instructions apply --change "<name>" --json
   ```

   Parse:
   - `schemaName` (typically `spec-driven`).
   - `contextFiles` — list of all planning artifact paths to read.
   - `progress.total` / `progress.complete` / `progress.remaining`.
   - `state`: `blocked` · `in_progress` · `all_done`.

1.3. **Read every path under `contextFiles`** (proposal, specs, design,
     tasks). For each, record: capability, Impact section of `proposal.md`
     (used later in Step 5 doc sync), and the tasks list (used in Step 2).

1.4. **Render the session header** with `apply_progress_block` (see
     `<output_templates>`).

1.5. **Early gate (state)**:
   - `state: "blocked"` → **PAUSE_BLOCK**; suggest `openspec-continue` to
     complete missing artifacts first.
   - `state: "all_done"` at this point means planning is done but the
     tasks have already been checked off (uncommon); continue to Step 2
     anyway — Step 2 will be a no-op and Step 3 (verify) is still useful.

---

### Step 2 — apply

2.1. **Show progress header** (use `apply_progress_block` summary form).

2.2. **Implement loop** (preserve existing logic, but with explicit
     per-task progress rendering):

   For each task still marked `- [ ]` in `tasks.md`:
   - Render «Working on task N/M: <description>».
   - Make the code changes required (minimal, focused, AGENTS.md §2/§3).
   - Mark the checkbox `- [x]` **immediately** on completion of that task.
   - Render «✓ Task complete» (`apply_progress_block` per-task form).

2.3. **Per-task pause conditions** (carry-over from existing skill):
   - Task description ambiguous → **PAUSE_BLOCK**.
   - Implementation reveals a design flaw → either fix the
     implementation to match `design.md`, OR update `design.md` in the
     change directory to reflect the actual decision made. Do not silently
     diverge — the archived design must match reality. **PAUSE_BLOCK** for
     confirmation of the chosen path.
   - Build / typecheck / test failure that is not a typo → **PAUSE_BLOCK**.
   - User interrupts → stop the loop, summarize progress, wait.

2.4. **End-of-apply gate**:
   - Recount `- [x]` vs `- [ ]` in `tasks.md`.
   - If all tasks complete → continue to Step 3.
   - If incomplete tasks remain (voluntary pause, not a hard error) →
     **PAUSE_BLOCK** with the three options:
     1. Continuar aplicando las tasks restantes.
     2. Marcar las pendientes como hechas (sólo si ya están
        implementadas por código).
     3. Abortar el flujo de apply (no se hace verify, sync, archive,
        commit).

2.5. **Render end-of-apply summary** with `apply_progress_block`
     (completion form).

---

### Step 3 — verify

3.1. **Delegate? No — inline.** Run the verification logic from
     [openspec-verify](../openspec-verify/SKILL.md) directly. Reasoning in
     `<delegation_map>`.

3.2. **Drive the three dimensions**:
   - **Completeness** — count `- [x]` vs `- [ ]` in `tasks.md`; for each
     requirement in `openspec/changes/<name>/specs/`, search the codebase
     for evidence.
   - **Correctness** — map each requirement to file/line evidence; check
     scenario coverage.
   - **Coherence** — compare implementation to `design.md` decisions;
     flag pattern inconsistencies.

3.3. **Build the scorecard** (CRITICAL / WARNING / SUGGESTION per
     dimension). Use the `verify_scorecard_block` template.

3.4. **Verify gate**:
   - **CRITICAL ≥ 1** → **PAUSE_BLOCK**; cite each `file:line`; do **not**
     proceed to sync / archive / commit until the user fixes or
     explicitly overrides.
   - **WARNING ≥ 1, no CRITICAL** → render the warnings, then ask for
     confirmation to continue. The user may say «continuar» (proceed to
     sync) or «detener» (re-trabajar la implementación).
   - **Only SUGGESTIONs or clean** → log a one-line summary; continue.

3.5. The verdict feeds forward: the list of WARNING/CRITICAL items
     discovered here is **logged** in Spanish so the commit message can
     reference it.

3.6. **Reconcile coherence divergences** (mandatory when Coherence has
     WARNING or CRITICAL):

   For each coherence finding in the scorecard:
   a. **If the implementation is correct** (the design became stale):
      → **Option A (recommended)**: Edit `design.md` in the change
        directory to reflect the actual decision implemented. Append a
        `## Divergencias documentadas` section listing each point where
        the implementation diverged from the original design, with the
        justification for the divergence.

      → After editing, re-run the coherence check to confirm the
        scorecard is clean before proceeding.

   b. **If the design is correct** (the implementation has a bug):
      → **Option B**: Return to Step 2 and fix the implementation.

   c. **If the divergence is minor and intentional** (e.g., a simplified
      approach that achieves the same goal):
      → Document it in `design.md` under `## Divergencias documentadas`
        and continue.

   This step is **mandatory** when Coherence has WARNING or CRITICAL.
   The workflow must **not** proceed to Step 4 (sync) with a desynchronized
   `design.md`. The archived design must accurately represent what was
   actually built.

---

### Step 4 — sync specs & reconciled design (openspec/specs/)

4.1. **Verify design.md already reconciled**:

   - If Step 3 found coherence issues and Option A was chosen
     (design updated), `design.md` in the change directory is already
     synchronized with the implementation.
     → Log: «design.md reconciliado en Step 3» → continue to 4.2.

   - If Step 3 found no coherence issues → continue to 4.2.

4.2. **Inspect the delta spec surface**:

   ```bash
   ls openspec/changes/<name>/specs/ 2>/dev/null
   ```

   - If the directory is empty or absent → log a SUGGESTION («No hay
     delta specs; el flujo de sync es no-op») and skip to Step 5.

4.3. **Inline agent-driven merge** (per the pattern in
     [openspec-sync](../openspec-sync/SKILL.md)):

   For each capability `<cap>` with delta spec at
   `openspec/changes/<name>/specs/<cap>/spec.md`:
   - Read the delta spec (sections: `## ADDED Requirements`,
     `## MODIFIED Requirements`, `## REMOVED Requirements`,
     `## RENAMED Requirements`).
   - Read the main spec at `openspec/specs/<cap>/spec.md` (may not
     exist; create if missing).
   - Apply changes with intelligent merging (preserve scenarios not
     mentioned in the delta; allow partial updates per openspec-sync's
     "Key Principle").

4.4. **Idempotency re-check**: re-read the main spec and confirm the
     delta's intent is reflected. Drift between delta and main → SUGGESTION.

4.5. **Sync gate**:
   - Merge ambiguity (a `MODIFIED` requirement cannot be matched to an
     existing one with confidence) → **PAUSE_BLOCK**.
   - SUGGESTION (e.g., a `RENAMED` was applied as ADDED+REMOVED) → log
     and continue.

4.6. **Render `sync_summary_block`** with the list of capabilities
     updated and a statement that the change remains active (sync alone
     does not archive).

4.7. **Important invariant**: after Step 4, the change is **still
     active** (`openspec/changes/<name>/`), and `openspec/specs/` is
     already up to date. This is the precondition for Step 6 (archive) —
     the archive's own sync re-prompt should now be a no-op.

---

### Step 5 — sync docs (docs/)

There is no dedicated skill; this step is **inline and bespoke**.

5.1. **Build the doc candidate list** by combining two sources:
   - **From `proposal.md`**: the «Impact» table, rows whose
     «Archivos / sistemas» column mentions `docs/...` or a doc name
     that matches a file under `docs/`.
   - **From grep**: for each directory or filename touched by Step 2,
     `Grep` `docs/` for that term to discover docs that reference the
     modified area but are not yet listed in Impact.

5.2. **For each candidate doc, classify the gap**:
   - **Falso «done»**: doc asserts a behaviour is «implementado»,
     «hecho», «disponible», «soportado» and the implementation does
     not exist in the current `src/` after Step 2 → **CRITICAL**.
   - **Stale / contradictory**: doc describes a pre-change state
     (old API, old path, old module) → **WARNING**.
   - **Missing update**: doc should mention a new behaviour the change
     introduced (e.g., a new flag, a new env var) and does not → WARNING.
   - **No change needed** → skip silently.

5.3. **Edit existing docs only** (AGENTS.md §6 — do not create new
     files in `docs/` without explicit approval). Each edit:
   - Quote the line(s) being changed in the response.
   - Render the updated snippet for the user's review.
   - Apply the edit and re-read the file to confirm.

5.4. **Doc sync gate**:
   - **CRITICAL ≥ 1** → **PAUSE_BLOCK**. Do not continue to archive /
     commit while a doc claims something false. The user must either
     fix the doc, mark the claim as «pendiente», or explicitly override
     the pause.
   - **WARNING ≥ 1, no CRITICAL** → render the warnings; ask for
     confirmation to continue.
   - **Only SUGGESTIONs or clean** → log and continue.

5.5. **Render `doc_sync_block`** with: candidates checked, edits
     applied, and any remaining warnings explicitly acknowledged.

---

### Step 6 — archive (DELEGATED)

6.1. **Why delegate**: `openspec-archive` encapsulates its own status
     check, sync re-prompt, and dated `mv`. Re-implementing it inline
     would duplicate the skill and miss the sync re-prompt UX. Reasoning
     in `<delegation_map>`.

6.2. **Delegate via Task tool** with:

   - `subagent_type`: `"general-purpose"`.
   - `prompt`: a Spanish template instructing the sub-agent to:
     1. `Skill` → `openspec-archive` for change `<name>`.
     2. Pass it the fact that delta specs have **already been synced in
        Step 4** — so the archive's Step 4 sync re-prompt should appear
        as «no delta specs pendientes» / «specs ya sincronizadas».
     3. Return: the archive's final summary (change name, schema,
        target path `openspec/changes/archive/YYYY-MM-DD-<name>/`, sync
        result, and any warnings).
   - **Sub-agent must NOT** re-run the apply workflow or commit — only
     archive and report.

6.3. **Archive gate (from the delegated result)**:
   - **Archive failed** (target collision, missing artifacts after
     re-check) → **PAUSE_BLOCK**.
   - **Warnings from archive** (incomplete tasks, incomplete artifacts
     at the moment of archive) → preserve the archive skill's own
     behaviour: warn + confirm. The user may accept the archive as-is
     or cancel and return to a previous step.
   - **Clean** → continue.

6.4. **Render `archive_complete_block`**.

---

### Step 7 — commit

7.1. **Pre-commit gate — diff summary + confirmation**: render a
     Spanish summary of `git status --short` and
     `git diff --stat` (after the archive in Step 6, the working tree
     contains the code changes plus the new archive directory and the
     updated `openspec/specs/` files). Use **AskUserQuestion** to ask:
     1. Sí, commitear con el mensaje propuesto.
     2. Quiero revisar el diff completo primero.
     3. Quiero ajustar el mensaje antes de commitear.
     4. Abortar (no commitear todavía).

7.2. **Compose the commit message** per
     [conventional-commits](../conventional-commits/SKILL.md). Type
     and scope are derived deterministically:

   - **Type** from the change name prefix (case-insensitive):
     `fix-` → `fix`; `add-` → `feat`; `feat-` → `feat`;
     `update-`/`upgrade-` → `refactor`; `remove-`/`drop-` → `refactor`
     (or `refactor!` if the change is breaking);
     `refactor-` → `refactor`; `chore-` → `chore`; `docs-` → `docs`;
     `test-` → `test`; `ci-` → `ci`; `perf-` → `perf`;
     `build-` → `build`; `style-` → `style`; `revert-` → `revert`.
     No prefix or unknown → `feat`.

   - **Scope** from the change name (after stripping the type prefix)
     and from the proposal's Impact table:
     1. Take the first 1–2 kebab-case segments of the change name
        (e.g., `fix-cursor-mojibake-hook-payload` → `hooks`).
     2. If those segments are technical verbs/objects (e.g.,
        `mojibake`, `payload`), prefer the next noun segment
        (e.g., `hooks`).
     3. Cross-check with the most-mentioned PKA layer / module in
        Impact. If the dominant module is different (e.g., Impact
        lists `src/2-services/notifications/...` and the name
        suggests `hooks`), prefer the **module** if it is a single
        capability, else the **name-derived noun** (e.g.,
        `notifications`).
     4. Tie-break: `<domain>` from the closest main spec capability
        modified in Step 4.
     5. Fallback: `change`.

   - **First line**: `type(scope): <imperative Spanish, ≤72 chars, no
     trailing period>`. Derive the imperative from the change's
     `proposal.md` «What Changes» first bullet, rewritten in
     imperative, compressed.

   - **Body** in Spanish with the four mandatory blocks per
     conventional-commits: **Motivación**, **Propósito**, **Objetivos**,
     **Resumen de cambios**. Populate from:
     - **Motivación** → `proposal.md` «Why» section, condensed.
     - **Propósito** → `proposal.md` «What Changes» first paragraph.
     - **Objetivos** → bullet list of completed tasks from `tasks.md`
       (the `- [x]` lines), one bullet per task, in order.
     - **Resumen de cambios** → list of `src/` and `docs/` paths
       modified (from `git diff --stat`), plus the archive directory
       and synced `openspec/specs/` files.

7.3. **Render the full message in `commit_block`** and wait for the
     user's choice from 7.1.

7.4. **Execute the commit**:

   ```bash
   git add -A
   git commit -F - <<'EOF'
   <message>
   EOF
   ```

   Use a heredoc to keep the multi-line body intact without quoting
   hazards.

7.5. **Final confirmation** in Spanish: change name, commit hash (from
   `git rev-parse --short HEAD`), and a one-line summary of the seven
   steps that ran.

---

### Cross-step pause primitives

The workflow uses one common pause primitive referenced throughout:

- **PAUSE_BLOCK** (rendered via the `pause_block` template) is invoked
  on: incomplete tasks at end of apply (2.4), CRITICAL in verify (3.4),
  merge ambiguity in sync (4.4), CRITICAL in doc sync (5.4), archive
  warnings (6.3), pre-commit (7.1), and any blocker found mid-loop in
  Step 2 (2.3).

  Each PAUSE_BLOCK must show: the gate that fired, the specific
  findings (with `file:line` where applicable), and a small set of
  recovery options. Recovery options vary by step (see
  `<gate_definitions>` for the per-step matrix).

### Fluid integration

This skill is **fluid** with respect to the rest of the openspec
catalog: it can be invoked at any point where a change has tasks
(partially done, fully done, or pre-implementation). The 7-step
sequence is a **recommended path** for the close-out cycle, not a
phase lock. A user may invoke `openspec-verify` or `openspec-sync`
directly; this skill does not pretend exclusivity.
</workflow>

<gate_definitions>
Severities are reused from openspec-verify: prefer SUGGESTION > WARNING
> CRITICAL when uncertain, except for the explicit CRITICAL cases listed
below.

| Step | CRITICAL (pause / block) | WARNING (ask confirm) | SUGGESTION (log + continue) |
|------|--------------------------|-----------------------|------------------------------|
| 1 — select | `state: "blocked"` from `openspec status`; schema not resolved | — | — |
| 2 — apply | Build / typecheck / test failure; user explicitly aborts | Task description ambiguous, design flaw revealed mid-implementation, voluntary pause with incomplete tasks | Implementation deviates from `design.md` but works |
| 3 — verify | Any incomplete `- [ ]` task; any requirement in delta specs with no codebase evidence; any open CRITICAL from openspec-verify's three dimensions; spec/design divergence **not reconciled** via Step 3.6 | Spec/design divergence detected but reconciliation pending Step 3.6 decision; missing scenario coverage; coherence issues | Pattern inconsistencies, minor refactors |
| 4 — sync specs | — | Merge ambiguity (a MODIFIED requirement cannot be matched confidently) | Re-sync drift; RENAMED applied as ADDED+REMOVED; idempotency re-check shows minor diff |
| 5 — sync docs | Doc asserts «done / implemented / supported» for code that does not exist in current `src/` after Step 2; doc claims a feature is «disponible» when it was rolled back | Doc is stale or contradictory; doc missing a new behaviour introduced by the change; new doc needed (out of scope — escalate to user) | Doc could mention a related improvement, formatting nit |
| 6 — archive | Archive CLI fails (target collision, permissions); `openspec status` at archive time finds incomplete artifacts the user has not acknowledged | Incomplete tasks or incomplete artifacts at archive moment (archive's own pattern: warn + confirm) | — |
| 7 — commit | User picks «detener» or «revisar diff completo» | User wants to adjust the message; message exceeds 72 chars in first line; body missing one of the four Spanish blocks | Type prefix could be more specific (e.g., `refactor` vs `feat`) |

**Recovery options per gate** (the body of each PAUSE_BLOCK must include
these):

- **Step 2 / 3 / 5 — CRITICAL**:
  1. Aplicar el fix recomendado (volver a Step 2 con la corrección).
  2. Actualizar el artefacto OpenSpec correspondiente (proposal /
     specs / design / tasks) y reintentar verify. Para coherencia en
     Step 3: ejecutar Step 3.6 (Opción A: actualizar design.md).
  3. Sobrescribir el CRITICAL explícitamente (sé que está mal,
     continuar de todos modos).
  4. Abortar el flujo de apply.
- **Step 4 — sync ambiguity**:
  1. Mostrar el diff actual entre delta y main y reintentar el merge.
  2. Editar el delta spec para que sea inequívoco.
  3. Abortar el sync (continuar apply sin sync; reabrir manualmente).
- **Step 6 — archive warnings** (preserves openspec-archive UX):
  1. Archivar de todos modos.
  2. Corregir las tasks / artifacts pendientes y reintentar.
  3. Cancelar.
- **Step 7 — pre-commit**:
  1. Sí, commitear.
  2. Revisar diff completo.
  3. Ajustar mensaje.
  4. Abortar.

**Hard rule** (from openspec-archive, propagated): the archive step
must **never** be blocked on warnings. CRITICAL inside the archive
itself (CLI failure) does block. WARNINGs in archive are
informational and require a confirm, not a fix.
</gate_definitions>

<output_templates>
All blocks below are rendered to the user in **Spanish** with the
specific change's values substituted. The placeholders are English
because they live inside this artifact; the filled output is Spanish.

### apply_progress_block

Three renderings of the same template:

**Header (Step 1)**
```
## Aplicando: <change-name> (schema: <schema-name>)
## Progreso inicial: <complete>/<total> tasks completas
## Plan: select → apply → verify → sync specs → sync docs → archive → commit
```

**Per-task (Step 2)**
```
## Aplicando: <change-name>
## Progreso: <N>/<M> tasks completas

Trabajando en task <i>/<M>: <task description>
[...implementación en curso...]
✓ Task <i> completa
```

**Completion (Step 2 end)**
```
## Implementación completa

**Change:** <change-name>
**Schema:** <schema-name>
**Progreso:** <N>/<N> tasks completas ✓

### Completadas en esta sesión
- [x] Task 1 — <description>
- [x] Task 2 — <description>
- ...

Continuando con verificación.
```

**Pause-on-incomplete (Step 2 end with pending tasks)**
```
## Implementación pausada

**Change:** <change-name>
**Schema:** <schema-name>
**Progreso:** <k>/<N> tasks completas

### Tareas pendientes
- [ ] Task <k+1> — <description>
- [ ] Task <k+2> — <description>
- ...

### Opciones
1. Continuar aplicando las tasks restantes.
2. Marcar las pendientes como hechas (sólo si ya están implementadas).
3. Abortar el flujo de apply.
```

---

### verify_scorecard_block

```
## Verificación: <change-name>

### Scorecard
| Dimensión    | Estado                                           |
|--------------|--------------------------------------------------|
| Completeness | <X>/<Y> tasks, <R> requisitos en delta specs     |
| Correctness  | <M>/<R> requisitos con evidencia en código       |
| Coherence    | <follows / issues> con design.md                 |

### CRITICAL (bloquean el sync / archive)
- <issue> → <recomendación, file:line>
- ...

### WARNING
- <issue> → <recomendación>
- ...

### SUGGESTION
- <issue> → <recomendación>
- ...

**Veredicto:** <PASS con warnings | FAIL con CRITICAL>
**Siguiente paso:** <sync specs | pausa para corregir CRITICAL>
```

---

### sync_summary_block

```
## Specs sincronizadas: <change-name>

### Cambios aplicados a openspec/specs/
**<capability-1>**:
- Added: <requirement name>
- Modified: <requirement name> (<qué cambió, p. ej. "1 scenario añadido">)
- Removed: <requirement name> (si aplica)

**<capability-2>**:
- Created new spec file `openspec/specs/<capability-2>/spec.md`
- Added: <requirement name>

### Estado del change
- El change `<name>` permanece **activo** en `openspec/changes/<name>/`.
- `openspec/specs/` ya está al día; el archive posterior no debería
  requerir un segundo sync.

**Siguiente paso:** doc sync (Step 5).
```

(No-op variant when no delta specs:)
```
## Sync specs: no-op
El change `<name>` no tiene delta specs. Se omite el merge.
```

---

### doc_sync_block

```
## Doc sync: <change-name>

### Candidatos revisados
- `docs/<path-1>` — <gap classification>: <description>
- `docs/<path-2>` — sin cambios necesarios
- `docs/<path-3>` — descubierto por grep (no listado en Impact): <description>

### Ediciones aplicadas
- `docs/<path-1>` — <resumen del cambio, líneas ~L<old> → L<new>>
- ...

### CRITICAL (bloquean archive)
- `docs/<path-X>` afirma «<cita>» para funcionalidad no implementada.
  → <recomendación, file:line>

### WARNING
- ...

### SUGGESTION
- ...

**Siguiente paso:** archive (Step 6).
```

---

### archive_complete_block

```
## Archive completo

**Change:** <change-name>
**Schema:** <schema-name>
**Archivado en:** `openspec/changes/archive/YYYY-MM-DD-<name>/`
**Specs:** ✓ Sincronizadas en Step 4 (archive no requirió re-sync) /
            No delta specs / Sync omitido por el usuario en archive
**Warnings:** <lista o «ninguno»>

Todos los artefactos completos. Cambios preservados.
```

---

### commit_block

```
## Mensaje de commit propuesto

```
<type>(<scope>): <imperative Spanish, ≤72 chars, sin punto final>

Propósito
<por qué fue necesario el cambio, condensado de proposal.md «Why»>
<qué se busca lograr, de proposal.md «What Changes»>

Objetivos
- <task 1 completada, copy de tasks.md>
- <task 2 completada>
- ...

Resumen de cambios
- src/...: <qué se hizo>
- docs/...: <qué se actualizó>
- openspec/specs/<cap>: <qué se sincronizó>
- openspec/changes/archive/YYYY-MM-DD-<name>/: <change archivado>
```

### Diff resumido
<output de `git status --short` y `git diff --stat`>

### Opciones
1. Sí, commitear con este mensaje.
2. Quiero revisar el diff completo primero.
3. Quiero ajustar el mensaje.
4. Abortar (no commitear todavía).
```

---

### pause_block

Generic rendering used by Steps 2, 3, 4, 5, 6, 7 whenever a gate
fires. The `Gate` field, the `Findings` field, and the `Options` field
are filled by the step that invokes the pause.

```
## ⏸ Pausa: <step-name> — <gate-name>

**Change:** <change-name>
**Severidad:** <CRITICAL | WARNING>

### Hallazgos
<list of issues with file:line where applicable>

### Opciones
1. <opción 1, específica del step>
2. <opción 2>
3. <opción 3>
4. Abortar el flujo de apply.

¿Qué prefieres hacer?
```
</output_templates>

<guardrails>
## Structural

- Steps run in **strict order**: select → apply → verify → sync specs →
  sync docs → archive → commit. No step may be skipped; if a step is a
  no-op (e.g., no delta specs in Step 4), the workflow logs a
  SUGGESTION and continues.
- Each step ends with a gate from `<gate_definitions>`. CRITICAL pauses,
  WARNING asks confirmation, SUGGESTION logs.
- PAUSE_BLOCK (the `pause_block` template) is the single primitive for
  asking the user. The options offered must match the step's row in
  `<gate_definitions>`.
- The change remains **active** until Step 6 (archive) succeeds. Step 4
  (sync) does not archive; the workflow must not collapse them.

## Step-specific

- **Step 1 (select)**: never auto-select when ambiguous. Always announce
  the chosen change and the override path (`/openspec-apply <otro>`).
- **Step 2 (apply)**:
  - Mark each task's checkbox **immediately** after completing it
    (carries forward from the previous skill version).
  - Keep code changes minimal and scoped to each task (AGENTS.md §2, §3).
  - On design-issue discovery, suggest updating `design.md` rather than
    silently diverging.
- **Step 3 (verify)**: inherit and reuse openspec-verify's logic; never
  re-implement it. Three dimensions (Completeness, Correctness,
  Coherence) are non-negotiable.
- **Step 4 (sync)**: run inline, agent-driven. The merge is idempotent;
  re-running produces the same result.
- **Step 5 (doc sync)**: **edit existing docs only**. AGENTS.md §6
  forbids creating new files under `docs/` without explicit approval;
  surface the request to the user instead of writing a new file.
- **Step 6 (archive)**: delegate to `openspec-archive` via Task tool
  (`subagent_type: "general-purpose"`). Pass it the fact that Step 4 has
  already synced delta specs, so its own sync re-prompt is a no-op.
- **Step 7 (commit)**:
  - First line ≤72 chars, imperative, no trailing period.
  - Four Spanish blocks: **Motivación**, **Propósito**, **Objetivos**,
    **Resumen de cambios**.
  - The Type and Scope are derived deterministically (see workflow
    Step 7.2); never guess — use the rules.

## Language and communication

- Instructions in this file: **English** (per `<user_communication>`
  and `artifact-structuring`).
- All output to the user: **Spanish** (AGENTS.md §0).
- All `git commit` message content: **Spanish** (AGENTS.md §0,
  conventional-commits).

## Don'ts

- Do not run `openspec update` or `openspec init --force` (openspec-specialist
  `<maintenance>`).
- Do not create new files under `docs/`, `scripts/`, or `.claude/`
  during doc sync without explicit user approval (AGENTS.md §6).
- Do not bypass a CRITICAL gate by editing the gate table; fix the
  finding.
- Do not collapse Steps 4 and 6: sync first, then archive. Archive's
  own sync re-prompt is preserved; it should be a no-op after Step 4,
  but the prompt itself stays.
- Do not auto-select an ambiguous change (Steps 1, 2, 3, 4, 5, 6) —
  always use **AskUserQuestion** when the input is vague.
- Do not over-engineer the commit message scope: a noisy scope is
  worse than a generic `change` fallback.
</guardrails>
