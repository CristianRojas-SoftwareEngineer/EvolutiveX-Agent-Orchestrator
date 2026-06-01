# gateway-step-assembly Specification

## Purpose

Ensamblaje en RAM de respuestas de inferencia SSE (StepBuffer §26) mediante `StepAssembler` en capa 2.

## Requirements

### Requirement: Ensamblaje de inferencia en RAM (StepAssembler)

El sistema SHALL proveer un componente de infraestructura `StepAssembler` (capa 2) que ensamble en memoria la respuesta de una inferencia a partir de los eventos SSE Anthropic de un único POST, según el StepBuffer de [§26](../../../docs/proposals/gateway-design.md#26-streaming-sse-y-stepbuffer). El componente SHALL exponer una operación de ingesta de eventos parseados y, al cierre del mensaje, producir el resultado ensamblado: `assistantMessage` (bloques `text`, `thinking`, `tool_use`), `usage`, `stopReason`, `model` y la lista de bloques `tool_use`. El `StepAssembler` SHALL ser efímero por inferencia: no persiste deltas SSE y descarta su estado interno tras producir el resultado.

#### Scenario: Ensamblaje de usage desde message_start y message_delta

- **WHEN** el `StepAssembler` recibe un evento `message_start` con `message.usage` (input/cache tokens) y luego un `message_delta` con `usage.output_tokens`
- **THEN** el resultado ensamblado expone `usage` con `input_tokens`, `output_tokens`, `cache_creation_input_tokens` y `cache_read_input_tokens` consolidados

#### Scenario: Fallback de tokens de entrada en message_delta

- **WHEN** el proveedor no envía `input_tokens` en `message_start` pero sí los envía en `message_delta` (p. ej. Xiaomi)
- **THEN** el `StepAssembler` toma `input_tokens` (y los campos de cache ausentes) desde `message_delta` sin sobrescribir valores ya capturados

#### Scenario: Captura de stopReason

- **WHEN** el `StepAssembler` recibe un `message_delta` con `delta.stop_reason` (o un `message_stop` con `stop_reason` cuando no llegó antes)
- **THEN** el resultado ensamblado expone `stopReason` con ese valor

#### Scenario: Captura del modelo y messageId desde message_start

- **WHEN** el `StepAssembler` recibe `message_start` con `message.id` y `message.model`
- **THEN** el resultado ensamblado expone `model` y el identificador de mensaje Anthropic capturados

#### Scenario: Ensamblaje de bloques tool_use con input acumulado

- **WHEN** el `StepAssembler` recibe `content_block_start` de tipo `tool_use` seguido de eventos `input_json_delta` y un `content_block_stop`
- **THEN** el resultado ensamblado incluye el bloque `tool_use` con `id`, `name` e `input` reconstruido a partir del JSON parcial acumulado

#### Scenario: Ensamblaje de bloques thinking

- **WHEN** el `StepAssembler` recibe `content_block_start` de tipo `thinking` seguido de `thinking_delta` y `content_block_stop`
- **THEN** el resultado ensamblado expone el texto de thinking acumulado para ese bloque

### Requirement: El handler SSE delega el ensamblaje sin cambiar el comportamiento observable

`AuditSseResponseHandler` (capa 3) SHALL delegar en `StepAssembler` el ensamblaje de la respuesta de inferencia en RAM, retirando de su propio cuerpo el estado de ensamblaje incrustado (acumuladores de `usage`, `stopReason`, `model`, `anthropicMessageId`, bloques `thinking` y `tool_use`). La extracción SHALL ser behavior-preserving en correlación y metadatos de step: los `StepMeta` (tokens, `stopReason`, `toolCalls`, `toolUseIds`, `anthropicMessageId`, thinking) y el registro de pending en `IWorkflowRepository` SHALL permanecer equivalentes al comportamiento pre-P2. La forensia SSE en disco SHALL materializarse vía publicación de `stream_chunk` al `EventBus` y proyección en `SessionPersistence` (`response/streaming/*.ndjson`, `response/body.json` reconstruido), NO mediante `sse.jsonl`, `sse.txt` ni `ISseAuditWriter`.

#### Scenario: Salida de auditoría post-P2 vía bus

- **WHEN** se procesa un stream SSE de inferencia tras P2
- **THEN** los `StepMeta` y la correlación en `IWorkflowRepository` permanecen equivalentes al comportamiento pre-P2
- **AND** la forensia SSE en disco SHALL materializarse como `response/streaming/*.ndjson` y `response/body.json` reconstruido
- **AND** NO SHALL escribirse `response/sse.jsonl`

#### Scenario: Side-effects de correlación preservados

- **WHEN** el stream contiene bloques `tool_use` de tipo `Agent`, `WebSearch` o `WebFetch`
- **THEN** el handler sigue registrando los pending correspondientes en `IWorkflowRepository` con la misma información que antes de P2 (incluido `subagent_type`/`description`/`prompt` para `Agent`)
