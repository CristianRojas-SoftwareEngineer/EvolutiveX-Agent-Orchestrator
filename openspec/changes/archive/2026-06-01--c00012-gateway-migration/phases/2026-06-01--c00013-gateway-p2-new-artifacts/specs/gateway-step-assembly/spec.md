## MODIFIED Requirements

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
