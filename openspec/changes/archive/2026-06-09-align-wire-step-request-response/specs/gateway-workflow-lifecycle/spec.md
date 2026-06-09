## MODIFIED Requirements

### Requirement: Registro y cierre de steps desde handlers wire

`AuditWorkflowHandler` (ingress) SHALL abrir un `IStep` por hop HTTP vía `registerWireStepRequest` (`registerStep` + emit `step_request`).

`AuditSseResponseHandler` y `AuditStandardResponseHandler` (egress) SHALL enriquecer el último step sin `closedAt` del workflow mediante `enrichOpenWireStepWithResponse`, asignando `assistantMessage`, `usage` y `stopReason` desde el ensamblaje. NO SHALL invocar `registerStep` para un segundo `IStep` cuando existe step abierto del mismo hop.

Cuando el step es terminal (`stopReason === 'end_turn'` o equivalente), el handler SHALL invocar `closeStep` tras el enriquecimiento. Cuando el step termina con `tool_use`, el handler SHALL enriquecer pero NO SHALL invocar `closeStep` hasta el cierre diferido. Si no hay step abierto (edge case), egress MAY registrar un step nuevo como fallback.

Referencia: [§38 gateway-architecture.md](../../../docs/gateway-architecture.md#38-capa-3--operations), [session-audit-model.md](../../../docs/session-audit-model.md#2-principio-de-diseño).

#### Scenario: Inferencia SSE con end_turn enriquece step abierto

- **GIVEN** un workflow wire con un step abierto registrado por `registerWireStepRequest`
- **WHEN** `AuditSseResponseHandler` completa un stream con `stopReason: 'end_turn'`
- **THEN** SHALL enriquecerse el step existente con `assistantMessage`, `usage` y `stopReason`
- **AND** `workflow.steps.length` SHALL permanecer igual (no +1)
- **AND** SHALL invocarse `closeStep` con el `stepId` del step enriquecido

#### Scenario: Inferencia SSE con tool_use enriquece sin cerrar

- **GIVEN** un workflow wire con step abierto de ingress
- **WHEN** `AuditSseResponseHandler` completa con `stopReason: 'tool_use'`
- **THEN** el step enriquecido SHALL permanecer sin `closedAt`
- **AND** `registerStep` NO SHALL añadir un segundo step

#### Scenario: Tres hops producen tres steps

- **GIVEN** un workflow wire con tres ciclos request+response
- **WHEN** cada egress enriquece el step abierto de su hop
- **THEN** `workflow.steps.length` SHALL ser 3, no 6
