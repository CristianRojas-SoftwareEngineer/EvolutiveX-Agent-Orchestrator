## ADDED Requirements

### Requirement: Cierre de workflows wire en stop terminal SSE

Cuando `registerWireStepInCorrelator` registra un step con `stopReason` terminal (`end_turn`, `max_tokens`, o ausente tras stream completo) en un workflow wire (`workflowId !== sessionId`), el correlador SHALL emitir `workflow_complete` con `outcome: success` y `stepCount` de steps cerrados.

El workflow de sesión (`workflowId === sessionId`) NO SHALL cerrarse por esta ruta; su cierre nominal permanece vía hook `Stop`.

#### Scenario: Workflow wire con end_turn emite workflow_complete

- **GIVEN** un workflow wire `sess-wire-1` con al menos un step cerrado
- **WHEN** llega una respuesta SSE con `stopReason: end_turn`
- **THEN** el correlador SHALL emitir `workflow_complete` para `sess-wire-1`
- **AND** `SessionPersistence` SHALL actualizar `meta.json` a `status: completed`

#### Scenario: Workflow wire con tool_use NO cierra el workflow

- **GIVEN** un workflow wire en turno agentic
- **WHEN** la respuesta SSE tiene `stopReason: tool_use`
- **THEN** el correlador SHALL NOT emitir `workflow_complete` para ese workflow
- **AND** el workflow SHALL permanecer `running` hasta la continuación con `end_turn`

### Requirement: StepAssembler ensambla bloques text

`StepAssemblerService` SHALL acumular bloques `content_block` de tipo `text` mediante eventos `text_delta` y SHALL incluirlos en `assistantMessage.content` junto a `thinking` y `tool_use`.

#### Scenario: SSE con text_delta produce bloque text en body.json

- **GIVEN** un stream SSE con `content_block_start` type `text` y deltas `text_delta`
- **WHEN** `AuditSseResponseHandler` finaliza el stream y publica `step_response`
- **THEN** `response/body.json` SHALL contener al menos un bloque `{ type: 'text', text: '...' }`
