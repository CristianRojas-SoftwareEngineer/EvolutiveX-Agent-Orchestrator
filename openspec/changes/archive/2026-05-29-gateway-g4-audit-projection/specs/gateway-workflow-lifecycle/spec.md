## ADDED Requirements

### Requirement: Registro y cierre de steps desde handlers wire

`AuditSseResponseHandler` y `AuditStandardResponseHandler` (capa 3) SHALL, al completar cada inferencia, registrar el step en el correlador unificado (`IWorkflowRepository`) invocando `registerStep(workflowId, step)` con un `IStep` construido desde el snapshot del request de inferencia y el resultado ensamblado (`StepAssembler.result()` para SSE; respuesta parseada completa para standard). Cuando el step es terminal (`stopReason === 'end_turn'`), el handler SHALL invocar `closeStep(workflowId, stepId)` inmediatamente al finalizar la inferencia. Cuando el step termina con `tool_use`, el handler SHALL invocar `registerStep` pero NO SHALL invocar `closeStep` hasta el cierre diferido vía hooks (el step permanece abierto en el correlador). Si el workflow no existe en el correlador, las invocaciones SHALL ser no-op defensivo sin error ni interrupción del pipeline legacy.

Referencia: [§41 gateway-design.md](../../../../../docs/proposals/gateway-design.md#41-capa-3-objetivo).

#### Scenario: Inferencia SSE con end_turn registra y cierra el step

- **GIVEN** un workflow main abierto en el correlador para `sessionId`
- **WHEN** `AuditSseResponseHandler` completa un stream con `stopReason: 'end_turn'`
- **THEN** SHALL invocarse `registerStep` con un `IStep` que incluye `inferenceRequest`, `assistantMessage`, `usage` y `stopReason` del ensamblaje
- **AND** SHALL invocarse `closeStep` con el `stepId` del step registrado
- **AND** el step en el correlador SHALL tener `closedAt` asignado

#### Scenario: Inferencia SSE con tool_use registra step abierto

- **GIVEN** un workflow main abierto en el correlador
- **WHEN** `AuditSseResponseHandler` completa un stream con `stopReason: 'tool_use'`
- **THEN** SHALL invocarse `registerStep` con el step ensamblado
- **AND** `closeStep` NO SHALL invocarse en ese momento
- **AND** el step en el correlador SHALL permanecer sin `closedAt`

#### Scenario: Inferencia standard con end_turn registra y cierra el step

- **GIVEN** un workflow abierto en el correlador
- **WHEN** `AuditStandardResponseHandler` completa una respuesta no-streaming con `stop_reason: 'end_turn'`
- **THEN** SHALL invocarse `registerStep` y `closeStep` con el mismo contrato que el handler SSE

#### Scenario: Workflow ausente en correlador es no-op

- **GIVEN** que el correlador no tiene el workflow correspondiente abierto
- **WHEN** un handler wire completa una inferencia
- **THEN** `registerStep` y `closeStep` no mutan estado ni lanzan error
- **AND** el pipeline de auditoría legacy continúa sin alteración
