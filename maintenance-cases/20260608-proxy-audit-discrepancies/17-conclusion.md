---
case_id: 20260608-proxy-audit-discrepancies
profile: corrective
phase: 17-conclusion
chain: closure
version: v1.0
timestamp: 2026-06-08T18:50:00Z
status: done
case_run: 1
inputs: [02-problem-definition.md, 08-analysis.md, 16-solution-analysis.md]
produces: 17-conclusion.md
links: { previous: 16-solution-analysis.md, next: 18-communication.md }
---

# Conclusion — 20260608-proxy-audit-discrepancies

## Verdict

**Resuelto** — causa compuesta confirmada (cierre wire, step_request duplicado, assembler sin text) corregida con fix quirúrgico S1. Suite 594/594 verde.

## Decision

Promover cambio OpenSpec `fix-proxy-audit-causal-gaps` con deltas en `session-persistence` y `gateway-audit-projection`.

## Validated spec (Etapa B)

### session-persistence delta

- `workflow_start` SHALL persistir `interactionType` desde payload `workflowKind` (además de `workflowKind` estructural `main|subagent`).
- `step_request` SHALL recibir el body HTTP parseado completo (incluyendo `messages` con `tool_result` en continuaciones); el correlador NO SHALL emitir `step_request` con `inferenceRequest` vacío.

### gateway-audit-projection delta

- Al recibir `stopReason` terminal (`end_turn`, `max_tokens`) en workflow wire (`workflowId !== sessionId`), el correlador SHALL emitir `workflow_complete` con `outcome: success`.
- `StepAssemblerService` SHALL ensamblar bloques `text` además de `thinking` y `tool_use`.

## Debt

- Métricas de sesión (`total_workflows`, `finalized_workflow_ids`) — prioridad media; no bloquea auditoría causal.
- Re-validación E2E con sesión live post-deploy.

## Lesson (distilled)

> En proyección causal, **nunca emitir `step_request` desde el correlador con inference sintético** — solo los handlers L3 poseen el body HTTP real. Un emit duplicado con `messages: []` destruye la trazabilidad tool→respuesta.

## Acceptance check

Veredicto coherente con 08 y 16. Spec validada para Etapa B.
