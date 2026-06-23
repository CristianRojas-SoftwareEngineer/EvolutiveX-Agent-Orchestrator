---
name: resolve-open-decisions
description: >
  Canonical home for "how to build a design-decision form" using AskUserQuestion.
  Use when a *-specification-delta stage surfaces open design decisions, decisiones
  abiertas, decisiones de diseño, competing strategies, trade-offs, or unresolved
  architectural choices — even if the invoker does not name this skill by name.
  Sub-invocable by any spec-delta stage (explore, design, plan) and by create-plan;
  also auto-activates when the conversation exposes formulario de decisiones or the
  need to present structured options to the user before continuing a workflow.
---

# Resolve Open Decisions

<!-- <overview> -->
Canonical home for "how to build a design-decision form". This skill structures and
fires one or more `AskUserQuestion` calls covering all open design decisions in a
workflow, then hands the resolved decisions back to the invoking flow. It **never**
writes or mutates any file — output is exclusively the interactive form.

This is a **sub-invocable reference skill** (Pattern A of `artifact-structuring`).
Any `*-specification-delta` stage or `create-plan` may invoke it when decisions must
be resolved before continuing; it replaces ad-hoc "¿A o B?" prose with a structured,
reproducible gate.
<!-- </overview> -->

<!-- <user_communication> -->
Ask, confirm, and respond to the user in **Spanish** (native Spanish-speaking
audience). Keep this artifact's instructions in **English** for token efficiency.
Canonical policy: `<language_policy>` in
[artifact-structuring](../artifact-structuring/SKILL.md). User-facing rules:
[AGENTS.md](../../../AGENTS.md) §0.
<!-- </user_communication> -->

<!-- <form_rules> -->
## Form construction rules

These rules are the canonical definition. `create-plan`, `design-specification-delta`,
and other skills cite this block (Pattern B) instead of restating the rules locally.

**One question per decision.** Each `AskUserQuestion` question covers one atomic,
mutually exclusive concern. Never bundle two unrelated decisions in the same question.

**Questions must be clear and detailed.** State: (1) what the decision is, (2) why
it matters, and (3) what depends on it. A vague "¿cuál prefieres?" is not enough.

**Every option must declare explicit trade-offs.** The `description` field of each
option must state *both* the pros and the cons — not just benefits. If an option has
no meaningful downside, it should not be a separate option; merge or drop it.

**Options ordered descending: most to least recommended.** The first option in the
array is always the recommendation. Append `(Recomendada)` to its `label` (this is
the native `AskUserQuestion` convention — users see it in the UI).

**`preview` only for concrete artifacts.** Use the `preview` field when the user
needs to visually compare code snippets, layouts, or configs — not for preference
questions whose labels and descriptions are self-sufficient.

**`multiSelect: true` only for non-exclusive options.** Default to single-select;
enable multiSelect only when more than one option can apply simultaneously.

**Open/free-text decisions.** When the decision has no bounded set of alternatives,
or when a required input is missing, do not invent options. Rely on the automatic
"Other" option that `AskUserQuestion` provides, or formulate a free-text question
that elicits the missing information.
<!-- </form_rules> -->

<!-- <batching> -->
## Batching across multiple calls

`AskUserQuestion` caps at **4 questions per call** and **2–4 options per question**.
When there are more decisions or alternatives than the caps allow:

**More than 4 decisions:** group them across multiple calls. Order the calls by
dependency: resolve decisions that other decisions depend on first. A later question
may be skipped if an earlier answer makes it moot — check before firing the next
batch.

**More than 4 alternatives for one decision:** collapse the least viable options
(combine into a "hybrid" or "other approaches" option) or split the decision into two
sub-decisions (e.g. "which layer?" then "which pattern within that layer?").

Present the number of batches to the user in Spanish before starting, so they know
how many rounds the form has.
<!-- </batching> -->

<!-- <gate> -->
## Gate semantics

This skill is a **hard gate**: surface all open decisions before the invoking flow
continues. Never resolve any decision unilaterally. Resume the invoker only after
the user has answered every question in every batch.

If a new decision surfaces mid-resolution (an answer reveals a downstream choice),
add it to the remaining batches — do not silently absorb it.

**Maintenance-profile weighting (optional).** When a maintenance profile is active
(declared by the user or received from the invoker), weight the option ordering by
profile. Rather than duplicating the profile tables here, follow the definitions in
[create-plan](../create-plan/SKILL.md) `<operation>` step 4:
- **correctivo** → weight diff size, reversibility, non-regression.
- **perfectivo** → weight dominant metric and significance.
- **preventivo** → weight coverage of risk paths and residual risk.
- **adaptativo** → weight reversibility, feature-flag isolation, contract preservation.
<!-- </gate> -->

<!-- <sub_invocation> -->
## Sub-invocation contract (Pattern A)

When invoked as a sub-step by another skill:

1. **Input from invoker:** the invoker passes (a) the list of open decisions with
   their candidate options and any known context, (b) the active change name if
   applicable, and (c) the maintenance profile if one is active.
2. **This skill:** constructs and fires the `AskUserQuestion` batch(es) per
   `<form_rules>` and `<batching>`. No file mutations at any point.
3. **Hand-off to invoker:** after all batches are answered, return the resolved
   decisions (question → chosen option + any free-text) as structured context so
   the invoker can write them into its own artifact (`design.md`, `tasks.md`, etc.).
4. **Gate propagation:** the approval gate (waiting for user answers) is always
   surfaced to the user through the outer flow — never absorbed by the invoker.
5. **Invoker owns the artifact:** the invoker writes the resolved decisions into
   whatever artifact it owns; this skill never writes those files.
<!-- </sub_invocation> -->

<!-- <constraints> -->
- Never write, edit, or delete any file.
- Never resolve a decision unilaterally — if the invoker does not provide options,
  propose candidate options but still ask the user.
- All user-facing questions, option labels, option descriptions, and batch summaries
  must be in **Spanish**.
- Invariants of form that must hold in every call:
  - One question per atomic decision.
  - Options ordered from most to least recommended.
  - First option labeled `(Recomendada)`.
  - Every option description includes explicit trade-offs (pros and cons).
- Do not mention internal XML block names or harness internals in user-facing output.
<!-- </constraints> -->

## Ejemplo

**Input (from invoker):** design stage for a delta that needs to choose a caching
strategy. Two open decisions: (1) where to cache, (2) cache invalidation approach.

**Output (two AskUserQuestion calls, one per decision):**

```
# Call 1
question: "¿Dónde debe vivir la caché para el servicio X?
  Esta decisión determina la latencia de acceso, la complejidad operacional y
  si la caché puede compartirse entre réplicas. Afecta directamente la
  estrategia de invalidación (siguiente pregunta)."
header: "Capa de caché"
options:
  - label: "En memoria por proceso (Recomendada)"
    description: "Pros: latencia mínima (~µs), sin dependencia externa.
                  Contras: no se comparte entre réplicas; requiere warm-up
                  tras reinicios."
  - label: "Redis compartido"
    description: "Pros: comparte estado entre réplicas; TTL y eviction
                  gestionados.
                  Contras: latencia de red (~1-5 ms); punto de fallo externo."
  - label: "Sin caché (leer siempre de BD)"
    description: "Pros: consistencia garantizada; cero complejidad.
                  Contras: latencia alta bajo carga; puede saturar la BD."

# Call 2 (fired after Call 1 is answered)
question: "¿Cómo debe invalidarse la caché?
  Depende de la capa elegida. Si se eligió Redis, la invalidación puede ser
  event-driven. Si es en memoria, requiere TTL o una señal explícita."
header: "Invalidación"
options:
  - label: "TTL fijo (Recomendada)"
    description: "Pros: simple, sin coordinación entre servicios.
                  Contras: ventana de datos obsoletos igual al TTL."
  - label: "Event-driven (invalidar en escritura)"
    description: "Pros: consistencia inmediata.
                  Contras: acoplamiento al bus de eventos; complejidad extra."
```
