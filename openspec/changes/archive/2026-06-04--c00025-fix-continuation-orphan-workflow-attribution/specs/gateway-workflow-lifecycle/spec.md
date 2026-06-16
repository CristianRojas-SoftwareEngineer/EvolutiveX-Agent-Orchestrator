# gateway-workflow-lifecycle — Delta

## MODIFIED Requirements

### Requirement: forceClose — closedByEvent omitido cuando el cierre no viene de un hook event

El sistema SHALL modificar `forceClose` en `WorkflowRepositoryService` (`src/2-services/workflow-repository.service.ts`) para que el campo `closedByEvent` del `IWorkflowResult` producido:

- Se omita del objeto (no se incluya) cuando `forceClose` es invocado con un outcome que no proviene de un hook event (`orphaned`, `upstream-error`, `truncated`).
- Continúe siendo el evento hook correspondiente cuando `forceClose` se invoque desde un path que sí tiene un hook event disponible (reservado para futura extensión; en la implementación actual NO aplica).

La implementación SHALL eliminar el literal `closedByEvent: 'StopFailure'` que actualmente aparece en el `IWorkflowResult` construido por `forceClose`, y SHALL emitir el evento `workflow_complete` al `EventBus` con la misma forma que `close()` para mantener consistencia de observabilidad.

#### Scenario: forceClose por orphan no incluye closedByEvent en el result

- **GIVEN** un workflow con id `session-wire-3` y `result === null` (aún no cerrado)
- **AND** `findWorkflowByToolUseId` no encontró el parent para una continuation
- **WHEN** `forceClose('session-wire-3', 'orphaned', { continuationOrphan: true })` se invoca
- **THEN** el `IWorkflowResult` SHALL tener `outcome: 'orphaned'` y `stepCount: 0`
- **AND** el `IWorkflowResult` SHALL NO tener la clave `closedByEvent`
- **AND** el evento `workflow_complete` SHALL emitirse al bus con `outcome: 'orphaned'`
- **AND** `workflow.status` SHALL quedar como `'failed'`
- **AND** el índice `toolUseIdToWorkflowId` SHALL limpiar las entradas asociadas a `session-wire-3`

#### Scenario: forceClose por upstream-error no incluye closedByEvent

- **GIVEN** un workflow activo con id `wf-1`
- **WHEN** `forceClose('wf-1', 'upstream-error', { httpStatus: 502 })` se invoca
- **THEN** el `IWorkflowResult` SHALL tener `outcome: 'upstream-error'`
- **AND** el `IWorkflowResult` SHALL NO tener la clave `closedByEvent`

#### Scenario: close con hook event mantiene closedByEvent

- **GIVEN** un workflow activo
- **WHEN** `close(workflowId, hook)` se invoca con un hook event válido (ej. `Stop`, `SubagentStop`, `StopFailure`)
- **THEN** el `IWorkflowResult` SHALL incluir `closedByEvent: hook.eventName`
- **AND** la invariante previa a este cambio SHALL preservarse

### Requirement: clearToolUseIndexFor — limpieza explícita del índice de correlación

El sistema SHALL añadir a `IWorkflowRepository` (`src/1-domain/repositories/IWorkflowRepository.ts`) el método:

```typescript
public clearToolUseIndexFor(workflowId: string): void
```

Su implementación en `WorkflowRepositoryService` SHALL eliminar todas las entradas de `toolUseIdToWorkflowId` cuyo valor asociado sea `workflowId`. El método SHALL ser no-op si el `workflowId` no tiene entradas asociadas o si el workflow no existe en el repo.

Este método SHALL reemplazar el bucle inline actualmente presente en `forceClose` (líneas 309-311) para hacer la limpieza reutilizable desde otros paths (SSE error handler, audit-upstream-error).

#### Scenario: clearToolUseIndexFor elimina entradas del workflow

- **GIVEN** un `WorkflowRepositoryService` con `toolUseIdToWorkflowId` conteniendo `{ 'tu-1': 'wf-A', 'tu-2': 'wf-B', 'tu-3': 'wf-A' }`
- **WHEN** `clearToolUseIndexFor('wf-A')` se invoca
- **THEN** el índice SHALL quedar con `{ 'tu-2': 'wf-B' }`
- **AND** las entradas `'tu-1'` y `'tu-3'` SHALL eliminarse

#### Scenario: clearToolUseIndexFor es no-op para workflowId sin entradas

- **GIVEN** un `WorkflowRepositoryService` con `toolUseIdToWorkflowId` vacío
- **WHEN** `clearToolUseIndexFor('wf-any')` se invoca
- **THEN** la operación retorna sin error
- **AND** el índice permanece vacío
