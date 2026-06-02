<!-- Absorbido desde archive/2026-05-30-remove-token-cost-usd (2026-05-30).
     Orquestador: gateway-migration | Fase origen real: G2/G4 (gateway-workflow-lifecycle es capability de G2/G4).
     Incluido en G1 por fusión del change complementario remove-token-cost-usd, cuyo spec primario es gateway-closure-services (G1).
     Absorbido en G1 el 2026-06-02. -->

## MODIFIED Requirements

### Requirement: close — cierre del workflow e idempotencia §28

El sistema SHALL implementar `close(workflowId, hook)` en `IWorkflowRepository`:

- SHALL recopilar los steps cerrados del workflow (`steps` con `closedAt != null`) y los `IWorkflowResult` de sub-workflows completados.
- SHALL invocar `buildWorkflowResult(workflow, closedSteps, childResults, hook)` de G1 para obtener el `IWorkflowResult`.
- SHALL adjuntar el resultado a `workflow.result` y marcar `workflow.status` como `'completed'` (si `outcome === 'success'`) o `'failed'` (si `outcome === 'api_error'`) y asignar `completedAt`.
- SHALL ser **idempotente**: si el workflow ya está cerrado (`result != null`), SHALL ignorar la llamada y devolver el resultado existente sin mutar el estado.

Referencia: idempotencia en [§28 gateway-design.md](../../../../../docs/proposals/gateway-design.md#28-integración-wire--hooks-carreras-y-estados).

#### Scenario: hook Stop → workflow cerrado con outcome success

- **GIVEN** un workflow activo con steps cerrados y un hook `Stop` con `lastAssistantMessage: 'Listo'`
- **WHEN** se invoca `close(workflow.id, hook)`
- **THEN** `workflow.result.outcome` SHALL ser `'success'`
- **AND** `workflow.result.closedByEvent` SHALL ser `'Stop'`
- **AND** `workflow.status` SHALL ser `'completed'`
- **AND** `workflow.result.finalText` SHALL ser `'Listo'`

#### Scenario: hook StopFailure → workflow cerrado con outcome api_error

- **GIVEN** un workflow activo con id `'wf-1'` y un hook `StopFailure`
- **WHEN** se invoca `close('wf-1', hook)`
- **THEN** `workflow.result.outcome` SHALL ser `'api_error'`
- **AND** `workflow.result.closedByEvent` SHALL ser `'StopFailure'`

#### Scenario: segundo hook de cierre ignorado — idempotencia

- **GIVEN** un workflow que ya fue cerrado con un primer hook `Stop`
- **WHEN** se invoca `close(workflow.id, hook)` por segunda vez con un hook `Stop` diferente
- **THEN** el resultado SHALL ser el `IWorkflowResult` del primer cierre sin cambios
- **AND** `workflow.result` SHALL seguir siendo el snapshot del primer cierre
