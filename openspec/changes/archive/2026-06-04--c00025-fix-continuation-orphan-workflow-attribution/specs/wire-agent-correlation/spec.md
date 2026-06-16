# wire-agent-correlation — Delta

## MODIFIED Requirements

### Requirement: SubagentStop resuelve el workflow via getWorkflowByAgentId

El sistema SHALL modificar `AuditHookEventHandler` (`src/3-operations/audit-hook-event.handler.ts`) en el caso `SubagentStop` para que la resolución del workflow del subagente use la indirección correcta `getWorkflowByAgentId(agentId) → getWorkflow(workflowId)`, en lugar de `getWorkflow(agentId)` directo.

La indirección es necesaria porque `agentId` es la clave del índice `WireSubagentEntry` (mapa `index` en el repo), no la clave del índice `Workflow` (mapa `workflows`). Invocar `getWorkflow(agentId)` directamente trata el `agentId` como si fuera un `workflowId`, lo cual solo es correcto por coincidencia cuando el subagente fue abierto con `agentCtx.agentId` presente (en cuyo caso el `workflowId === agentId` por convención de `openSubagentWorkflow`).

#### Scenario: SubagentStop con agentId presente resuelve via getWorkflowByAgentId

- **GIVEN** un subagente abierto en el repo con `agentId: 'agent-child'`
- **AND** el workflow del subagente tiene `id: 'agent-child'` (mapeo directo por convención de `openSubagentWorkflow`)
- **AND** un `ClaudeHookEvent` con `eventName: 'SubagentStop'`, `agentId: 'agent-child'`
- **WHEN** `AuditHookEventHandler.execute(hook)` se invoca
- **THEN** el handler SHALL invocar `getWorkflowByAgentId('agent-child')` primero
- **AND** SHALL usar el `agentId` retornado (o `workflowId` si la indirección lo define) para invocar `getWorkflow`
- **AND** el workflow SHALL quedar cerrado con `outcome` derivado del resultado de `buildWorkflowResult`

#### Scenario: SubagentStop con subagente desconocido no falla

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'SubagentStop'`, `agentId: 'agent-unknown'` (no hay workflow abierto)
- **WHEN** `AuditHookEventHandler.execute(hook)` se invoca
- **THEN** `getWorkflowByAgentId('agent-unknown')` SHALL devolver `undefined`
- **AND** el handler SHALL registrar el evento en log sin lanzar excepción
- **AND** NO SHALL invocarse `close` ni `readyToClose` sobre un workflow inexistente
