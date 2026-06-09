---
case_id: 20260608-proxy-audit-telemetry-gaps
profile: corrective
phase: 04-hypothesis
chain: cause
version: v1.0
timestamp: 2026-06-08T14:20:00Z
status: done
inputs: [03-research.md]
produces: 04-hypothesis.md
links: { previous: 03-research.md, next: 05-experiment-design.md }
---

# Hypothesis — 20260608-proxy-audit-telemetry-gaps

## Applied policy

- **acceptance:** ≥1 hipótesis falsable

## Hypotheses (cause chain)

| ID | Hipótesis | Predicción | Refutación |
|----|-----------|------------|------------|
| H1 | Steps con `stopReason: tool_use` no reciben `closedAt` en correlador | Simular 3 hops tool_use + 1 terminal → `closedSteps.length === 1` antes del fix | Si `closedSteps.length === 4` sin cambio de código, refutada |
| H2 | `completeToolUse` no es idempotente; PostToolUse + continuation fallback emiten dos veces | Llamar `completeToolUse` dos veces → 2 eventos `tool_result` | Si segunda llamada es no-op sin emit, refutada |
| H3 | Wire y sesión cierran ambos con `finalText` por diseño dual de cierre | Inspeccionar ambos paths de cierre → ambos escriben `finalText` | Si solo uno lo escribe, refutada |
| H4 | Shell sesión no pasa `workflowKind` → `interactionType` cae a `"main"` | `openWorkflow` en UserPromptSubmit sin kind → meta con `interactionType: main` | Si kind explícito documentado, refutada |

## Priority

H1 (alta) → H2 (alta) → H3 (media) → H4 (baja).

## Status

| ID | Status |
|----|--------|
| H1 | pending → test fase 06 |
| H2 | pending → test fase 06 |
| H3 | pending → inspección código |
| H4 | pending → inspección código |

## Acceptance check

Cuatro hipótesis falsables con criterios de refutación explícitos.
