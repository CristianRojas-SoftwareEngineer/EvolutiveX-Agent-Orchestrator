## ADDED Requirements

### Requirement: AuditWorkflowClosureHandler — proyección de WorkflowResult a disco

El sistema SHALL proveer `AuditWorkflowClosureHandler` en `src/3-operations/audit-workflow-closure.handler.ts` (capa 3) que reciba el `IWorkflowResult` producido por `IWorkflowRepository.close()` junto con el contexto de persistencia (`sessionDir`, `interactionDir`, hook de cierre) y proyecte el resultado a disco. El handler SHALL separar la responsabilidad de **qué escribir** del **cuándo cerrar** (que permanece en `AuditHookEventHandler`). La proyección de `meta.json` SHALL producir un artefacto equivalente al layout flat actual (`sessions/{sessionId}/{interactionId}/meta.json`) derivado de `WorkflowResult` mediante un mapper dedicado, no construyendo `InteractionMetadata` directamente en los handlers wire como fuente primaria. El layout de directorios bajo `sessions/` NO SHALL cambiar en G4.

Referencia: [§28b](../../../docs/proposals/gateway-design.md#28b-integración-correlador--bus-de-eventos--persistencia), [§40](../../../docs/proposals/gateway-design.md#40-capa-2-objetivo).

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

#### Scenario: Proyección behavior-preserving del meta.json

- **GIVEN** un workflow cerrado con steps y usage conocidos
- **WHEN** se proyecta el `WorkflowResult` a `meta.json`
- **THEN** los campos observables por consumidores actuales (`outcome`, `stepCount`, `totals`, `startedAt`, `endedAt`, `steps`) SHALL ser equivalentes a los producidos por el pipeline legacy para el mismo turno
- **AND** el layout del directorio de interacción SHALL permanecer `sessions/{session}/{interaction}/`

### Requirement: Delegación del hook handler al closure handler tras close

`AuditHookEventHandler` (capa 3) SHALL, tras invocar `close(workflowId, hook)` con éxito en eventos `Stop`, `SubagentStop` y `StopFailure`, delegar la proyección a disco en `AuditWorkflowClosureHandler`. El handler de hooks SHALL resolver `sessionDir` e `interactionDir` desde el contexto del workflow/interacción activa. Si `close()` no produce un workflow cerrado (workflow ausente), la delegación NO SHALL ejecutarse.

#### Scenario: SubagentStop proyecta resultado del sub-workflow

- **GIVEN** un sub-workflow activo identificado por `agentId`
- **WHEN** `AuditHookEventHandler` procesa `SubagentStop` y cierra el sub-workflow
- **THEN** `AuditWorkflowClosureHandler` SHALL recibir el `IWorkflowResult` del sub-workflow
- **AND** SHALL proyectar `meta.json` en el directorio de interacción del subagente

#### Scenario: StopFailure proyecta outcome api_error

- **GIVEN** un workflow activo y un hook `StopFailure`
- **WHEN** `close()` devuelve `IWorkflowResult` con `outcome: 'api_error'`
- **THEN** el closure handler SHALL persistir `meta.json` con `outcome` reflejando el error

### Requirement: Cierre wire-only degradado a fallback

El cierre del turno basado únicamente en `stop_reason` del wire (sin hook `Stop`/`SubagentStop`) NO SHALL ser la ruta principal de escritura de `meta.json` en G4. El sistema SHALL documentar y conservar un fallback wire-only para límites de hooks (§45) que delega en el mismo mapper de proyección cuando los hooks no disparan, marcado para retiro en fases P.

#### Scenario: Cierre normativo vía hooks

- **GIVEN** hooks configurados y un workflow con steps registrados desde wire
- **WHEN** llega el hook `Stop` tras completar el turno
- **THEN** `meta.json` SHALL escribirse vía `AuditWorkflowClosureHandler` tras `close()`
- **AND** la ruta wire-only NO SHALL ser la única escritura de cierre en el flujo nominal

### Requirement: Retiro de InteractionMetadata como fuente primaria de meta.json

Los handlers wire (`AuditSseResponseHandler`, `AuditStandardResponseHandler`) NO SHALL construir `InteractionMetadata` como fuente primaria de `meta.json` al cierre del turno. El tipo `InteractionMetadata` en `audit.types.ts` MAY permanecer como `@deprecated` mientras existan consumidores transitorios (p. ej. `audit-upstream-error.handler.ts`), pero el mapper desde `WorkflowResult` SHALL ser la vía canónica de proyección en G4.

#### Scenario: Handler SSE no escribe meta.json desde InteractionMetadata al cierre hook-driven

- **GIVEN** un turno que cierra vía hook `Stop`
- **WHEN** se completa el ciclo de cierre
- **THEN** `meta.json` NO SHALL generarse exclusivamente desde construcción inline de `InteractionMetadata` en `AuditSseResponseHandler`
- **AND** la fuente canónica SHALL ser `IWorkflowResult` proyectado por el closure handler

---

## Delta absorbido — rename-interaction-to-workflow (2026-06-01)

> Procedencia: `archive/2026-06-01-rename-interaction-to-workflow/specs/gateway-audit-projection/spec.md`.
> Change complementario sin back-reference al orquestador; absorbido en G4 (2026-06-02).

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

### Requirement: AuditWorkflowClosureHandler — proyección de WorkflowResult a disco (nombres canónicos)

El handler L3 que orquesta la auditoría del request SHALL llamarse `AuditWorkflowHandler`
(renombrado desde `AuditInteractionHandler`). El archivo SHALL ser `audit-workflow.handler.ts`.
Los métodos de gestión de workflows huérfanos SHALL llamarse `closeOrphanWorkflow()` y
`getOpenWorkflowsForShutdown()` (sin cambio de semántica).

#### Scenario: Nombres canónicos en código

- **WHEN** se ejecuta `npm run typecheck` tras el rename
- **THEN** NO SHALL existir referencias a `AuditInteractionHandler`, `AuditInteractionContext`,
  `auditInteractionDir` ni `interactionType` en `src/`
- **AND** NO SHALL existir referencias a `InteractionType` ni `InteractionOutcome` en `src/`
