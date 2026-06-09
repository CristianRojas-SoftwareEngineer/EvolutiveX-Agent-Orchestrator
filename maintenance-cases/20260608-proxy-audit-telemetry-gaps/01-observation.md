---
case_id: 20260608-proxy-audit-telemetry-gaps
profile: corrective
phase: 01-observation
chain: cause
version: v1.0
timestamp: 2026-06-08T14:05:00Z
status: done
inputs: []
produces: 01-observation.md
links: { previous: , next: 02-problem-definition.md }
---

# Observation — 20260608-proxy-audit-telemetry-gaps

## Applied policy

- **focus:** síntomas + pasos de reproducción
- **evidence:** análisis `/analyze-session` sesión `dcdf0a15-4f0b-4a77-864e-1e481b07315c` (2026-06-09)
- **acceptance:** fallo reproducible o caracterizado con precisión

## Observed facts

| ID | Fecha fuente | Hecho observable |
|----|--------------|------------------|
| O1 | 2026-06-09 | Sesión `dcdf0a15-4f0b-4a77-864e-1e481b07315c`: turno agentic lineal, 6 `tool_use` (3× Bash, Read error, Glob, Read), sin subagentes. |
| O2 | 2026-06-09 | Proxy materializó 3 workflows (`00` sesión, `01` side-request título, `02` agentic wire). Árbol `workflows/02/steps/00..05/` con 6 tools correlados. |
| O3 | 2026-06-09 | `workflows/02/output/result.json` reporta `stepCount: 1` pese a 6 directorios `steps/` y 7 eventos `step_request` en `events.ndjson`. |
| O4 | 2026-06-09 | `events.ndjson`: 6 `tool_call` y **12** `tool_result` (ratio 2:1 por tool). |
| O5 | 2026-06-09 | `finalText` (explicación final en español) idéntico en `workflows/00/output/result.json` y `workflows/02/output/result.json`. |
| O6 | 2026-06-09 | `workflows/00/meta.json`: `interactionType: "main"`; documentación cita taxonomía `agentic \| client-preflight \| side-request`. |
| O7 | 2026-06-09 | Harness nativo: correlación lineal correcta; título vía evento `ai-title`; 6 tools con IDs coincidentes en proxy. |
| O8 | 2026-06-09 | `server/logs.jsonl`: sin warnings `[audit]` para esta sesión; 7 POST `/v1/messages` + hooks. |
| O9 | 2026-06-09 | Casos SM previos cerrados: `proxy-audit-discrepancies`, `proxy-audit-residual-gaps`, `proxy-step-request-response-split` (fix unify request/response aplicado). |

## Context

Análisis comparativo post-fix de unificación wire step. La captura estructural (tools, steps, SSE) es fiel; las brechas son de **metadatos agregados** y **telemetría EventBus**.

## Scope

- **In:** `stepCount`, duplicación `tool_result`, duplicación `finalText`, `interactionType` sesión.
- **Out:** subagentes, client-preflight, enriquecimiento Pino (prioridad media, deuda separada).

## Not interpreted

No se atribuye causa en esta fase. La sesión en disco ya no está presente en el workspace al reabrir el caso; la evidencia proviene del análisis documentado y del código vigente.

## Acceptance check

Síntomas acotados y trazables a fuentes fechadas; sin hipótesis de causa.
