---
case_id: 20260608-proxy-audit-discrepancies
profile: corrective
phase: 01-observation
chain: cause
version: v1.0
timestamp: 2026-06-08T18:35:00Z
status: done
inputs: [análisis sesión 7dd03f66-5838-474a-b640-409c3e8d49a0]
produces: 01-observation.md
links: { previous: "", next: 02-problem-definition }
---

# Observation — 20260608-proxy-audit-discrepancies

## Applied policy

- **focus:** síntomas + pasos de reproducción
- **reasoning_effort:** medium
- **evidence:** stack_trace, repro_steps
- **acceptance:** fallo reproducible o caracterizado con precisión

## Observed facts

| # | Fecha | Fuente | Hecho observable |
|---|-------|--------|------------------|
| 1 | 2026-06-08 | `sessions/7dd03f66-…/workflows/workflow-sequence.json` | Workflows índices 1 y 2 (`wire-1`, `wire-2`) permanecen `status: "running"` tras fin de sesión. |
| 2 | 2026-06-08 | `sessions/7dd03f66-…/events.ndjson` | Un solo evento `workflow_complete` para `workflowId = sessionId`; ninguno para workflows wire. |
| 3 | 2026-06-08 | `sessions/7dd03f66-…/events.ndjson` | Cero eventos `tool_result` en toda la sesión. |
| 4 | 2026-06-08 | `workflows/02/steps/01/tools/00-Bash/meta.json` | Tool Bash `call_019ea956731a7de3a30bdafe` con `status: "running"`; no existe `result.json`. |
| 5 | 2026-06-08 | `workflows/02/steps/02/request/body.json` | Continuación post-Bash con `"messages": []` (modelo y max_tokens presentes). |
| 6 | 2026-06-08 | `workflows/02/steps/03/response/body.json` | Solo bloque `thinking`; el markdown final (~575 chunks SSE) ausente del body coalesced. |
| 7 | 2026-06-08 | `workflows/01/steps/01/response/body.json` | Side-request título: solo thinking; JSON `{"title":…}` ausente del body. |
| 8 | 2026-06-08 | Harness `.jsonl` línea 9 | `tool_result` con stdout completo de `git show --stat` presente en harness nativo. |
| 9 | 2026-06-08 | `workflows/00/output/result.json` | `stepCount: 0` pese a 4 steps en wire-2. |
| 10 | 2026-06-08 | `session-metrics.json` | `total_workflows: 0` y `finalized_workflow_ids: []` con 3 workflows en disco. |
| 11 | 2026-06-08 | `workflows/*/meta.json` | Los tres workflows registran `workflowKind: "main"`; no distingue `side-request` vs `agentic`. |
| 12 | 2026-06-08 | `events.ndjson` | Cada `workflow_start` emite dos `step_request` casi simultáneos (índices 0 y 1). |

## Reproduction steps

1. Iniciar proxy con auditoría activa (`causal-workflows-v1`).
2. Ejecutar sesión Claude Code simple: un turno agentic con una invocación Bash (p. ej. investigar un commit).
3. Esperar `end_turn` y hook `Stop`.
4. Inspeccionar `sessions/<sessionId>/workflows/` y `events.ndjson`.
5. Comparar con harness `.jsonl` nativo de la misma sesión.

**Resultado esperado (contrato):** cada workflow wire cierra con `workflow_complete`; tools client-side tienen `result.json`; continuaciones preservan historial; `body.json` refleja todos los bloques SSE.

**Resultado observado:** workflows wire huérfanos; tool sin cerrar; messages vacíos; body incompleto.

## Context

- Sesión de prueba lineal sin subagentes.
- Diseño dual-layer documentado: workflow sesión (`00`) + workflows wire (`01`, `02`).
- El texto final del usuario sí llega a `workflows/00/output/result.json` vía hook Stop.

## Scope

**In scope:** cierre de workflows wire, persistencia `tool_result`, proyección de request en continuaciones, coalescencia SSE→`body.json` (bloques `text`), taxonomía `interactionType` en meta, coherencia métricas.

**Out of scope:** rediseño del layout dual-layer; diferencias intencionales de estructura vs harness JSONL plano.

## Not interpreted

Los hechos anteriores describen síntomas y evidencia en disco. No se atribuye causa raíz ni se propone fix en este artefacto.

## Acceptance check

Fallo reproducible con pasos concretos y 12 hechos fechados con fuente verificable. Alcance delimitado. Sin interpretación causal.
