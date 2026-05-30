# gateway-audit-projection Specification

## Purpose

Proyección hook-driven de `IWorkflowResult` al layout flat actual (`meta.json` en `sessions/{session}/{interaction}/`)
mediante `AuditWorkflowClosureHandler` y mapper L2 desde `WorkflowResult`. Implementado en fase G4 (2026-05-29).

## Requirements

### Requirement: AuditWorkflowClosureHandler — proyección de WorkflowResult a disco

El sistema SHALL proveer `AuditWorkflowClosureHandler` en `src/3-operations/audit-workflow-closure.handler.ts` (capa 3) que reciba el `IWorkflowResult` producido por `IWorkflowRepository.close()` junto con el contexto de persistencia (`sessionDir`, `interactionDir`, hook de cierre) y proyecte el resultado a disco. El handler SHALL separar la responsabilidad de **qué escribir** del **cuándo cerrar** (que permanece en `AuditHookEventHandler`). La proyección de `meta.json` SHALL producir un artefacto equivalente al layout flat actual (`sessions/{sessionId}/{interactionId}/meta.json`) derivado de `WorkflowResult` mediante un mapper dedicado, no construyendo `InteractionMetadata` directamente en los handlers wire como fuente primaria. El layout de directorios bajo `sessions/` NO SHALL cambiar en G4.

Referencia: [§28b](../../docs/proposals/gateway-design.md#28b-integración-correlador--bus-de-eventos--persistencia), [§40](../../docs/proposals/gateway-design.md#40-capa-2-objetivo).

#### Scenario: Hook Stop cierra workflow y dispara proyección

- **GIVEN** un workflow main con steps cerrados en el correlador
- **WHEN** `AuditHookEventHandler` procesa un hook `Stop` que invoca `close()` y obtiene `IWorkflowResult`
- **THEN** SHALL invocarse `AuditWorkflowClosureHandler` con ese resultado
- **AND** `meta.json` en el directorio de interacción SHALL reflejar `outcome`, `stepCount`, `usage` y campos alineados al mapper desde `WorkflowResult`

#### Scenario: Separación cuándo cerrar vs qué escribir

- **GIVEN** un hook de cierre que pasa `readyToClose` y ejecuta `close()`
- **WHEN** el closure handler proyecta a disco
- **THEN** `AuditHookEventHandler` NO SHALL escribir `meta.json` directamente
- **AND** toda escritura de cierre del turno SHALL pasar por `AuditWorkflowClosureHandler`

### Requirement: Delegación del hook handler al closure handler tras close

`AuditHookEventHandler` (capa 3) SHALL, tras invocar `close(workflowId, hook)` con éxito en eventos `Stop`, `SubagentStop` y `StopFailure`, delegar la proyección a disco en `AuditWorkflowClosureHandler`. El handler de hooks SHALL resolver `sessionDir` e `interactionDir` desde el contexto del workflow/interacción activa. Si `close()` no produce un workflow cerrado (workflow ausente), la delegación NO SHALL ejecutarse.

#### Scenario: SubagentStop proyecta resultado del sub-workflow

- **GIVEN** un sub-workflow activo identificado por `agentId`
- **WHEN** `AuditHookEventHandler` procesa `SubagentStop` y cierra el sub-workflow
- **THEN** `AuditWorkflowClosureHandler` SHALL recibir el `IWorkflowResult` del sub-workflow
- **AND** SHALL proyectar `meta.json` en el directorio de interacción del subagente

### Requirement: Cierre wire-only degradado a fallback

El cierre del turno basado únicamente en `stop_reason` del wire (sin hook `Stop`/`SubagentStop`) NO SHALL ser la ruta principal de escritura de `meta.json` en G4. El sistema SHALL conservar un fallback wire-only documentado (`@deprecated-fallback`) cuando los hooks no disparan.

#### Scenario: Cierre normativo vía hooks

- **GIVEN** hooks configurados y un workflow con steps registrados desde wire
- **WHEN** llega el hook `Stop` tras completar el turno
- **THEN** `meta.json` SHALL escribirse vía `AuditWorkflowClosureHandler` tras `close()`
- **AND** la ruta wire-only NO SHALL ser la única escritura de cierre en el flujo nominal

### Requirement: Retiro de InteractionMetadata como fuente primaria de meta.json

Los handlers wire (`AuditSseResponseHandler`, `AuditStandardResponseHandler`) NO SHALL construir `InteractionMetadata` como fuente primaria de `meta.json` al cierre del turno nominal con hooks. El tipo `InteractionMetadata` MAY permanecer como `@deprecated` para consumidores transitorios (p. ej. `audit-upstream-error.handler.ts`).
