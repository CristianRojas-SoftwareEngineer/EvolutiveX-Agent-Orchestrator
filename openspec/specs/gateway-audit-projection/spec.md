# gateway-audit-projection Specification

## Purpose

Proyección de auditoría vía `EventBus` + `SessionPersistence` al layout `causal-workflows-v1` (`sessions/{sessionId}/workflows/NN/`).
Los handlers L3 publican eventos; `SessionPersistence` escribe `meta.json`, steps, tools y `output/result.json`.
`AuditWorkflowClosureHandler` conserva métricas de sesión sin escribir disco. Actualizado en fase P1 (2026-05-30).

## Requirements

### Requirement: AuditWorkflowClosureHandler — proyección de WorkflowResult a disco

`AuditWorkflowClosureHandler` SHALL delegar la escritura de `meta.json` y `output/result.json` a `SessionPersistence` a través del `EventBus`. El handler SHALL seguir existiendo como orquestador de capa 3 que coordina el cierre y las métricas de sesión, pero NO SHALL escribir archivos directamente. La secuencia es:

1. `AuditHookEventHandler` invoca `close()` en el correlador.
2. El correlador emite `workflow_complete` (o `workflow_cancel`) al `EventBus`.
3. `SessionPersistence` recibe el evento y proyecta `meta.json` + `output/result.json` a disco.

El layout bajo `sessions/` SHALL ser `causal-workflows-v1` (`sessions/{sessionId}/workflows/NN/`).

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

### Requirement: Delegación del hook handler — métricas sin escritura directa

`delegateClosure()` en `AuditHookEventHandler` SHALL invocar solo `sessionMetrics.updateFromWorkflow()` cuando el workflow sea de kind `main`. NO SHALL invocar `AuditWorkflowClosureHandler.execute()` ni resolver rutas flat legacy.

### Requirement: Cierre wire-only degradado a fallback

El cierre del turno basado únicamente en `stop_reason` del wire (sin hook `Stop`/`SubagentStop`) NO SHALL ser la ruta principal de escritura de `meta.json` en G4. El sistema SHALL conservar un fallback wire-only documentado (`@deprecated-fallback`) cuando los hooks no disparan.

#### Scenario: Cierre normativo vía hooks

- **GIVEN** hooks configurados y un workflow con steps registrados desde wire
- **WHEN** llega el hook `Stop` tras completar el turno
- **THEN** `meta.json` SHALL escribirse vía `AuditWorkflowClosureHandler` tras `close()`
- **AND** la ruta wire-only NO SHALL ser la única escritura de cierre en el flujo nominal

### Requirement: Retiro de InteractionMetadata como fuente primaria de meta.json

Los handlers wire (`AuditSseResponseHandler`, `AuditStandardResponseHandler`) NO SHALL construir `InteractionMetadata` como fuente primaria de `meta.json` al cierre del turno nominal con hooks. El tipo `InteractionMetadata` MAY permanecer como `@deprecated` para consumidores transitorios (p. ej. `audit-upstream-error.handler.ts`).

#### Scenario: Ruta nominal de cierre no construye InteractionMetadata

- **GIVEN** hooks configurados y un workflow con cierre normativo vía hook `Stop`
- **WHEN** el turno finaliza y `AuditWorkflowClosureHandler` proyecta el resultado a disco
- **THEN** `meta.json` SHALL derivarse de `IWorkflowResult` mediante el mapper dedicado
- **AND** los handlers wire (`AuditSseResponseHandler`, `AuditStandardResponseHandler`) NO SHALL escribir `meta.json` como fuente primaria en ese flujo

### Requirement: Retiro de componentes legacy (P1)

El sistema SHALL retirar `SessionStoreService`, `WorkflowResultProjector`, el puerto `ISessionStore` y el puerto `IAuditWriter`. Los handlers L3 SHALL usar `IWorkflowRepository` + `EventBus`. Las escrituras SSE inline SHALL usar `ISseAuditWriter` (`AuditWriterService`, `@deprecated-p2`) hasta P2.

#### Scenario: Sesiones nuevas usan layout causal-workflows-v1

- **GIVEN** un proxy con P1 implementado
- **WHEN** se procesa una solicitud completa (workflow + steps + tools)
- **THEN** los archivos de sesión SHALL crearse bajo `sessions/<id>/workflows/NN/steps/MM/tools/KK/`
- **AND** NO SHALL crearse archivos bajo el layout flat (`main-agent/interactions/`)

#### Scenario: No existen referencias a ISessionStore en producción

- **WHEN** se ejecuta `npm run typecheck`
- **THEN** NO SHALL existir referencias a `ISessionStore` ni `SessionStoreService` en `src/`
