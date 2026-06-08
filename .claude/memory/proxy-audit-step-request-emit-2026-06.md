---
name: proxy-audit-step-request-emit
description: No emitir step_request desde el correlador con inference sintético; solo handlers L3 con body HTTP real
tags:
  component: gateway
  defect-class: audit-projection
  profile: corrective
---

En proyección causal (`EventBus` → `SessionPersistence`), `registerStep` en el correlador NO debe emitir `step_request` con `inferenceRequest` sintético (`messages: []`). Solo los handlers L3 (`registerWireStepRequest`) poseen el body HTTP parseado. Un emit duplicado u off-by-one en `stepIndex` sobrescribe `request/body.json` con historial vacío, rompiendo la cadena tool_result → continuación.

Además: workflows wire (`workflowId !== sessionId`) deben recibir `workflow_complete` en stop terminal SSE (`end_turn`); el hook Stop solo cierra el workflow sesión.

Related case: maintenance-cases/20260608-proxy-audit-discrepancies/case.md
