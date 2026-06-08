---
case_id: 20260608-proxy-audit-residual-gaps
profile: corrective
phase: 01-observation
chain: cause
version: v1.0
timestamp: 2026-06-08T23:30:00Z
status: done
inputs: [análisis sesión c5eb2667-8de6-42ab-8474-ba82877b344c]
produces: 01-observation.md
links: { previous: "", next: 02-problem-definition.md }
---

# Observation — 20260608-proxy-audit-residual-gaps

## Applied policy

- **focus:** síntomas + pasos de reproducción
- **acceptance:** fallo reproducible o caracterizado con precisión

## Observed facts

| # | Fecha | Fuente | Hecho observable |
|---|-------|--------|------------------|
| 1 | 2026-06-08 | `sessions/c5eb2667-…/events.ndjson` | `tool_call: 2`, `tool_result: 0`. |
| 2 | 2026-06-08 | `workflows/02/steps/01/tools/00-Bash/meta.json` | `status: "running"`; no existe `result.json`. |
| 3 | 2026-06-08 | `workflows/02/steps/02/request/body.json` | Continuación contiene bloques `tool_result` en `messages` (fix H2 del caso anterior OK). |
| 4 | 2026-06-08 | `session-metrics.json` | `total_workflows: 0`, `total_steps: 2`; `finalized_workflow_ids: []`. |
| 5 | 2026-06-08 | `workflow-sequence.json` | 3 workflows (`00`, `wire-1`, `wire-2`) todos `completed`. |
| 6 | 2026-06-08 | `workflows/00/output/result.json` | `stepCount: 0` con `finalText` presente. |
| 7 | 2026-06-08 | `server/logs.jsonl` | 2 entradas `PreToolUse`; 0 entradas `PostToolUse`; 116 `hook desconocido` con `eventName: ""`. |
| 8 | 2026-06-08 | `~/.claude/settings.json` | Clave `PostToolUse` ausente; `PreToolUse` y `PostToolUseFailure` presentes. |
| 9 | 2026-06-08 | `configs/hooks.json` | `PostToolUse` con `matcher: "*"` y `post-hook-event.ts` definido en plantilla canónica. |
| 10 | 2026-06-08 | Caso previo `20260608-proxy-audit-discrepancies` | H4 (`tool_result`) marcada parcialmente confirmada; validación post-fix muestra persistencia aún rota. |

## Reproduction steps

1. Proxy activo con auditoría causal.
2. Sesión agentic con 2 invocaciones Bash (sesión `c5eb2667` o equivalente).
3. Inspeccionar `events.ndjson`, `tools/*/meta.json`, `session-metrics.json`, `server/logs.jsonl`.

## Scope

**In scope:** persistencia `tool_result`, conteo `total_workflows`, `stepCount` workflow sesión, ruido hooks vacíos.

**Out of scope:** rediseño layout dual-layer; migración harness JSONL plano.

## Not interpreted

Hechos observables sin atribución causal.

## Acceptance check

10 hechos fechados con fuente; pasos de reproducción concretos; alcance delimitado.
