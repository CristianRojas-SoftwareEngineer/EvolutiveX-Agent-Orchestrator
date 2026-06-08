---
case_id: 20260608-proxy-audit-residual-gaps
profile: corrective
phase: 04-hypothesis
chain: cause
version: v1.0
timestamp: 2026-06-08T23:33:00Z
status: done
inputs: [03-research.md]
produces: 04-hypothesis.md
links: { previous: 03-research.md, next: 05-experiment-design.md }
---

# Hypothesis — 20260608-proxy-audit-residual-gaps

## Applied policy

- **acceptance:** ≥1 hipótesis falsable

## Candidates

| ID | Status | Hipótesis | Predicción | Refutación |
|----|--------|-----------|------------|------------|
| H1 | pending | `tool_result` no persiste porque falta `PostToolUse` en settings del usuario y no hay fallback en continuation. | Con PostToolUse ausente, `completeToolUse` nunca se invoca; continuation tiene `tool_result` en body pero no lo procesa. | Simular PostToolUse → `tool_result` aparece sin cambio de código. |
| H2 | pending | `total_workflows: 0` porque `finalizeWorkflowMetrics` solo corre en cierre por hook Stop del workflow sesión (0 steps con usage). | Wire workflows con usage cierran por SSE sin llamar finalize. | Tras invocar finalize al cierre wire, `total_workflows > 0`. |
| H3 | pending | `stepCount: 0` en workflow sesión es comportamiento esperado del dual-layer (sin hops de inferencia en `00`). | Workflow `00` no registra steps wire. | Agregar agregación hijos cambiaría semántica — deuda documental. |
| H4 | pending | Hooks vacíos son POST `/hooks` con body `{}` o sin `hook_event_name` desde cliente no lifecycle. | Log muestra `eventName: ""` sin correlación con tools. | Identificar emisor; fuera de scope fix mínimo. |

## Acceptance check

4 hipótesis falsables con predicción y refutación.
