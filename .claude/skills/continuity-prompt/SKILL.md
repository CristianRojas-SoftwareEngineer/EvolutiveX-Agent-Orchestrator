---
name: continuity-prompt
description: >
  Session continuity prompt across Claude Code compaction — generate before /compact
  or resume after. Use when the user mentions compactar, compactación, /compact,
  ventana de contexto llena, context window full, prompt de continuidad, continuidad
  de sesión, memoria de corto plazo, antes de compactar, después de compactar,
  reanudar tras compactar, resuming work after compaction, or preserving session
  context across compaction — even if they do not name this skill.
when_to_use: >
  /continuity-prompt generate|resume — or natural-language equivalents in Spanish
  or English (generar prompt de continuidad, guardar continuidad, reanudar sesión).
argument-hint: "[generate|resume] [optional custom path]"
---

# Session continuity prompt

<!-- <overview> -->
Generate a dense **continuity prompt** while the session still holds full short-term context (before `/compact`), persist it to disk, then **read that file** after compaction to reactivate working memory. **File persistence is the primary transfer mechanism** between `generate` and `resume`; chat output is secondary (human review only). The continuity prompt **complements** the harness native compaction summary: the native summary keeps broad facts; this prompt preserves closed decisions, tacit insights, ordered next steps, and concrete source pointers that compaction usually dilutes.
<!-- </overview> -->

<!-- <table_of_contents> -->
## Contents

1. [How to operate this workflow](#how-to-operate-this-workflow)
2. [Mode routing](#mode-routing)
3. [Generate workflow (pre-compaction)](#generate-workflow-pre-compaction)
4. [Resume workflow (post-compaction)](#resume-workflow-post-compaction)
5. [Canonical output template](#canonical-output-template)
6. [Examples](#examples)
7. [Final verification](#final-verification)
<!-- </table_of_contents> -->

<!-- <user_communication> -->
Ask, confirm, and respond to the user in **Spanish** (native Spanish-speaking audience). Keep this artifact's instructions in **English** for token efficiency. Canonical policy: `<language_policy>` in [.claude/skills/artifact-structuring/SKILL.md](../artifact-structuring/SKILL.md). User-facing rules: [AGENTS.md](../../../AGENTS.md) §0. The **continuity prompt body** and **resume report** are user-facing deliverables — write them in Spanish.
<!-- </user_communication> -->

<!-- <operation> -->
## How to operate this workflow

**Harness tooling (reflective, not mechanical)**: this skill targets Claude Code first but runs in any agentic harness. Map these capabilities to local equivalents: structured user questions (`AskUserQuestion`), file read/write for persistence, workspace inspection (`git status`, file reads), and slash-command arguments (`$ARGUMENTS`).

**Primary transfer mechanism — file on disk**:

```
generate  →  write .claude/continuity-prompt.md  →  /compact  →  resume  →  read same file
```

**Canonical path**: `.claude/continuity-prompt.md` at the repository root (overwrite on each `generate`). Override only with an explicit custom path in `$ARGUMENTS`.

**Two modes** — see `<routing>`:

| Mode | When | Primary deliverable |
|------|------|---------------------|
| `generate` | Before compaction, context still full | File on disk (`.claude/continuity-prompt.md`) |
| `resume` | After compaction | Read persisted file → resume report → resumed work |

Chat may show the prompt body after `generate` for human review; **do not** treat paste-in-chat as the transfer channel — `resume` loads from disk.

Never commit `.claude/continuity-prompt.md` unless the user explicitly requests it. If the user asks about version control, recommend adding that path to `.gitignore` because it may contain session-specific context.
<!-- </operation> -->

<!-- <routing> -->
## Mode routing

Resolve mode from the user message, `$ARGUMENTS`, and conversation context:

1. **`resume`** when any of:
   - User says they already compacted or want to resume post-compaction.
   - `$ARGUMENTS` starts with `resume`.
   - User invokes `/continuity-prompt resume`.

2. **`generate`** when any of:
   - User announces imminent compaction, full context window, or asks to generate a continuity prompt.
   - `$ARGUMENTS` starts with `generate` or is empty on a pre-compaction invocation.
   - Default when compaction is upcoming and mode is unclear — **recommend `generate`** in the structured question.

3. **Ambiguous** (could be either): ask via structured question with your recommendation marked **(Recomendado)**. Do not guess.

**Argument parsing**: strip the leading `generate` or `resume` token from `$ARGUMENTS`. Optional remainder is a **custom file path** for both modes (default: `.claude/continuity-prompt.md`). Do not treat pasted prompt text in `$ARGUMENTS` as a transfer channel — the file is canonical.
<!-- </routing> -->

<!-- <generate_workflow> -->
## Generate workflow (pre-compaction)

Execute while the session still has full context — **before** the user runs `/compact`.

1. **Inventory from the live session** (facts only; never invent):
   - Active objective and current task (OpenSpec change, Agent Kanban task file, or stated user goal).
   - Verified progress (completed steps, merged decisions, files already changed).
   - Closed design decisions and trade-offs with brief rationale.
   - Non-obvious session insights (repo quirks, harness behavior, domain learnings).
   - In-flight state: key files, pending commands, verification not yet run.
   - Blockers and genuinely open questions (not already decided).
   - Ordered next steps (concrete, executable).
   - Anti-patterns: dead ends, discarded approaches, "do not redo X".
   - **Re-readable sources**: prefer `path` or `path:line` over vague summaries.

2. **Draft the continuity prompt** using the canonical template in `<output_template>`. Keep it **compact but dense** — target well under post-compaction re-attachment budgets (~5000 tokens per invoked skill after compaction).

3. **Persist (mandatory — primary deliverable)**: overwrite `.claude/continuity-prompt.md` using `npm run continuity:write` with the content as an argument. **Do NOT use the Write tool** — it requires reading the file first, which is unnecessary overhead for a session-scoped overwrite. Use:

   ```bash
   npm run continuity:write -- "contenido del prompt"
   ```

   The `--` is required to separate npm arguments from the script argument. Works on bash, PowerShell, and cmd on Windows (no shell dependency).

   **Overwrite without reading first** — successive generates are independent sessions; the previous file is irrelevant. Do not ask for confirmation. This file is what `resume` will read after compaction.

4. **Confirm in chat**: one-line confirmation that the file was written (path only). Optionally show the full prompt in a fenced markdown block for human review — never skip step 3 in favor of chat-only delivery.

5. **Close with a brief reminder** in Spanish:
   - Run `/compact` when ready.
   - After compaction: invoke `/continuity-prompt resume` — it reads the persisted file automatically.
<!-- </generate_workflow> -->

<!-- <resume_workflow> -->
## Resume workflow (post-compaction)

Execute after compaction when working memory is sparse. **The persisted file from `generate` is the primary input** — read it from disk before any other action. The continuity prompt is an **authoritative briefing** that complements — does not replace — the harness native post-compact summary.

1. **Read the persisted file (mandatory first step)**:
   - Resolve path: custom path from `$ARGUMENTS` after `resume`, else `.claude/continuity-prompt.md`.
   - **Read the file from disk** with the file-read tool. Do not rely on chat memory of a prior `generate` output.
   - If the file is missing: stop and ask **in Spanish** whether to run `generate` first or provide an alternate path. Do not proceed with an empty or assumed prompt.
   - **Fallback only**: if the user explicitly pastes a full continuity prompt in the message *and* states the file is unavailable or stale, use the pasted text — but prefer re-running `generate` when possible.

2. **Parse** the loaded file content: objective, progress, decisions, insights, in-flight state, blockers, next steps, sources to re-read, do-not-repeat.

3. **Re-read every source** listed under «Fuentes a re-leer post-compactación» in the loaded file before mutating code or making new decisions. Skipping cited sources is not allowed.

4. **Reconcile with workspace**: inspect current state (`git status`, key files) and note divergences from the prompt (new edits, reverted files, branch changes).

5. **Deliver a short resume report** in Spanish:
   - **Contexto recuperado**: what was reactivated from the prompt.
   - **Estado verificado**: workspace facts after re-reading sources.
   - **Divergencias** (if any): prompt vs. current reality.
   - **Siguiente acción**: the concrete step 1 from «Próximos pasos», adjusted only if evidence requires it.

6. **Decision gate (sub-invoke resolve-open-decisions)**: the resume report surfaces a concrete next action, but the user must choose the direction before proceeding. Sub-invoke [resolve-open-decisions](../resolve-open-decisions/SKILL.md) with the following structure:
   - **Decision 1** (header: "Dirección del workflow"): "¿Cuál es el siguiente paso?"
     - **Opción A — Proceder con la acción recomendada (Recomendada):** seguir con el paso 1 de «Próximos pasos» tal como está definido en el prompt de continuidad.
       *Pros: acción ya analizada y cerrada, sin ambigüedad. Contras: no permite ajustar el alcance.*
     - **Opción B — Modificar la acción:** adaptar, reformular o reordenar los pasos pendientes antes de continuar.
       *Pros: permite refinar el alcance o la priorización. Contras: requiere definir cambios antes de proceder.*
     - **Opción C — Otra dirección:** describir una acción diferente, un workflow alternativo, o una prioridad que no esté cubierta en el prompt de continuidad.
       *Pros: máximo control sobre la dirección. Contras: la acción queda por definir y puede requerir investigación adicional.*
   After the user answers, proceed based on the choice:
   - **A → proceed** with the recommended step 1 as written in the prompt.
   - **B → ask** the user to specify what to change, update the step in memory, then proceed.
   - **C → ask** the user to describe their direction, then treat it as a new objective and proceed accordingly.
   Do **not** continue work until the decision is resolved. This gate is the bridge between the briefing and the execution — it replaces any inline "¿procedo?" in prose.
<!-- </resume_workflow> -->

<!-- <output_template> -->
## Canonical output template

Use this structure for the **generate** deliverable. Replace placeholders with session-specific content. Omit a section only when truly empty; never leave placeholder braces in the final output.

```markdown
# Prompt de continuidad — {{titulo_corto}}

## Objetivo activo
{{qué se está intentando lograr ahora}}

## Progreso verificado
{{hechos concretos ya logrados — no intenciones}}

## Decisiones y trade-offs cerrados
{{decisiones con breve justificación}}

## Insights de sesión
{{aprendizajes no obvios del repo, harness o dominio}}

## Estado en curso
- Tarea/archivo OpenSpec o Kanban: {{referencia}}
- Archivos clave: {{lista con paths}}
- Comandos o verificaciones pendientes: {{si aplica}}

## Bloqueadores y preguntas abiertas
{{solo lo no resuelto}}

## Próximos pasos (ordenados)
1. {{paso concreto}}
2. ...

## Fuentes a re-leer post-compactación
- `{{path}}` — {{qué buscar}}
- ...

## No repetir
{{anti-patrones, callejones sin salida, intentos descartados}}

---
Instrucción post-compactación: Ejecuta `/continuity-prompt resume` para leer este archivo desde disco. Revisa las fuentes listadas, valida el estado del workspace y continúa desde el paso 1 de «Próximos pasos» sin reabrir decisiones ya cerradas salvo nueva evidencia.
```

**Resume report headings** (separate deliverable, not the template above):

```markdown
## Contexto recuperado
## Estado verificado
## Divergencias
## Siguiente acción
```
<!-- </output_template> -->

<!-- <constraints> -->
## Constraints

- **Generate**: only facts from the current session; mark uncertainty explicitly (e.g. "no verificado en disco"); **overwrite via `npm run continuity:write -- "contenido"`** — not the Write tool; successive generates are independent sessions; **never skip the file write**.
- **Resume**: **read the persisted file from disk first** (mandatory); then re-read every source cited inside that file before code mutations. Do not substitute chat memory or pasted text when the file exists.
- **Density**: prefer pointers and verdicts over narrative; every line should earn its tokens.
- **No git**: do not stage or commit `.claude/continuity-prompt.md` without explicit user request.
- **Complementarity**: never claim the continuity prompt replaces native compaction — it extends it.
- **Language**: continuity prompt and resume report in Spanish; skill-internal reasoning may stay in English.
<!-- </constraints> -->

<!-- <examples> -->
## Examples

**Example 1 — generate**

Input: `/continuity-prompt generate`

Output: File overwritten via `npm run continuity:write -- "contenido"`; one-line path confirmation; optional fenced block for review; reminder: `/compact` → `/continuity-prompt resume`.

```bash
npm run continuity:write -- "# Prompt de continuidad
...
"
```

**Example 2 — resume**

Input: `/continuity-prompt resume` (`.claude/continuity-prompt.md` exists from a prior `generate`)

Output: **Read file from disk first**; parse content; re-read each path under «Fuentes a re-leer»; `git status`; resume report with «Siguiente acción» aligned to step 1 of the file; **sub-invoke resolve-open-decisions** (3-option gate: proceed / modify / other direction); continue work only after user resolves the decision.

**Example 3 — auto-trigger**

Input: «La ventana de contexto está llena y necesito seguir con el delta c00086.»

Output: Recognize pre-compaction intent; run `generate` workflow; overwrite `.claude/continuity-prompt.md` via `npm run continuity:write -- "contenido"`.
<!-- </examples> -->

<!-- <verification> -->
## Final verification

**Before delivering `generate`:**

1. Does the prompt include all non-empty template sections with real session content?
2. Are «Fuentes a re-leer» concrete paths (with line hints when helpful)?
3. Are closed decisions separated from open questions?
4. Is the prompt free of `{{placeholders}}`?
5. Was the file overwritten via `npm run continuity:write -- "contenido"` (not the Write tool)?
6. Was the post-compact reminder included?

**Before delivering `resume`:**

1. Was the persisted file read from disk with the file-read tool (not from chat memory)?
2. Was the resolved path stated (`.claude/continuity-prompt.md` or custom)?
3. Was every source cited inside the file re-read?
4. Was workspace state checked and divergences reported?
5. Is the resume report in Spanish with all four headings?
6. Was `resolve-open-decisions` sub-invoked with the 3-option gate before continuing work?
7. Did the execution branch match the user's answer (proceed / modify / other direction)?
8. Was the next action concrete and tied to the file's ordered steps?
<!-- </verification> -->
