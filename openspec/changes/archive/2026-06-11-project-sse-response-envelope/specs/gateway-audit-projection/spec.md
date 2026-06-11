## ADDED Requirements

### Requirement: Proyección de envelope completo en response/body.json para steps SSE

Al finalizar un stream SSE, `AuditSseResponseHandler` SHALL publicar en `payload.response` del evento `step_response` un envelope Message Anthropic completo construido desde `AssembledInference`:

```json
{
  "id": "<anthropicMessageId>",
  "type": "message",
  "role": "assistant",
  "model": "<model>",
  "content": [...],
  "stop_reason": "<stopReason>",
  "stop_sequence": null,
  "usage": { ... }
}
```

`response/body.json` SHALL reflejar ese envelope (proyección directa de `SessionPersistence.onStepResponse`, sin re-derivación). El shape SHALL ser homólogo al que el path estándar (no-SSE) proyecta para el mismo tipo de respuesta (`Requirement: Proyección de respuesta estándar sin usage`): un consumidor forense SHALL poder leer `stop_reason`, `usage`, `model` e `id` de cualquier `body.json` sin distinguir el transporte del hop.

#### Scenario: Step SSE con end_turn proyecta envelope completo

- **GIVEN** un stream SSE que finaliza con `stop_reason: 'end_turn'` y `usage` ensamblado
- **WHEN** `AuditSseResponseHandler` publica `step_response` y `SessionPersistence` proyecta el step
- **THEN** `response/body.json` SHALL contener `stop_reason`, `usage`, `model` e `id`
- **AND** `content` SHALL contener los bloques ensamblados del mensaje assistant

#### Scenario: Step SSE con tool_use proyecta el mismo envelope

- **GIVEN** un stream SSE que finaliza con `stop_reason: 'tool_use'`
- **WHEN** el handler publica `step_response`
- **THEN** `payload.response` SHALL tener el mismo shape de envelope con `stop_reason: 'tool_use'`
- **AND** `usage` SHALL estar presente con los tokens del hop

#### Scenario: Paridad de shape entre path SSE y path estándar

- **GIVEN** un step SSE y un step estándar (no-SSE) proyectados en la misma sesión
- **WHEN** se comparan sus `response/body.json`
- **THEN** ambos SHALL exponer los campos de envelope `id`, `model`, `stop_reason` y `usage` al mismo nivel raíz
- **AND** NO SHALL existir un shape `{role, content}` sin envelope para steps SSE

## MODIFIED Requirements

### Requirement: StepAssembler ensambla bloques text

`StepAssemblerService` SHALL acumular bloques `content_block` de tipo `text` mediante eventos `text_delta` y SHALL incluirlos en `assistantMessage.content` junto a `thinking` y `tool_use`.

#### Scenario: SSE con text_delta produce bloque text en la raíz de body.json (before-change)

- **GIVEN** un stream SSE con `content_block_start` type `text` y deltas `text_delta`
- **WHEN** `AuditSseResponseHandler` finaliza el stream y publica `step_response`
- **THEN** `response/body.json` SHALL contener al menos un bloque `{ type: 'text', text: '...' }` en la raíz del payload, sin envelope (el publish usa `assembled.assistantMessage` con shape `{role, content}` directamente)

#### Scenario: SSE con text_delta produce bloque text en el content[] del envelope (after-change)

- **GIVEN** un stream SSE con `content_block_start` type `text` y deltas `text_delta`
- **WHEN** `AuditSseResponseHandler` finaliza el stream y publica `step_response` con el envelope Message Anthropic completo (`{id, type: 'message', role: 'assistant', model, content, stop_reason, stop_sequence: null, usage}`)
- **THEN** `response/body.json` SHALL contener al menos un bloque `{ type: 'text', text: '...' }` dentro del array `content[]` del envelope
