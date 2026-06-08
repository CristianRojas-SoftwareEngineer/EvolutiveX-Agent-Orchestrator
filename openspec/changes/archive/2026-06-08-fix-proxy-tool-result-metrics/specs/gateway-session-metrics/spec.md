## ADDED Requirements

### Requirement: Finalize métricas al cierre terminal SSE de workflow wire

Cuando un workflow wire (`workflowId !== sessionId`) cierra por stop terminal SSE (`end_turn`, `max_tokens`, etc.) vía `forceClose`, el handler SSE SHALL invocar `finalizeWorkflowMetrics` con los steps cerrados del workflow, incrementando `workflow_count` y `session_totals.total_workflows`.

#### Scenario: Wire workflow agentic cerrado incrementa total_workflows

- **GIVEN** un workflow wire con al menos un step contable con `usage`
- **WHEN** `registerWireStepInCorrelator` cierra el workflow por stop terminal SSE
- **THEN** `session-metrics.json` SHALL tener `total_workflows` incrementado en al menos 1
- **AND** el `workflowId` SHALL quedar en `finalized_workflow_ids` del sidecar
