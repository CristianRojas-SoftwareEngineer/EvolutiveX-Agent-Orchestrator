---
case_id: 20260608-proxy-audit-discrepancies
profile: corrective
phase: 02-problem-definition
chain: cause
version: v1.0
timestamp: 2026-06-08T18:36:00Z
status: done
inputs: [01-observation.md]
produces: 02-problem-definition.md
links: { previous: 01-observation.md, next: 03-research.md }
---

# Problem Definition — 20260608-proxy-audit-discrepancies

## Applied policy

- **focus:** defecto + criterio de no-regresión
- **acceptance:** enunciado falsable y medible

## Problem statement

El Smart Code Proxy **no cumple el contrato de proyección causal** (`session-persistence` spec + `session-audit-model.md`) en sesiones agentic con tools client-side: los workflows wire HTTP no se cierran al `end_turn`, los `tool_result` no se persisten a disco, las continuaciones proyectan `messages: []`, y el ensamblaje SSE omite bloques `text` en `body.json`.

## Solved criterion

Tras un turno agentic simple (1 Bash + respuesta final):

1. Todos los workflows wire en `workflow-sequence.json` tienen `status: completed` y `output/result.json`.
2. Existe evento `tool_result` en `events.ndjson` y `tools/KK-slug/result.json` con `status: completed`.
3. `steps/N/request/body.json` de continuación contiene el historial con `tool_result` (no `messages: []`).
4. `steps/N/response/body.json` incluye bloques `text` además de `thinking`.
5. `meta.json` de workflows wire distingue `interactionType` (`agentic` | `side-request`).
6. Suite de tests existente + nuevos tests de regresión: verde.

## Limits

- No rediseñar el layout `causal-workflows-v1`.
- No cambiar el contrato del harness nativo.
- Métricas de sesión: fix mínimo para contar workflows wire cerrados (no reescritura completa del agregador).

## Severity

**Alta** — la auditoría causal no permite reconstruir el flujo tool→respuesta sin inspección manual de streaming crudo. Bloquea análisis automatizado (`/analyze-session`) y confianza en observabilidad.

## Acceptance check

Enunciado falsable con 6 criterios medibles. Un solo problema acotado. Sin hipótesis ni solución.
