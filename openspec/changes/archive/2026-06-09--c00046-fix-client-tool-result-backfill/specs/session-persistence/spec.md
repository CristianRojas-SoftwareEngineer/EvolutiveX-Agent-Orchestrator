## MODIFIED Requirements

### Requirement: tool_result persistido vía fallback de continuation

Para tools con `completionAuthority: continuation`, `SessionPersistence` SHALL recibir el evento `tool_result` **exclusivamente** cuando el correlador complete el tool desde bloques `tool_result` del body HTTP de una continuation. El hook `PostToolUse` NO SHALL ser fuente de `tool_result` para estos tools.

Para tools con `completionAuthority: hook` (`web_search`, `web_fetch`), `SessionPersistence` SHALL seguir recibiendo `tool_result` emitido por `completeToolUse` invocado desde `PostToolUse` / `PostToolUseFailure`.

En ambos casos, `onToolResult` SHALL escribir `tools/KK-slug/result.json` y actualizar `meta.json` del tool.

#### Scenario: result.json client-side escrito desde continuation canónica

- **GIVEN** un tool `Bash` completado por `handleContinuation` con contenido de stdout en el bloque `tool_result`
- **WHEN** `SessionPersistence.onToolResult` procesa el evento `tool_result` emitido por el correlador
- **THEN** SHALL existir `tools/KK-slug/result.json` con el stdout
- **AND** `meta.json` del tool SHALL tener `status: completed`

#### Scenario: PostToolUse ignorado no escribe result.json vacío

- **GIVEN** un tool `Bash` con `completionAuthority: continuation` aún en `status: running`
- **AND** llegó un hook `PostToolUse` que el handler ignoró (sin evento bus)
- **WHEN** no ha llegado aún la continuation HTTP
- **THEN** NO SHALL existir `tools/KK-slug/result.json` con `{ "result": null }`
- **AND** `meta.json` del tool SHALL mantener `status: running`

#### Scenario: result.json hook-authority para WebFetch

- **GIVEN** un evento `tool_result` en el bus para un tool `WebFetch` completado vía `PostToolUse` (`completionAuthority: hook`)
- **WHEN** `SessionPersistence.onToolResult` procesa el evento
- **THEN** SHALL existir `tools/KK-slug/result.json`
- **AND** `meta.json` del tool SHALL tener `status: completed` o `error`
