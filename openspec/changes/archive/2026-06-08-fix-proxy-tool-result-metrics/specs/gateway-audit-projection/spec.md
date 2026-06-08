## ADDED Requirements

### Requirement: Continuation completa tools client-side desde tool_result en body

Cuando `handleContinuation` procesa un request con bloques `tool_result` en el último mensaje user, el correlador SHALL invocar `completeToolUse` para cada `tool_use_id` registrado previamente vía `registerToolUse`, **antes** de registrar el step de continuación. Esto SHALL emitir eventos `tool_result` al bus aunque el hook `PostToolUse` no haya llegado al proxy.

#### Scenario: Continuation con Bash registrado completa tool sin PostToolUse

- **GIVEN** un workflow wire con tool client-side `running` registrado por SSE (`registerToolUse`)
- **AND** el hook `PostToolUse` NO llegó al proxy
- **WHEN** llega una continuation HTTP cuyo último mensaje contiene `{ type: 'tool_result', tool_use_id, content }`
- **THEN** el correlador SHALL invocar `completeToolUse` con el contenido del bloque
- **AND** SHALL emitirse evento `tool_result` en el EventBus
- **AND** `SessionPersistence` SHALL escribir `tools/KK-slug/result.json` con `status: completed`
