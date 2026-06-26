## Non-canonical record

Reconciliación de cuatro contradicciones de doc en `.claude/agents/orchestrate-specification-delta.md`. No existe un spec canónico en `openspec/specs/` que prescriba la consistencia interna de las definiciones de agente; estas correcciones son mantenimiento de documentación sin impacto en requisitos canónicos.

- `orphan-check-timing` (4a) — El Step 0 (antes de la fase 1/explore) documenta el orphan check, pero la sección ~:544 lo redocumenta después del handoff del planner, con timing mutuamente excluyente. Se reconcilia estableciendo un único punto de verdad: cuándo exactamente corre el orphan check y si aplica antes o después de mintear el change.

- `expected-null-semantics` (4b) — La semántica de `expected=null` en el orphan check no está documentada en el agente. Se añade una nota explicativa que aclara el significado (p. ej. "null significa que no se espera ningún valor previo; si existe uno, es huérfano").

- `create-plan-gate-guided` (4c) — El gate `create-plan` en modo GUIDED no está documentado en el agente (solo se documenta su supresión en AUTO). Se añade la descripción del comportamiento en GUIDED para eliminar la ambigüedad.

- `needs-decision-explore-scope` (4d) — La ambigüedad del `resumeToken`/`NEEDS_DECISION` en la fase explore read-only pre-change: el explorer no tiene un `agentId` persistente estable en modo sub-agente clásico. Se documenta el comportamiento correcto (o la limitación) para que el orquestador sepa cómo manejar un `NEEDS_DECISION` procedente de explore.
