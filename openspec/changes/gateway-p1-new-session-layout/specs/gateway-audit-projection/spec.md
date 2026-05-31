# gateway-audit-projection Specification (Delta P1)

## Purpose

Delta de P1 sobre el spec `gateway-audit-projection`: la proyección de `WorkflowResult` a disco se delega completamente a `SessionPersistence` (suscriptor del bus) en lugar de `AuditWorkflowClosureHandler` escribiendo directamente. El layout flat se retira.

## MODIFIED Requirements

### Requirement: AuditWorkflowClosureHandler — proyección de WorkflowResult a disco

`AuditWorkflowClosureHandler` SHALL delegar la escritura de `meta.json` y `output/result.json` a `SessionPersistence` a través del `EventBus`. El handler SHALL seguir existiendo como orquestador de capa 3 que coordina el cierre y las métricas de sesión, pero NO SHALL escribir archivos directamente. La secuencia es:

1. `AuditHookEventHandler` invoca `close()` en el correlador.
2. El correlador emite `workflow_complete` (o `workflow_cancel`) al `EventBus`.
3. `SessionPersistence` recibe el evento y proyecta `meta.json` + `output/result.json` a disco.

El layout de directorios bajo `sessions/` SHALL cambiar de flat (`sessions/{sessionId}/{interactionId}/`) a `causal-workflows-v1` (`sessions/{sessionId}/workflows/NN/`).

#### Scenario: Hook Stop cierra workflow y persistencia proyecta vía bus

- **GIVEN** un workflow main con steps cerrados en el correlador
- **WHEN** `AuditHookEventHandler` procesa un hook `Stop` que invoca `close()` y obtiene `IWorkflowResult`
- **THEN** el correlador SHALL emitir `workflow_complete` al bus
- **AND** `SessionPersistence` SHALL recibir el evento y escribir `meta.json` y `output/result.json` en `workflows/NN/`
- **AND** `AuditWorkflowClosureHandler` NO SHALL escribir archivos directamente

#### Scenario: Separación cuándo cerrar vs qué escribir se mantiene

- **GIVEN** un hook de cierre que pasa `readyToClose` y ejecuta `close()`
- **WHEN** el correlador emite el evento al bus
- **THEN** `AuditHookEventHandler` NO SHALL escribir `meta.json` directamente
- **AND** `SessionPersistence` SHALL ser el único componente que escribe a disco

---

### Requirement: AuditWorkflowClosureHandler — delegación de escritura a SessionPersistence

`AuditWorkflowClosureHandler` SHALL delegar la escritura de `meta.json` y `output/result.json` a `SessionPersistence` a través del `EventBus`. El handler SHALL conservar la responsabilidad de actualizar métricas de sesión (`SessionMetricsService.updateFromWorkflow()`) para workflows main, pero NO SHALL escribir archivos de interacción directamente.

`delegateClosure()` en `AuditHookEventHandler` SHALL simplificarse: ya no resolverá `sessionDir`/`interactionDir` ni invocará `closureHandler.execute()`. Solo invocará `sessionMetrics.updateFromWorkflow()` cuando el workflow sea de kind `main`.

#### Scenario: delegateClosure solo actualiza métricas, no escribe disco

- **GIVEN** un workflow main cerrado exitosamente vía `close()`
- **WHEN** `AuditHookEventHandler` invoca `delegateClosure()`
- **THEN** `AuditWorkflowClosureHandler.execute()` NO SHALL ser invocado
- **AND** `SessionMetricsService.updateFromWorkflow()` SHALL ser invocado para workflows main
- **AND** `SessionPersistence` SHALL haber escrito `meta.json` y `output/result.json` vía el bus

#### Scenario: delegateClosure para sub-workflows no actualiza métricas

- **GIVEN** un sub-workflow cerrado exitosamente vía `close()`
- **WHEN** `AuditHookEventHandler` invoca `delegateClosure()`
- **THEN** `SessionMetricsService.updateFromWorkflow()` NO SHALL ser invocado (solo main)

---

### Requirement: Retiro completo del modelo legacy

El sistema SHALL retirar completamente el modelo `Interaction` legacy. Los siguientes componentes SHALL eliminarse:

- `audit-writer.service.ts` — reemplazado por `SessionPersistence` (vía EventBus)
- `session-store.service.ts` — reemplazado por `WorkflowRepositoryService` (métodos de lookup) + `EventBus`
- `workflow-result-projector.service.ts` — reemplazado por `SessionPersistence`
- Puerto `ISessionStore` — reemplazado por `IWorkflowRepository` ampliado
- Puerto `IAuditWriter` — reemplazado por `SessionPersistence` (vía EventBus)
- Constantes flat de `audit-paths.ts` (`DIR_MAIN_AGENT`, `DIR_INTERACTIONS`, `PREFIX_SUB_AGENT`) — reemplazadas por `session-routing.ts`
- Tipos `ActiveInteraction`, `InteractionMetadata`, `StepMeta`, `InteractionType`, `InteractionState`, `InteractionOutcome`, `ParentContext`, `SideRequestKind`, `PendingAgentToolUse`, `PendingWebSearchToolUse`, `PendingWebFetchToolUse`, `ResolvedInternalTool` — reemplazados por tipos gateway (`IWorkflow`, `IStep`, `IToolUse`, `IWorkflowResult`, `WorkflowKind`, `WorkflowStatus`, `WorkflowOutcome`)

Los 6 handlers de capa 3 SHALL migrar a tipos gateway antes de la eliminación:
- `gateway-wire-step.util.ts` — firmas de `ActiveInteraction` → `IWorkflow`
- `audit-upstream-error.handler.ts` — `ISessionStore` → `IWorkflowRepository`, `IAuditWriter` → EventBus
- `audit-workflow-closure.handler.ts` — eliminar `turn: ActiveInteraction` del contexto
- `audit-standard-response.handler.ts` — `ISessionStore` → `IWorkflowRepository`, `IAuditWriter` → EventBus
- `audit-sse-response.handler.ts` — `ISessionStore` → `IWorkflowRepository`, `IAuditWriter` → EventBus (SSE writes: ver nota)
- `audit-interaction.handler.ts` — `ISessionStore` → `IWorkflowRepository`, `IAuditWriter` → EventBus

**Nota sobre SSE writes:** `audit-sse-response.handler.ts` retiene un writer SSE inline con interfaz mínima (`appendSseLine`, `appendSseRawChunk`) hasta que P2 implemente la suscripción a `stream_chunk`. Este writer NO es `IAuditWriter` completo; es una dependencia temporal documentada como `@deprecated-p2`.

#### Scenario: No existen referencias a componentes legacy retirados

- **WHEN** se ejecuta `npm run lint` y `npm run typecheck`
- **THEN** NO SHALL existir referencias a `AuditWriterService`, `SessionStoreService`, `WorkflowResultProjector`, `ISessionStore`, `IAuditWriter` en código de producción
- **AND** las constantes `DIR_MAIN_AGENT`, `DIR_INTERACTIONS`, `PREFIX_SUB_AGENT` NO SHALL existir
- **AND** los tipos `ActiveInteraction`, `InteractionMetadata`, `StepMeta`, `InteractionType`, `InteractionState`, `InteractionOutcome` NO SHALL existir en código de producción
- **AND** los handlers L3 SHALL usar exclusivamente tipos gateway (`IWorkflow`, `IStep`, `IToolUse`, `IWorkflowResult`)

#### Scenario: Sesiones nuevas usan layout causal-workflows-v1

- **GIVEN** un proxy con P1 implementado
- **WHEN** se procesa una solicitud completa (workflow + steps + tools)
- **THEN** los archivos de sesión SHALL crearse bajo `sessions/<id>/workflows/NN/steps/MM/tools/KK/`
- **AND** NO SHALL crearse archivos bajo el layout flat (`sessions/<id>/<interactionId>/`)
