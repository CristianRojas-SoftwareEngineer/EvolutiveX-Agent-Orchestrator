---
name: create-plan-to-investigate
description: >
  Build investigation plans with a canonical structure: project context, table of
  contents, fundamental considerations, purpose and objectives, an investigation phase
  (tasks with concrete-source actions: repo files to read, URLs, named elements), and a
  closure phase centered on reporting findings in a structured, clear form. Investigation
  plans mutate nothing — no code changes, validations, or commits. Delivers Spanish plans
  ready for execution by an agent in any harness.
when_to_use: >
  Invoke with /create-plan-to-investigate [requirements] or when the user explicitly asks
  to create an exploration, investigation, or analysis plan (plan de exploración, plan de
  investigación, plan de análisis) — e.g. exploring an architecture element, analyzing an
  idea, or researching a topic, including online, without mutating the project. For plans
  that change the project, use create-plan-to-implement instead.
argument-hint: "[requirements]"
---

# Workflow: Create investigation plan

<!-- <table_of_contents> -->
## Contents

1. [User communication](#user-communication)
2. [How to operate this workflow](#how-to-operate-this-workflow)
3. [Canonical plan template (single source of truth)](#canonical-plan-template-single-source-of-truth)
4. [Content rules](#content-rules)
5. [Action line examples](#action-line-examples)
6. [Final verification before delivery](#final-verification-before-delivery)
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
exploration subagents (`Agent`), web search and fetch (`WebSearch`/`WebFetch`), and task-list
management (`TaskCreate`/`TaskUpdate`). In another harness, map each capability to its closest
equivalent; where one has no equivalent, achieve the intent by other means (e.g. no plan mode →
simply refrain from editing and ask for explicit approval in the conversation) rather than
skipping the intent. Prefer a real tool over improvising its effect in prose: structured
questions over inline "¿quieres A o B?", plan-mode approval over pasting a plan and hoping,
task tracking over a mental checklist. This workflow is **interactive by design**: stopping to
ask the user is success, not failure.

**Task tracking**: at any phase — discovery, drafting, or (in an execution flow) investigation
and reporting — trace work in progress with the harness task-list tools: create tasks for the
steps ahead, mark them in progress when started and completed when verified. This gives the
user visibility and prevents silently dropped steps.

1. **Requirements**: the user may pass plan requirements as `$requirements` (text after the slash command). If the request actually demands changes to the project, this is the wrong skill — route to `create-plan-to-implement`; if genuinely ambiguous, ask (structured question with both options) instead of guessing. A request needing both investigation and subsequent changes belongs to `create-plan-to-implement` as a plan whose early tasks investigate. If `$requirements` is empty and no requirements appear elsewhere in the message, request them **in Spanish** (phenomenon to explore, idea to analyze, or topic to research; questions to answer; restrictions; context to size scope) — prefer the structured-question capability with concrete options when the missing input is a bounded choice; free text otherwise — before generating anything. Never invent or assume requirements.
2. **Planning mode**: enter your harness's read-only planning mode (Claude Code: `EnterPlanMode`) before requirement analysis, source discovery, or drafting; without one, refrain from any edit until the plan is approved. Executing the investigation belongs to a separate flow unless the user explicitly requests execution in the same turn.
3. **Discovery**: resolve every source (repo file, document, URL or named external source, precisely-named element) from requirements and codebase layout. Delegate independent discovery tasks to exploration subagents when the harness offers them (Claude Code: `Agent` with `subagent_type: "Explore"`), in parallel when possible; use web search to confirm that external sources exist and are pertinent before citing them. If a required source cannot be resolved, **stop and ask** — never emit placeholder sources (`algunas fuentes`, `documentación relevante`).
4. **Scope decisions**: if requirements are ambiguous, incomplete, or contradict the fundamental considerations, stop and ask. If you detect a scoping decision point the user did not resolve (competing investigation angles, depth versus breadth, which questions matter most), do not resolve it unilaterally: surface it via the structured-question capability — one question per decision, each alternative as an option with its trade-offs in the description, your recommendation first and marked as such — and continue only after the user decides.
5. **Drafting order**: outline investigation-task H3 titles first → write context → build the table of contents from the outline → write the remaining sections per `<plan_template>`.
6. **Verify and deliver**: run `<verification>`, then deliver the complete plan in Spanish as a single well-structured markdown block. If you entered plan mode in step 2, close it through the harness's approval mechanism (Claude Code: `ExitPlanMode`) so the user reviews and approves the plan formally instead of an informal "¿procedo?". Do not omit any section even for small requirements — structural uniformity is part of this workflow's value. Do not mention harness tools, modes, subagents, or internal XML block names in the delivered plan.
<!-- </operation> -->

<!-- <plan_template> -->
## Canonical plan template (single source of truth)

The delivered plan follows this template exactly: H1 title plus the seven H2 sections below in fixed order. Investigation plans mutate nothing, so the closure phase contains no cleanup, validation, or commit — it is always present and centers on reporting findings. Spanish prose throughout; repo paths and URLs unchanged. `{{...}}` marks variable content; literal text is fixed and must be delivered verbatim.

```markdown
# Plan: {{título descriptivo del plan}}

## Contexto del proyecto

{{Síntesis breve de la arquitectura y tecnologías del proyecto (o del dominio del tema,
si la investigación es externa al proyecto), suficiente para que un agente que no conoce
el proyecto se oriente al leer el plan.
Sin Acciones aquí. Nunca repetir contexto dentro de tareas individuales.}}

## Tabla de contenidos

- Contexto del proyecto
- Consideraciones fundamentales
- Propósito del plan
- Objetivos del plan
- Fase de investigación
  - {{título H3 de cada tarea, uno por línea}}
- Fase de cierre
  - Reporte estructurado de resultados

## Consideraciones fundamentales para el razonamiento y diseño del plan

{{Consideraciones relevantes para el diseño de la investigación, derivadas del contexto
y los requisitos. Cubrir al menos dos dimensiones:

1. **Alcance y profundidad**: qué preguntas debe responder la investigación, qué queda
   explícitamente fuera del alcance, y el nivel de profundidad esperado (panorama
   general, comparación de alternativas, análisis exhaustivo).

2. **Fuentes y confiabilidad**: qué tipos de fuentes alimentan la investigación (código
   del repositorio, documentación del proyecto, fuentes externas) y criterios para
   ponderar su confiabilidad y vigencia; política ante hallazgos contradictorios entre
   fuentes.}}

## Propósito del plan

{{Prosa continua con dos componentes en orden: primero la necesidad observada (qué se
desconoce, qué duda o hipótesis motiva la investigación, qué decisión depende de ella),
después la propuesta de investigación y su valor agregado (qué conocimiento produce y
qué devuelve obtenerlo). Sin Acciones aquí.}}

## Objetivos del plan

{{Metas verificables alineadas con el propósito, formuladas como preguntas a responder
o determinaciones a producir. Solo trabajo específico de la fase de investigación:
nunca incluir "redactar el reporte" — pertenece a la fase de cierre. Sin Acciones aquí.}}

## Fase de investigación

### Tarea {{N}} — {{título con la fuente principal en backticks cuando el alcance es acotado}}

#### Propósito

{{Prosa continua de la tarea: qué aspecto del fenómeno cubre y por qué, luego el enfoque
de análisis y su valor agregado. Sin listas de fuentes ni pasos de ejecución; no copiar
el propósito del plan.}}

#### Objetivos

{{Metas verificables que acotan la tarea — hallazgos o determinaciones concretas que
debe producir — sin re-explicar el propósito.}}

#### Acciones

1. **`{{fuente concreta: ruta, URL o elemento nombrado}}`** — {{sección o aspecto}}: {{qué examinar y qué extraer o determinar}}.
2. {{...una línea numerada por fuente; misma forma obligatoria...}}

{{...repetir la estructura H3 + H4 por cada tarea...}}

## Fase de cierre

### Reporte estructurado de resultados

Sintetizar los hallazgos de todas las tareas de investigación en un reporte claro y
estructurado, entregado en la conversación. El reporte debe: responder explícitamente
cada objetivo del plan (o declarar qué quedó sin responder y por qué), presentar los
hallazgos organizados por tema —no por orden de ejecución—, distinguir hechos
verificados de interpretaciones e hipótesis, citar las fuentes examinadas junto a cada
hallazgo relevante, y cerrar con conclusiones y, cuando corresponda, recomendaciones o
preguntas abiertas para una siguiente iteración. No persistir el reporte en archivos
del proyecto salvo solicitud explícita del usuario.
```

Heading hierarchy is fully encoded above: H2 only the seven sections in template order; H3 for investigation tasks and the single closure stage; H4 (`Propósito`, `Objetivos`, `Acciones`) only under investigation tasks — the closure stage is prose, no H4 template.
<!-- </plan_template> -->

<!-- <content_rules> -->
## Content rules

Structural invariants and semantics the template cannot enforce by shape alone:

- **Flat H2 structure (skill rule — never plan content)**: the delivered plan follows the flat seven-H2 structure exactly as encoded in `<plan_template>`: contexto → tabla de contenidos → consideraciones fundamentales → propósito del plan → objetivos del plan → fase de investigación → fase de cierre, with the table of contents after context and before considerations. Each investigation task declares Propósito, Objetivos, and prescriptive Acciones as H4. These are generation rules for this skill: do **not** restate them inside the delivered plan (e.g. as a fundamental consideration or any other self-referential structural note).
- **No mutations**: investigation tasks read, examine, compare, and determine — they never edit project files, run state-changing commands, or commit. If a drafted action implies a mutation, the requirement belongs to `create-plan-to-implement`.
- **Propósito (plan and per task)**: one header whose continuous prose covers two components in order — the **observed need** (what is unknown, doubted, or hypothesized, and what decision depends on it) and the **proposed investigation with its added value** (what knowledge it produces and returns). Never split these components into separate headings, and never reduce them to a single vague sentence that conveys only one component.
- **Objetivos**: verifiable goals that bound work at their level — questions to answer or determinations to produce; they do not re-explain the Purpose. Plan-level objectives describe only investigation-phase work; reporting belongs to the closure phase.
- **Acciones**: numbered list where **every** line starts with an explicit, concrete source in backticks — a repo-relative path to read, a URL or named external source, or a precisely-named element (module, pattern, metric) — followed by the section or aspect to examine and what to extract or determine (finding, comparison, criterion — not a restatement of the objective). One primary source per line; split multi-source work into one line per source. Actions exist **only** inside investigation tasks — never under orientation H2s (context through objectives).
- **Tabla de contenidos**: nested bullet list (2-space indent per level). Lists every delivered H2 except itself, every investigation-task H3 title under `Fase de investigación`, and «Reporte estructurado de resultados» under `Fase de cierre`. No H4 entries, no action lines, no source references, no objective restatements.

<!-- <critical> -->
1. **Never duplicate content between the investigation phase and the closure phase**. Synthesis and reporting of findings go **only** in the closure phase. Do not replicate "redactar el reporte" or "sintetizar hallazgos" as an investigation task.

2. **Do not advance the closure stage into the investigation phase**. Even if tempting to include "síntesis" as the last investigation task for explicitness, do not: that responsibility is already covered by the closure phase and duplicating it causes confusion about source of truth and execution order.

3. **The investigation phase ends when the plan's questions have been examined against their sources**. From there, the natural continuation is the closure phase, and the executing agent must understand that.
<!-- </critical> -->
<!-- </content_rules> -->

<!-- <examples> -->
## Action line examples

<!-- <example name="action_without_explicit_source_bad"> -->
```markdown
#### Acciones
1. Investigar cómo funciona el enrutamiento del proxy.
2. Buscar documentación relevante sobre redirecciones HTTP.
```
Reason: no concrete source per step — agent must guess what to read or where to search.
<!-- </example> -->

<!-- <example name="action_with_explicit_source_good"> -->
```markdown
#### Acciones
1. **`src/proxy/router.ts`** — función `resolveUpstream`: examinar la estrategia de selección de upstream y determinar si soporta pesos dinámicos.
2. **`https://datatracker.ietf.org/doc/html/rfc9110`** — sección 15.4 (redirecciones): extraer los requisitos de preservación de método relevantes para el proxy.
```
<!-- </example> -->
<!-- </examples> -->

<!-- <verification> -->
## Final verification before delivery

Before delivering the plan, run this checklist mentally; fix the plan before delivering if any check fails:

1. Does the delivered plan match `<plan_template>` exactly — H1 plus the seven H2 sections in template order, fixed blocks verbatim (including the closure stage «Reporte estructurado de resultados»), heading hierarchy respected?
2. Does the investigation phase contain only tasks derived from the user's specific requirements, with zero mutations to the project and zero duplication of the closure-phase reporting responsibility in tasks or plan objectives?
3. Does **every** action line start with an explicit, concrete source in backticks (repo-relative path, URL or named external source, or precisely-named element — never a placeholder), followed by the section or aspect and what to extract or determine, with one primary source per line?
4. Do all Propósito sections (plan and tasks) contain both components under their single header — observed need, then proposed investigation with its added value?
5. Does the table of contents have exact parity with delivered headings (every task H3 and the closure stage) without listing itself, H4s, action lines, or source references?
6. Is the closure phase exactly the single stage «Reporte estructurado de resultados», with no cleanup, validation, documentation, or commit stages?
7. Do bounded-scope task titles (H3) name the primary source in backticks when known?
8. Were all unresolved scoping decision points consulted with the user before delivering?
9. Is the plan entirely in Spanish, with no internal vocabulary from this skill (XML block names, harness tools) and no self-referential structural rules (e.g. the flat-H2 rule restated as a fundamental consideration) leaked into it?

Only deliver the plan when all nine checks have passed.
<!-- </verification> -->
