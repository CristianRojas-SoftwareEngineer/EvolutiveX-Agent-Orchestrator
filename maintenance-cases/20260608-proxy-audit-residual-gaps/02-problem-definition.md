---
case_id: 20260608-proxy-audit-residual-gaps
profile: corrective
phase: 02-problem-definition
chain: cause
version: v1.0
timestamp: 2026-06-08T23:31:00Z
status: done
inputs: [01-observation.md]
produces: 02-problem-definition.md
links: { previous: 01-observation.md, next: 03-research.md }
---

# Problem Definition — 20260608-proxy-audit-residual-gaps

## Applied policy

- **acceptance:** enunciado falsable y medible

## Problem statement

Tras el fix del caso `20260608-proxy-audit-discrepancies`, el proxy **sigue sin cumplir** el contrato de persistencia causal para tools client-side y métricas de sesión en turnos agentic con Bash:

1. Los `tool_result` no se proyectan a disco ni al EventBus.
2. `session-metrics.json` no refleja workflows cerrados con hops contables.
3. El workflow sesión reporta `stepCount: 0` (deuda de proyección).
4. El borde `/hooks` recibe payloads sin `hook_event_name` (ruido operativo).

## Success criteria (falsables)

| ID | Criterio |
|----|----------|
| SC1 | Tras turno con Bash: evento `tool_result` en `events.ndjson` y `tools/KK-slug/result.json` con `status: completed`. |
| SC2 | `session-metrics.json` → `total_workflows ≥ 1` cuando al menos un workflow wire con usage cierra. |
| SC3 | Tests existentes + nuevos en verde. |
| SC4 | `npm test` sin regresiones. |

## Non-regression

- Cierre wire workflows (fix previo) permanece OK.
- Continuaciones con historial completo permanecen OK.
- Coalescencia SSE `text` permanece OK.

## Acceptance check

Enunciado acotado con 4 criterios medibles.
