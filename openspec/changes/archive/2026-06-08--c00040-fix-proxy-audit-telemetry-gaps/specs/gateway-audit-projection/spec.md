## MODIFIED Requirements

### Requirement: Cierre de workflow wire en stop terminal SSE

Cuando `registerWireStepInCorrelator` registra un step con `stopReason` terminal (`end_turn`, `max_tokens`, o ausente tras stream completo) en un workflow wire (`workflowId !== sessionId`), el correlador SHALL emitir `workflow_complete` con `outcome: success` y `stepCount` igual al número de steps con `closedAt` definido.

Cuando `enrichOpenWireStepWithResponse` procesa un step con `stopReason === 'tool_use'`, el correlador SHALL asignar `closedAt` al step y SHALL invocar `closeStep` antes de retornar, de modo que cada hop HTTP completo (incluidos hops que solicitan tools) cuente para `stepCount`.

Cuando `registerWireStepInCorrelator` cae en la rama fallback (no hay step abierto y registra un step nuevo), SHALL aplicar la misma regla de cierre para `stopReason === 'tool_use'`: asignar `closedAt` e invocar `closeStep` antes de retornar.

#### Scenario: Multi-hop agentic con tool_use reporta stepCount correcto

- **GIVEN** un workflow wire agentic con 3 hops HTTP cerrados con `tool_use` y un hop terminal con `end_turn`
- **WHEN** `closeWireWorkflowOnTerminalStop` emite `workflow_complete`
- **THEN** `result.stepCount` SHALL ser `4`
- **AND** SHALL igualar el número de directorios `steps/` materializados por `step_request`

#### Scenario: Hop tool_use cierra step en correlador

- **GIVEN** un step abierto por `registerWireStepRequest`
- **WHEN** `enrichOpenWireStepWithResponse` recibe `stopReason: 'tool_use'`
- **THEN** el step SHALL tener `closedAt` definido
- **AND** `closeStep` SHALL haberse invocado para ese step

#### Scenario: Fallback registerWireStepInCorrelator cierra step en tool_use

- **GIVEN** un workflow wire sin step abierto (edge case: ingress no registró step previo)
- **WHEN** `registerWireStepInCorrelator` registra un step nuevo con `stopReason: 'tool_use'`
- **THEN** el step registrado SHALL tener `closedAt` definido
- **AND** `closeStep` SHALL haberse invocado para ese step
- **AND** el comportamiento SHALL ser equivalente al de `enrichOpenWireStepWithResponse` en el camino feliz

### Requirement: completeToolUse idempotente

`WorkflowRepositoryService.completeToolUse` SHALL ser idempotente: si el `IToolUse` objetivo ya tiene `status` `completed` o `error`, el método SHALL retornar sin mutar estado ni emitir un segundo evento `tool_result` al EventBus.

#### Scenario: Segunda completación no duplica tool_result

- **GIVEN** un tool T1 ya completado vía PostToolUse (`status: completed`)
- **WHEN** `completeToolUse` se invoca de nuevo para T1 (p. ej. fallback continuation)
- **THEN** NO SHALL emitirse un segundo evento `tool_result` para T1
- **AND** `events.ndjson` SHALL contener exactamente un `tool_result` por `tool_call` de T1

#### Scenario: Primera completación emite tool_result

- **GIVEN** un tool T1 registrado con `status: running`
- **WHEN** `completeToolUse` se invoca una vez
- **THEN** SHALL emitirse exactamente un evento `tool_result`
- **AND** `status` SHALL pasar a `completed` o `error`
