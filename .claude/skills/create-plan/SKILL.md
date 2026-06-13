---
name: create-plan
description: >
  Build implementation plans with a canonical structure: project context, table of
  contents, fundamental considerations, purpose and objectives, an implementation phase
  (tasks ordered by dependency, with repo-relative file actions), a dependency diagram
  with recommended execution order, and an opt-in closure phase (zombie cleanup,
  validation, docs, commit — each stage activated by its flag). Delivers Spanish plans
  ready for execution by an agent in any harness; when the plan is executed, the
  execution closes with a post-execution walkthrough reporting the process followed
  and any drift from the plan.
when_to_use: >
  Invoke with /create-plan [requirements] plus optional opt-in closure flags
  (--zombie, --validation, --docs, --commit) or when the user explicitly asks to create a
  development plan, plan de desarrollo, plan de implementación, or asks for task
  dependencies or execution order in a plan (orden de ejecución, dependencias entre
  tareas). For exploration, analysis, or research that mutates nothing, use investigate
  instead.
argument-hint: "[requirements] [--zombie] [--validation] [--docs] [--commit]"
---

# Workflow: Create development plan

<!-- <table_of_contents> -->
## Contents

1. [How to operate this workflow](#how-to-operate-this-workflow)
2. [Canonical plan template (single source of truth)](#canonical-plan-template-single-source-of-truth)
3. [Content rules](#content-rules)
4. [Action line examples](#action-line-examples)
5. [Final verification before delivery](#final-verification-before-delivery)
6. [Post-execution walkthrough](#post-execution-walkthrough)
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

**Sub-invoked mode**: when another skill invokes this one as a sub-step, follow the `<sub_invocation_protocol>` of [artifact-structuring](../artifact-structuring/SKILL.md). The skill stays agnostic to the invoker's workflow: it takes instructions, sources, and requirements from the invocation context, does not activate closure flags unless the invoker declares them (the outer flow owns its closure and its own artifacts), and the plan-approval gate is still presented to the user. The approved plan is handed off to the invoking flow, which owns any artifact it must update from it.

**Task tracking**: at any phase — discovery, drafting, or (in an apply flow) implementation and
closure — trace work in progress with the harness task-list tools: create tasks for the steps
ahead, mark them in progress when started and completed when verified. This gives the user
visibility and prevents silently dropped steps.

1. **Requirements and closure flags**: the user may pass plan requirements as `$requirements` (text after the slash command). If the request is to explore, analyze, or research without mutating the project, this is the wrong skill — route to `investigate`; if genuinely ambiguous, ask (structured question with both options) instead of guessing. Parse the optional closure flags out of `$requirements` before interpreting the rest as requirements. Closure stages are **opt-in**: each flag adds one closure stage (its H3 and its TOC entry): `--zombie` → «Eliminación de código zombie», `--validation` → «Validación técnica», `--docs` → «Actualización de documentación sincronizada», `--commit` → «Commit descriptivo». Without flags, no closure stage is generated and the entire «Fase de cierre» H2 and its TOC entry are omitted — the default, so invoking the skill never triggers cascading actions beyond the implementation phase. Delivered stages always keep the canonical relative order (zombie → validación → documentación → commit). Typical uses: the four flags together for a fully consolidated close, `--zombie --validation --docs` when the user will review before committing, or no flags when an outer flow (e.g. OpenSpec) owns the closure. In sub-invoked mode, requirements, sources, and flags come from the invoker's context per the sub-invoked mode above. If the remaining `$requirements` is empty and no requirements appear elsewhere in the message, request them **in Spanish** (problem to solve, proposed improvement or functionality, restrictions, context to size scope) — prefer the structured-question capability with concrete options when the missing input is a bounded choice; free text otherwise — before generating anything. Never invent or assume requirements.
2. **Planning mode**: enter your harness's read-only planning mode (Claude Code: `EnterPlanMode`) before requirement analysis, codebase discovery, or drafting; without one, refrain from any edit until the plan is approved. Source edits belong to a separate apply flow unless the user explicitly requests execution in the same turn.
3. **Discovery**: resolve every target file from requirements and codebase layout. Delegate independent discovery tasks to exploration subagents when the harness offers them (Claude Code: `Agent` with `subagent_type: "Explore"`), in parallel when possible; consider a planning subagent when the strategy itself needs architectural design. If a required file cannot be resolved, **stop and ask** — never emit placeholder paths (`the file`, `relevant module`).
4. **Design decisions**: if requirements are ambiguous, incomplete, or contradict the fundamental considerations, stop and ask. If you detect an architectural decision point the user did not resolve (competing strategies, residual behavior to keep or drop), do not resolve it unilaterally: surface it via the structured-question capability — one question per decision, each alternative as an option with its trade-offs in the description, your recommendation first and marked as such — and continue only after the user decides. When competing strategies exist and a maintenance profile is active (declared by the user or received from an invoking flow), weight the presented options by profile: **correctivo** → diff size, reversibility, and non-regression; **perfectivo** → dominant metric and significance; **preventivo** → coverage of risk-materialization paths and residual risk; **adaptativo** → reversibility, feature-flag isolation, and contract preservation.
5. **Drafting order**: outline implementation-task H3 titles first → derive the dependency graph between the outlined tasks (an edge only when one task needs results another produces) → sort topologically and renumber the tasks so list order **is** a valid execution order → write context → build the table of contents from the renumbered outline → write the remaining sections per `<plan_template>`, deriving «Dependencias y orden de ejecución» from the graph already built.
6. **Verify and deliver**: run `<verification>`, then deliver the complete plan in Spanish as a single well-structured markdown block. If you entered plan mode in step 2, close it through the harness's approval mechanism (Claude Code: `ExitPlanMode`) so the user reviews and approves the plan formally instead of an informal "¿procedo?". Do not omit any section even for small requirements — structural uniformity is part of this workflow's value (the closure phase is the exception: its presence is governed solely by the closure flags). Do not mention harness tools, modes, subagents, or internal XML block names in the delivered plan.
7. **Execution and walkthrough**: when the approved plan is executed (in the same turn after approval, or in a later apply flow driven by this plan), close the execution with the post-execution report per `<walkthrough_report>`.
<!-- </operation> -->

<!-- <plan_template> -->
## Canonical plan template (single source of truth)

The delivered plan follows this template exactly: H1 title plus the H2 sections below in fixed order — seven always; «Fase de cierre» only when at least one closure flag is present. Spanish prose throughout; repo paths unchanged. `{{...}}` marks variable content; literal text is fixed and must be delivered verbatim.

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
- Fase de implementación
  - {{título H3 de cada tarea, uno por línea, en el orden recomendado de ejecución}}
- Dependencias y orden de ejecución
- Fase de cierre {{incluir el bloque solo si hay al menos un flag de cierre}}
  - Eliminación de código zombie {{incluir solo con --zombie}}
  - Validación técnica {{incluir solo con --validation}}
  - Actualización de documentación sincronizada {{incluir solo con --docs}}
  - Commit descriptivo {{incluir solo con --commit}}

## Consideraciones fundamentales para el razonamiento y diseño del plan

{{Consideraciones relevantes para el diseño del plan, derivadas del contexto del
proyecto y los requisitos. Cubrir al menos dos dimensiones:

1. **Madurez y dependientes**: estado actual del proyecto (desarrollo activo, producción,
   legacy, etc.) y existencia de usuarios o sistemas dependientes; implicaciones para el
   tratamiento de retrocompatibilidad, documentación histórica y código legacy.

2. **Estado canónico**: qué elementos deben permanecer en sincronía tras la implementación
   (código fuente, documentación, configuración, artefactos del proyecto) y política para
   código o documentación que quede sin uso tras los cambios.}}

## Propósito del plan

{{Prosa continua con dos componentes en orden: primero la necesidad observada (bug,
clase de defecto, capacidad nueva o modificación de comportamiento), después la
propuesta de solución y su valor agregado (qué logra y qué devuelve aplicarla).
Sin Acciones aquí.}}

## Objetivos del plan

{{Metas verificables alineadas con el propósito. Solo trabajo específico de la fase de
implementación: nunca incluir "validar compilación", "eliminar código muerto" o
"commit" — pertenecen a la fase de cierre. Sin Acciones aquí.}}

## Fase de implementación

### Tarea {{N}} — {{título con archivo principal en backticks cuando el alcance es acotado}}

#### Propósito

{{Prosa continua de la tarea: necesidad observada, luego propuesta de solución y su
valor agregado. Sin listas de archivos ni pasos de ejecución; no copiar el propósito
del plan.}}

#### Objetivos

{{Metas verificables que acotan la tarea, sin re-explicar el propósito.}}

#### Acciones

1. **`{{ruta/relativa/al/archivo}}`** — {{sección o bloque}}: {{cambio concreto}}.
2. {{...una línea numerada por archivo; misma forma obligatoria...}}

{{...repetir la estructura H3 + H4 por cada tarea...}}

## Dependencias y orden de ejecución

{{Diagrama Mermaid `flowchart TD` con un nodo por tarea de implementación
(`T1["Tarea 1 — título corto"]`) y una arista `T1 --> T3` solo cuando la tarea destino
necesita resultados que la tarea origen produce (archivo creado o modificado, decisión
tomada, estructura establecida). Las tareas sin aristas entre sí quedan visualmente
explícitas como independientes. Con una sola tarea: diagrama trivial de un nodo.}}

{{Prosa breve posterior al diagrama que: (1) confirma que la numeración de las tareas
ya es el orden recomendado de ejecución, (2) identifica los grupos de tareas
paralelizables (sin dependencias mutuas) cuando existen, o declara que no hay
dependencias entre tareas cuando el grafo no tiene aristas. Las etapas de la fase de
cierre no participan del diagrama: su orden es canónico y fijo.}}

## Fase de cierre

{{Etapas opt-in por flags de cierre (ver <operation>): cada flag incluye su etapa
completa — H3 y entrada del TOC. Las etapas entregadas conservan el orden relativo
canónico. Sin ningún flag presente, omitir este H2 completo y su entrada del TOC
(comportamiento por defecto).}}

### Eliminación de código zombie

Identificar si los cambios implementados dejaron código fuente del proyecto «zombie»
al quedar sin uso. Si es así, eliminar código fuente, lógica y documentación zombie de
forma consistente. Esta etapa va primero porque eliminar código después de validar
obligaría a re-ejecutar todas las validaciones; limpiar primero permite validar una
sola vez sobre el estado final.

### Validación técnica

Verificar la compilación correcta del proyecto, luego verificar que todos los tests
automatizados completan con éxito, luego verificar que el linter del proyecto no
reporta warnings ni errores. Si alguna validación falla, corregir de forma
iterativa-incremental hasta resolverla por completo. Esta etapa va segunda porque
opera sobre código ya limpiado por la etapa anterior.

### Actualización de documentación sincronizada

Analizar los cambios implementados, luego investigar qué secciones, subsecciones o
comentarios de la documentación del proyecto se ven impactados, luego diseñar un
sub-plan para actualizar toda la documentación necesaria de forma sincronizada,
coherente y consistente entre múltiples archivos del proyecto. La documentación está
distribuida en `README.md` y `docs/`. Esta etapa va tercera porque documenta código ya
limpio y validado, evitando documentar realidades que luego cambiarían.

### Commit descriptivo

Hacer commit de los cambios diseñados e implementados en el plan, describiéndolos en
español de forma descriptiva y detallada. Para construir el mensaje, analizar el
propósito y los objetivos del plan, luego analizar y sintetizar todos los cambios
implementados, y comentar cómo cada cambio se alinea con el propósito y los objetivos.
Seguir la plantilla de cuerpo en tres bloques de conventional-commits (Propósito,
Objetivos, Resumen de cambios). Esta etapa va última porque captura en el historial un
estado consolidado, limpio, validado y documentado.
```

Heading hierarchy is fully encoded above: H2 only the sections in template order (seven by default; eight when at least one closure flag adds the closure phase); H3 for implementation tasks and the closure stages activated by their flags; H4 (`Propósito`, `Objetivos`, `Acciones`) only under implementation tasks — closure stages are prose, no H4 template; «Dependencias y orden de ejecución» has no H3s or H4s.
<!-- </plan_template> -->

<!-- <content_rules> -->
## Content rules

Structural invariants and semantics the template cannot enforce by shape alone:

- **Flat H2 structure (skill rule — never plan content)**: the delivered plan follows the flat H2 structure exactly as encoded in `<plan_template>`: contexto → tabla de contenidos → consideraciones fundamentales → propósito del plan → objetivos del plan → fase de implementación → dependencias y orden de ejecución → fase de cierre, with the table of contents after context and before considerations (seven H2s by default; the «Fase de cierre» H2 exists only when at least one closure flag is present). Each implementation task declares Propósito, Objetivos, and prescriptive Acciones as H4. These are generation rules for this skill: do **not** restate them inside the delivered plan (e.g. as a fundamental consideration or any other self-referential structural note).
- **Propósito (plan and per task)**: one header whose continuous prose covers two components in order — the **observed need** (what was seen, missing, or failing: bug, defect class to prevent, new capability, or change to existing behavior) and the **proposed resolution with its added value** (what applying it achieves and returns). Never split these components into separate headings, and never reduce them to a single vague sentence that conveys only one component.
- **Objetivos**: verifiable goals that bound work at their level; they do not re-explain the Purpose. Plan-level objectives describe only implementation-phase work.
- **Acciones**: numbered list where **every** line starts with an explicit repo-relative file path in backticks, then section/block (XML tag, heading, function, or line range when known), then the concrete change (what to add, remove, or replace — not a restatement of the objective). One primary file per line; split multi-file work into one line per file. Actions exist **only** inside implementation tasks — never under orientation H2s (context through objectives).
- **Dependencias y orden de ejecución**: the task numbering in «Fase de implementación» **is** the recommended execution order — a valid topological order of the dependency graph (every dependency has a lower number than its dependent). The Mermaid diagram declares an edge **only** on real data or structural dependency (the dependent task edits files, uses decisions, or builds on structures the source task produces); never add edges "for caution" — chaining everything sequentially destroys the parallelism information, which is half the section's value. On topological ties, break by thematic affinity for natural reading. Closure stages never appear in the diagram (their order is canonical, fixed by flags — see `<operation>` step 1).
- **Ruta de reversión (rollback)**: every task whose actions modify runtime behavior, public contracts, data, or configuration must close its Objetivos with a one-line reversal route. Ecosystem default: revert the change or disable the feature flag. Purely additive or documentation-only tasks are exempt.
- **Tabla de contenidos**: nested bullet list (2-space indent per level). Lists every delivered H2 except itself, every implementation-task H3 title under `Fase de implementación`, and the delivered closure stages under `Fase de cierre` (only those activated by closure flags, when any). No H4 entries, no action lines, no file paths, no objective restatements.

<!-- <critical> -->
1. **Never duplicate content between the implementation phase and the closure phase**. If a task conceptually belongs to closing stages (dead code removal, compilation/tests/linter validation, documentation update, commit), it goes **only** in the closure phase. Do not replicate it as an implementation task.

2. **Do not advance closing stages into the implementation phase**. Even if tempting to include "validation" or "zombie cleanup" as the last implementation task for explicitness, do not: that responsibility is already covered by the closure phase and duplicating it causes confusion about source of truth and execution order.

3. **The implementation phase ends when requirement-specific changes are complete**. From there, the natural continuation is the closure phase, and the executing agent must understand that.
<!-- </critical> -->
<!-- </content_rules> -->

<!-- <examples> -->
## Action line examples

<!-- <example name="action_without_explicit_file_bad"> -->
```markdown
#### Acciones
1. Actualizar la sección de verificación para exigir rutas de archivo.
2. Añadir anti-patrones en el modelo de propósito.
```
Reason: no repo-relative file path per step — agent must guess which artifact to edit.
<!-- </example> -->

<!-- <example name="action_with_explicit_file_good"> -->
```markdown
#### Acciones
1. **`.claude/skills/create-plan/SKILL.md`** — bloque `<content_rules>`: prescribir formato obligatorio con ruta en backticks al inicio de cada línea.
2. **`.claude/skills/create-plan/SKILL.md`** — bloque `<verification>`: añadir check de rutas placeholder.
```
<!-- </example> -->
<!-- </examples> -->

<!-- <verification> -->
## Final verification before delivery

Before delivering the plan, run this checklist mentally; fix the plan before delivering if any check fails:

1. Does the delivered plan match `<plan_template>` exactly — H1 plus the H2 sections in template order (seven by default, eight when closure flags add the closure phase), fixed blocks verbatim, heading hierarchy respected?
2. Does the implementation phase contain only tasks derived from the user's specific requirements, with zero duplication of closure-phase responsibilities (zombie, validation, documentation, commit) in tasks or plan objectives?
3. Does **every** action line start with an explicit repo-relative file path in backticks (no placeholders), followed by section/block and a concrete change, with one line per file?
4. Do all Propósito sections (plan and tasks) contain both components under their single header — observed need, then proposed resolution with its added value?
5. Does the table of contents have exact parity with delivered headings (every task H3, every delivered closure stage) without listing itself, H4s, action lines, or file paths?
6. Does closure-stage presence match the closure flags exactly — each stage present only with its flag and fully absent (H3 and TOC entry) without it, delivered stages in canonical relative order, and the «Fase de cierre» H2 present only when at least one closure flag was passed?
7. Do bounded-scope task titles (H3) name the primary target file in backticks when paths are known?
8. In «Dependencias y orden de ejecución»: does every diagram edge connect two existing implementation tasks, is the graph acyclic, and does every dependency have a lower task number than its dependent (numbering = valid topological order)?
9. Is «Dependencias y orden de ejecución» present even in single-task plans (trivial one-node diagram plus a note that there are no dependencies), with no closure stages in the diagram and no "caution" edges between independent tasks?
10. Were all unresolved architectural decision points consulted with the user before delivering?
11. Is the plan entirely in Spanish, with no internal vocabulary from this skill (XML block names, harness tools) and no self-referential structural rules (e.g. the flat-H2 rule restated as a fundamental consideration) leaked into it?
12. Does every risky task (runtime behavior, public contracts, data, or configuration) close its Objetivos with its one-line reversal route?
13. In sub-invoked mode, were the invoker's requirements respected without activating closure stages it did not declare?

Only deliver the plan when all thirteen checks have passed.
<!-- </verification> -->

<!-- <walkthrough_report> -->
## Post-execution walkthrough

This section applies only when the plan is executed (same turn after approval, or a later apply flow driven by this plan); plan-only deliveries end at `<verification>`.

After completing the execution, close with a **Recorrido (walkthrough)** as the opening of the final assistant message, **in Spanish**:

1. **Proceso seguido**: a brief account of how the implementation proceeded — which tasks were executed, in what order, and which closure stages ran (when closure flags were present).
2. **Drift respecto al plan**: any divergence between the approved plan and the actual execution — tasks adapted, actions added or dropped, files touched beyond the planned action lines, order changes against the recommended execution order — each with its reason; or an explicit note that execution matched the plan with no drift.

The walkthrough is part of the assistant message, never a file. Same leakage rule as the plan: no harness tools, modes, or internal XML block names in it.

Before delivering it, verify: (1) both components are present — proceso seguido and drift (or its explicit absence, each divergence with its reason); (2) no internal vocabulary from this skill leaked into it.
<!-- </walkthrough_report> -->
