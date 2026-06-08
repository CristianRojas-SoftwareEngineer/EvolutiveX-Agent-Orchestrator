## ADDED Requirements

### Requirement: tool_result persistido vía fallback de continuation

Además del camino hook `PostToolUse`, `SessionPersistence` SHALL recibir eventos `tool_result` emitidos por el correlador al procesar bloques `tool_result` en el body de una continuation HTTP.

#### Scenario: result.json escrito tras fallback continuation

- **GIVEN** un evento `tool_result` en el bus con `toolUseId` y `result` válidos
- **WHEN** `SessionPersistence.onToolResult` procesa el evento
- **THEN** SHALL existir `tools/KK-slug/result.json`
- **AND** `meta.json` del tool SHALL tener `status: completed` o `error`
