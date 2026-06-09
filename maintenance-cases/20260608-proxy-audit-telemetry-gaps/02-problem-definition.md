---
case_id: 20260608-proxy-audit-telemetry-gaps
profile: corrective
phase: 02-problem-definition
chain: cause
version: v1.0
timestamp: 2026-06-08T14:10:00Z
status: done
inputs: [01-observation.md]
produces: 02-problem-definition.md
links: { previous: 01-observation.md, next: 03-research.md }
---

# Problem Definition — 20260608-proxy-audit-telemetry-gaps

## Applied policy

- **acceptance:** enunciado falsable y medible

## Problem statement

El Smart Code Proxy **no produce metadatos de cierre y telemetría coherentes** con el árbol causal materializado en sesiones agentic multi-hop cuando PostToolUse está activo: (1) `IWorkflowResult.stepCount` no refleja hops cerrados en disco; (2) el EventBus emite `tool_result` duplicado por tool; (3) `finalText` se replica en workflow sesión y wire; (4) `interactionType` del contenedor de sesión usa valor no documentado.

## Success criterion (falsable)

Tras el fix, para un workflow agentic wire con N hops HTTP (cada uno con `stopReason: tool_use` excepto el terminal):

1. `result.json.stepCount === N` (N = directorios `steps/` del workflow).
2. `events.ndjson` contiene exactamente N_tool `tool_result` (uno por `tool_call`).
3. `finalText` aparece **solo** en el workflow wire agentic (no en el shell `workflowId === sessionId`).
4. `meta.json` del shell usa `interactionType: "session-shell"` (o equivalente documentado), no `"main"`.

## Non-regression criterion

- Suite de tests existente verde (o solo fallos preexistentes no introducidos).
- Unificación request/response por hop (caso `align-wire-step-request-response`) intacta.
- Persistencia `tool_result` en disco sigue funcionando (caso residual-gaps).

## Boundaries

- No migrar sesiones históricas en disco.
- No abordar enriquecimiento de `server/logs.jsonl` en este change (deuda D-Pino).

## Acceptance check

Enunciado medible con criterios 1–4 verificables por test automatizado o inspección de artefactos de sesión.
