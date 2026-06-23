---
name: create-plan
description: >
  Build plans with a canonical structure, agnostic to the process the plan serves:
  project context, table of contents, fundamental considerations, purpose and
  objectives, an execution phase (tasks ordered by dependency, each action line a
  concrete operation — mutation or read-only — against an explicit source), a
  dependency diagram with recommended execution order, and a closure phase that
  prescribes the post-execution walkthrough (process followed and any drift from the
  plan, with its reason). Delivers Spanish plans ready for execution by an agent in
  any harness.
when_to_use: >
  Invoke with /create-plan [requirements] or when the user explicitly asks to create a
  development plan, plan de desarrollo, plan de implementación, or asks for task
  dependencies or execution order in a plan (orden de ejecución, dependencias entre
  tareas). Builds the structure and minimum content of a good plan whatever the
  process it serves — mutation work, read-only analysis, or a mix of both.
argument-hint: "[requirements]"
---

# Workflow: Create plan

<!-- <table_of_contents> -->
## Contents

1. [How to operate this workflow](#how-to-operate-this-workflow)
2. [Canonical plan template (single source of truth)](#canonical-plan-template-single-source-of-truth)
3. [Content rules](#content-rules)
4. [Action line examples](#action-line-examples)
5. [Final verification before delivery](#final-verification-before-delivery)
<!-- </table_of_contents> -->

<!-- <user_communication> -->
Ask, confirm, and respond to the user in **Spanish** (native Spanish-speaking audience). Keep this artifact's instructions in **English** for token efficiency. Canonical policy: `<language_policy>` in [.claude/skills/artifact-structuring/SKILL.md](../artifact-structuring/SKILL.md). User-facing rules: [AGENTS.md](../../../AGENTS.md) §0.
<!-- </user_communication> -->

<!-- <operation> -->
## How to operate this workflow

**Harness tooling (reflective, not mechanical)**: this skill targets Claude Code first but is
written to run in any agentic harness. Before starting, survey the planning and interaction
**capabilities** your harness exposes and reflect on which fits each step below. The
capabilities this workflow relies on, named by function with their Claude Code incarnation as
the reference example: a read-only planning mode with explicit user approval (`EnterPlanMode`/
`ExitPlanMode`), structured user questions with options (`AskUserQuestion`), delegable
exploration or planning subagents (`Agent`), and task-list management (`TaskCreate`/
`TaskUpdate`). In another harness, map each capability to its closest equivalent; where one
has no equivalent, achieve the intent by other means (e.g. no plan mode → simply refrain from
editing and ask for explicit approval in the conversation) rather than skipping the intent.
Prefer a real tool over improvising its effect in prose: structured questions over inline
"¿quieres A o B?", plan-mode approval over pasting a plan and hoping, task tracking over a
mental checklist. This workflow is **interactive by design**: stopping to ask the user is
success, not failure.

**Sub-invoked mode**: when another skill invokes this one as a sub-step, follow the `<sub_invocation_protocol>` of [artifact-structuring](../artifact-structuring/SKILL.md). The skill stays agnostic to the invoker's workflow: it takes instructions, sources, and requirements from the invocation context, builds the plan to the canonical structure (whatever the process — mutation, read-only, or mixed), and the plan-approval gate is still presented to the user. The approved plan is handed off to the invoking flow, which owns any artifact it must update from it.

**Task tracking**: at any phase — discovery, drafting, or (when this plan drives execution)
execution and its closing walkthrough — trace work in progress with the harness task-list
tools: create tasks for the steps ahead, mark them in progress when started and completed when
verified. This gives the user visibility and prevents silently dropped steps.

1. **Requirements**: the user may pass plan requirements as `$requirements` (text after the slash command). In sub-invoked mode, requirements, sources, and constraints come from the invoker's context per the sub-invoked mode above. If `$requirements` is empty and no requirements appear elsewhere in the message, request them **in Spanish** (problem to solve, proposed improvement or functionality, restrictions, context to size scope) — prefer the structured-question capability with concrete options when the missing input is a bounded choice; free text otherwise — before generating anything. Never invent or assume requirements.
2. **Planning mode**: enter your harness's read-only planning mode (Claude Code: `EnterPlanMode`) before requirement analysis, source discovery, or drafting; without one, refrain from any edit until the plan is approved. Any execution the plan drives belongs to a separate flow unless the user explicitly requests execution in the same turn.
3. **Discovery**: resolve every target source from requirements and codebase layout — repo-relative files for mutation work, and repo files, URLs, or named external sources for read-only work. Delegate independent discovery tasks to exploration subagents when the harness offers them (Claude Code: `Agent` with `subagent_type: "Explore"`), in parallel when possible; consider a planning subagent when the strategy itself needs architectural design. If a required source cannot be resolved, **stop and ask** — never emit placeholder paths (`the file`, `relevant module`).
4. **Design decisions — mandatory pre-drafting clarification gate**: after completing discovery and **before drafting any plan section**, compile every unresolved decision point, ambiguity, competing strategy, and missing requirement surfaced by the requirements text and the discovered codebase. Surface them to the user via the harness's structured-question capability (Claude Code: `AskUserQuestion`). The canonical form-construction rules — how to phrase each question, order options (most to least recommended), declare trade-offs, handle batching, and weight by maintenance profile — are defined in [resolve-open-decisions](../resolve-open-decisions/SKILL.md) `<form_rules>`, `<batching>`, and `<gate>`; follow those definitions here (Pattern B: shared canonical reference, no duplication). Do not draft any section until the user has responded to every open question. If requirements are incomplete, add a free-text question rather than guessing. If a new decision point surfaces mid-draft, apply the same pattern: stop, present it as a structured question, resume only after the user decides. Do not resolve any decision unilaterally.
5. **Drafting order**: outline execution-task H3 titles first → derive the dependency graph between the outlined tasks (an edge only when one task needs results another produces) → sort topologically and renumber the tasks so list order **is** a valid execution order → write context → build the table of contents from the renumbered outline → write the remaining sections per `<plan_template>`, deriving «Dependencias y orden de ejecución» from the graph already built.
6. **Verify and deliver**: run `<verification>`, then deliver the complete plan in Spanish as a single well-structured markdown block. If you entered plan mode in step 2, close it through the harness's approval mechanism (Claude Code: `ExitPlanMode`) so the user reviews and approves the plan formally instead of an informal "¿procedo?". Do not omit any section even for small requirements — structural uniformity is part of this workflow's value, including both fixed phases. Do not mention harness tools, modes, subagents, or internal XML block names in the delivered plan.
7. **Execution and walkthrough**: when the approved plan is executed (in the same turn after approval, or in a later flow driven by this plan), the «Fase de cierre» of the plan is realized — close the execution with the post-execution walkthrough the plan prescribes (process followed and any drift from the plan, with its reason). Same leakage rule as the plan: no harness tools, modes, or internal XML block names in it.
<!-- </operation> -->

<!-- <plan_template> -->
## Canonical plan template (single source of truth)

The delivered plan follows this template exactly: H1 title plus the eight H2 sections below in fixed order — always all eight. Spanish prose throughout; repo paths unchanged. `{{...}}` marks variable content; literal text is fixed and must be delivered verbatim.

```markdown
# Plan: {{título descriptivo del plan}}

## Contexto del proyecto

{{Síntesis breve de la arquitectura y tecnologías del proyecto, suficiente para que
un agente que no conoce el proyecto se oriente al leer el plan.
Sin Acciones aquí. Nunca repetir contexto dentro de tareas individuales.}}

## Tabla de contenidos

- Contexto del proyecto
- Consideraciones fundamentales
- Propósito del plan
- Objetivos del plan
- Fase de ejecución
  - {{título H3 de cada tarea, uno por línea, en el orden recomendado de ejecución}}
- Dependencias y orden de ejecución
- Fase de cierre

## Consideraciones fundamentales para el razonamiento y diseño del plan

{{Consideraciones relevantes para el diseño del plan, derivadas del contexto del
proyecto y los requisitos. Cubrir al menos dos dimensiones:

1. **Madurez y dependientes**: estado actual del proyecto (desarrollo activo, producción,
   legacy, etc.) y existencia de usuarios o sistemas dependientes; implicaciones para el
   tratamiento de retrocompatibilidad, documentación histórica y código legacy.

2. **Estado canónico**: qué elementos deben permanecer en sincronía tras la ejecución
   (código fuente, documentación, configuración, artefactos del proyecto) y política para
   código o documentación que quede sin uso tras los cambios.}}

## Propósito del plan

{{Prosa continua con dos componentes en orden: primero la necesidad observada (bug,
clase de defecto, capacidad nueva, modificación de comportamiento o pregunta a
responder), después la propuesta de solución y su valor agregado (qué logra y qué
devuelve aplicarla). Sin Acciones aquí.}}

## Objetivos del plan

{{Metas verificables alineadas con el propósito. Solo describen trabajo de la fase de
ejecución; el recorrido post-ejecución no es un objetivo. Sin Acciones aquí.}}

## Fase de ejecución

### Tarea {{N}} — {{título con archivo o fuente principal en backticks cuando el alcance es acotado}}

#### Propósito

{{Prosa continua de la tarea: necesidad observada, luego propuesta de solución y su
valor agregado. Sin listas de archivos ni pasos de ejecución; no copiar el propósito
del plan.}}

#### Objetivos

{{Metas verificables que acotan la tarea, sin re-explicar el propósito.}}

#### Acciones

1. **`{{ruta/relativa/al/archivo o fuente}}`** — {{sección, bloque o aspecto}}: {{para mutación, el cambio concreto (add/remove/replace); para lectura, qué extraer o determinar}}.
2. {{...una línea numerada por archivo o fuente; misma forma obligatoria...}}

{{...repetir la estructura H3 + H4 por cada tarea...}}

## Dependencias y orden de ejecución

{{Diagrama Mermaid `flowchart TD` con un nodo por tarea de la fase de ejecución
(`T1["Tarea 1 — título corto"]`) y una arista `T1 --> T3` solo cuando la tarea destino
necesita resultados que la tarea origen produce (archivo creado o modificado, fuente
examinada, decisión tomada, estructura establecida). Las tareas sin aristas entre sí
quedan visualmente explícitas como independientes. Con una sola tarea: diagrama trivial
de un nodo.}}

{{Prosa breve posterior al diagrama que: (1) confirma que la numeración de las tareas
ya es el orden recomendado de ejecución, (2) identifica los grupos de tareas
paralelizables (sin dependencias mutuas) cuando existen, o declara que no hay
dependencias entre tareas cuando el grafo no tiene aristas. La fase de cierre no es una
tarea y no participa del diagrama.}}

## Fase de cierre

Al terminar la ejecución, redactar el **Recorrido (walkthrough)** post-ejecución como
apertura del mensaje final, en español, con dos componentes en orden: (1) **Proceso
seguido** — qué tareas se ejecutaron y en qué orden; (2) **Desviaciones respecto al
plan** — toda divergencia entre el plan aprobado y la ejecución real (tareas adaptadas,
acciones añadidas u omitidas, archivos o fuentes tocados fuera de las líneas de Acción
planificadas, cambios de orden respecto al orden recomendado), cada una con su motivo;
o una nota explícita de que la ejecución coincidió con el plan sin desviaciones. Esta
fase no tiene Acciones ni produce mutaciones: prescribe el reporte que cierra la
ejecución.
```

Heading hierarchy is fully encoded above: H2 only the eight sections in template order; H3 for execution tasks; H4 (`Propósito`, `Objetivos`, `Acciones`) only under execution tasks; «Dependencias y orden de ejecución» and «Fase de cierre» have no H3s or H4s.
<!-- </plan_template> -->

<!-- <content_rules> -->
## Content rules

Structural invariants and semantics the template cannot enforce by shape alone:

- **Two-fixed-phase H2 structure (skill rule — never plan content)**: the delivered plan follows the flat H2 structure exactly as encoded in `<plan_template>`: contexto → tabla de contenidos → consideraciones fundamentales → propósito del plan → objetivos del plan → fase de ejecución → dependencias y orden de ejecución → fase de cierre (eight H2s, always present), with the table of contents after context and before considerations. Each execution task declares Propósito, Objetivos, and prescriptive Acciones as H4. The closure phase is always a single fixed prescription (the post-execution walkthrough), never a list of stages. These are generation rules for this skill: do **not** restate them inside the delivered plan (e.g. as a fundamental consideration or any other self-referential structural note).
- **Propósito (plan and per task)**: one header whose continuous prose covers two components in order — the **observed need** (what was seen, missing, failing, or to be answered: bug, defect class to prevent, new capability, change to existing behavior, or question to resolve) and the **proposed resolution with its added value** (what applying it achieves and returns). Never split these components into separate headings, and never reduce them to a single vague sentence that conveys only one component.
- **Objetivos**: verifiable goals that bound work at their level; they do not re-explain the Purpose. Plan-level objectives describe only execution-phase work; the post-execution walkthrough is not an objective.
- **Acciones (unified grammar)**: numbered list where **every** line starts with an explicit source in backticks — a repo-relative file path for mutation work, or a repo-relative path, URL, or precisely-named external source for read-only work — then the section/block/aspect (XML tag, heading, function, line range, or facet to examine), then a concrete verb-final clause: for a mutation, what to add, remove, or replace; for a read-only line, what to extract or determine — never a restatement of the objective. One primary source per line; split multi-source work into one line per source. Actions exist **only** inside execution tasks — never under orientation H2s (context through objectives) or the closure phase.
- **Dependencias y orden de ejecución**: the task numbering in «Fase de ejecución» **is** the recommended execution order — a valid topological order of the dependency graph (every dependency has a lower number than its dependent). The Mermaid diagram declares an edge **only** on real data or structural dependency (the dependent task edits files, consumes a source's findings, uses decisions, or builds on structures the source task produces); never add edges "for caution" — chaining everything sequentially destroys the parallelism information, which is half the section's value. On topological ties, break by thematic affinity for natural reading. The closure phase is not a task and never appears in the diagram.
- **Ruta de reversión (rollback)**: every task whose actions modify runtime behavior, public contracts, data, or configuration must close its Objetivos with a one-line reversal route. Ecosystem default: revert the change or disable the feature flag. Purely additive, read-only, or documentation-only tasks are exempt.
- **Tabla de contenidos**: nested bullet list (2-space indent per level). Lists every delivered H2 except itself, and every execution-task H3 title under `Fase de ejecución`. No H4 entries, no action lines, no file paths, no objective restatements.
<!-- </content_rules> -->

<!-- <examples> -->
## Action line examples

<!-- <example name="action_without_explicit_source_bad"> -->
```markdown
#### Acciones
1. Actualizar la sección de verificación para exigir rutas de archivo.
2. Buscar documentación relevante sobre redirecciones HTTP.
```
Reason: no explicit source per step — agent must guess which artifact to edit or where to look.
<!-- </example> -->

<!-- <example name="action_mutation_good"> -->
```markdown
#### Acciones
1. **`.claude/skills/create-plan/SKILL.md`** — bloque `<content_rules>`: prescribir formato obligatorio con ruta en backticks al inicio de cada línea.
2. **`.claude/skills/create-plan/SKILL.md`** — bloque `<verification>`: añadir check de rutas placeholder.
```
Reason: each line names an explicit repo-relative file and a mutation verb (add/replace).
<!-- </example> -->

<!-- <example name="action_read_only_good"> -->
```markdown
#### Acciones
1. **`src/proxy/router.ts`** — función `resolveUpstream`: determinar si la estrategia de selección soporta pesos dinámicos.
2. **`https://datatracker.ietf.org/doc/html/rfc9110`** — sección 15.4 (redirecciones): extraer los requisitos de preservación de método relevantes para el proxy.
```
Reason: each line names an explicit source (repo path or URL) and a read-only verb (determinar/extraer).
<!-- </example> -->
<!-- </examples> -->

<!-- <verification> -->
## Final verification before delivery

Before delivering the plan, run this checklist mentally; fix the plan before delivering if any check fails:

1. Does the delivered plan match `<plan_template>` exactly — H1 plus the eight H2 sections in template order, fixed blocks verbatim, heading hierarchy respected?
2. Does the execution phase contain only tasks derived from the user's specific requirements, and is the closure phase exactly the single fixed walkthrough prescription (no execution work duplicated there, no walkthrough leaked into the plan objectives)?
3. Does **every** action line start with an explicit source in backticks (repo path or named external source, no placeholders), followed by section/block/aspect and a concrete change or determination, with one source per line?
4. Does each action line's final clause fit the unified grammar — either a mutation (add/remove/replace) or a read-only outcome (extract/determine)?
5. Do all Propósito sections (plan and tasks) contain both components under their single header — observed need, then proposed resolution with its added value?
6. Does the table of contents have exact parity with delivered headings (every task H3) without listing itself, H4s, action lines, or file paths?
7. Do bounded-scope task titles (H3) name the primary target file or source in backticks when known?
8. In «Dependencias y orden de ejecución»: does every diagram edge connect two existing execution tasks, is the graph acyclic, and does every dependency have a lower task number than its dependent (numbering = valid topological order)?
9. Is «Dependencias y orden de ejecución» present even in single-task plans (trivial one-node diagram plus a note that there are no dependencies), with the closure phase absent from the diagram and no "caution" edges between independent tasks?
10. Were all unresolved decision points, ambiguities, and competing strategies surfaced to the user as structured questions (one per decision, options ordered most-to-least recommended with explicit trade-offs) **before** drafting any plan section, and were any decision points that surfaced mid-draft also consulted before continuing?
11. Is the plan entirely in Spanish, with no internal vocabulary from this skill (XML block names, harness tools) and no self-referential structural rules (e.g. the two-phase rule restated as a fundamental consideration) leaked into it?
12. Does every risky task (runtime behavior, public contracts, data, or configuration) close its Objetivos with its one-line reversal route?

Only deliver the plan when all twelve checks have passed.
<!-- </verification> -->
