# gateway-audit-projection Specification (Delta P1)

## Purpose

Delta de P1 sobre el spec `gateway-audit-projection`: la proyección de `WorkflowResult` a disco se delega completamente a `SessionPersistence` (suscriptor del bus) en lugar de `AuditWorkflowClosureHandler` escribiendo directamente. El layout flat se retira.

## MODIFIED Requirements

### Requirement: AuditWorkflowClosureHandler — proyección de WorkflowResult a disco

`AuditWorkflowClosureHandler` SHALL delegar la escritura de `meta.json` y `output/result.json` a `SessionPersistence` a través del `EventBus`. El handler SHALL seguir existiendo como orquestador de capa 3 que coordina el cierre, pero NO SHALL escribir archivos directamente. La secuencia es:

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

### Requirement: Retiro del layout flat

El sistema SHALL retirar el layout flat de sesiones. Los siguientes componentes SHALL eliminarse:

- `audit-writer.service.ts` — reemplazado por `SessionPersistence`
- `session-store.service.ts` — reemplazado por `WorkflowRepositoryService` + `EventBus`
- `workflow-result-projector.service.ts` — reemplazado por `SessionPersistence`
- Constantes flat de `audit-paths.ts` (`DIR_MAIN_AGENT`, `DIR_INTERACTIONS`, `PREFIX_SUB_AGENT`) — reemplazadas por `session-routing.ts`
- Tipos `ActiveInteraction` / `InteractionMetadata` — reemplazados por tipos gateway

#### Scenario: No existen referencias a componentes flat retirados

- **WHEN** se ejecuta `npm run lint` y `npm run typecheck`
- **THEN** NO SHALL existir referencias a `AuditWriterService`, `SessionStoreService`, `WorkflowResultProjector`, `ActiveInteraction` o `InteractionMetadata` en código de producción
- **AND** las constantes `DIR_MAIN_AGENT`, `DIR_INTERACTIONS`, `PREFIX_SUB_AGENT` NO SHALL existir

#### Scenario: Sesiones nuevas usan layout causal-workflows-v1

- **GIVEN** un proxy con P1 implementado
- **WHEN** se procesa una solicitud completa (workflow + steps + tools)
- **THEN** los archivos de sesión SHALL crearse bajo `sessions/<id>/workflows/NN/steps/MM/tools/KK/`
- **AND** NO SHALL crearse archivos bajo el layout flat (`sessions/<id>/<interactionId>/`)
