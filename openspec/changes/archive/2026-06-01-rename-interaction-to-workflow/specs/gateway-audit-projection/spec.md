## RENAMED Requirements

### Requirement: AuditInteractionContext → AuditWorkflowContext

FROM: `AuditInteractionContext`
TO: `AuditWorkflowContext`

La interfaz que desacopla los handlers L3 de Fastify SHALL renombrarse a `AuditWorkflowContext`.
Sus campos SHALL renombrarse en la misma operación:
- `auditInteractionDir` → `auditWorkflowDir`
- `interactionType` → `workflowKind` (tipo: `WorkflowRequestKind`)

Los augments de Fastify (`fastify.augments.d.ts`) SHALL actualizar los campos del request:
- `request.auditInteractionDir` → `request.auditWorkflowDir`
- `request.interactionType` → `request.workflowKind`

---

## MODIFIED Requirements

### Requirement: AuditWorkflowClosureHandler — proyección de WorkflowResult a disco

`AuditWorkflowClosureHandler` SHALL delegar la escritura de `meta.json` y `output/result.json` a `SessionPersistence` a través del `EventBus`. El handler SHALL seguir existiendo como orquestador de capa 3 que coordina el cierre y las métricas de sesión, pero NO SHALL escribir archivos directamente. La secuencia es:

1. `AuditHookEventHandler` invoca `close()` en el correlador.
2. El correlador emite `workflow_complete` (o `workflow_cancel`) al `EventBus`.
3. `SessionPersistence` recibe el evento y proyecta `meta.json` + `output/result.json` a disco.

El layout bajo `sessions/` SHALL ser `causal-workflows-v1` (`sessions/{sessionId}/workflows/NN/`).

El handler L3 que orquesta la auditoría del request SHALL llamarse `AuditWorkflowHandler`
(renombrado desde `AuditInteractionHandler`). El archivo SHALL ser `audit-workflow.handler.ts`.
Los métodos de gestión de workflows huérfanos SHALL llamarse `closeOrphanWorkflow()` y
`getOpenWorkflowsForShutdown()` (sin cambio de semántica).

#### Scenario: Hook Stop cierra workflow y persistencia proyecta vía bus

- **GIVEN** un workflow main con steps cerrados en el correlador
- **WHEN** `AuditHookEventHandler` procesa un hook `Stop` que invoca `close()` y obtiene `IWorkflowResult`
- **THEN** el correlador SHALL emitir `workflow_complete` al bus
- **AND** `SessionPersistence` SHALL recibir el evento y escribir `meta.json` y `output/result.json` en `workflows/NN/`
- **AND** `AuditWorkflowHandler` NO SHALL escribir archivos directamente

#### Scenario: Separación cuándo cerrar vs qué escribir se mantiene

- **GIVEN** un hook de cierre que pasa `readyToClose` y ejecuta `close()`
- **WHEN** el correlador emite el evento al bus
- **THEN** `AuditHookEventHandler` NO SHALL escribir `meta.json` directamente
- **AND** `SessionPersistence` SHALL ser el único componente que escribe a disco

#### Scenario: Nombres canónicos en código

- **WHEN** se ejecuta `npm run typecheck` tras el rename
- **THEN** NO SHALL existir referencias a `AuditInteractionHandler`, `AuditInteractionContext`,
  `auditInteractionDir` ni `interactionType` en `src/`
- **AND** NO SHALL existir referencias a `InteractionType` ni `InteractionOutcome` en `src/`
