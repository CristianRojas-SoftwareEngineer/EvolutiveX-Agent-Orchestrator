## ADDED Requirements

### Requirement: Autoridad de completación de tool_use

Cada `IToolUse` registrado en el correlador SHALL llevar `completionAuthority: 'continuation' | 'hook'`, fijada en el momento del registro y inmutable hasta el cierre del tool.

| Registro | `completionAuthority` |
|----------|----------------------|
| `registerToolUse` | `continuation` |
| `registerPendingToolUse` con nombre `Agent` (case-insensitive) | `continuation` |
| `registerPendingToolUse` con nombre `web_search` o `web_fetch` (case-insensitive) | `hook` |

`IWorkflowRepository` SHALL exponer la autoridad de un tool por `workflowId` + `toolUseId`.

`AuditHookEventHandler` SHALL invocar `completeToolUse` en `PostToolUse` / `PostToolUseFailure` **solo** cuando `completionAuthority === 'hook'`.

`handleContinuation` SHALL invocar `completeToolUse` desde bloques `tool_result` del body HTTP para tools con `completionAuthority === 'continuation'` que sigan en `status: running`.

#### Scenario: Bash client-side no se completa desde PostToolUse

- **GIVEN** un tool `Bash` registrado vía `registerToolUse` con `completionAuthority: continuation` y `status: running`
- **WHEN** llega un hook `PostToolUse` sin `lastAssistantMessage` para ese `tool_use_id`
- **THEN** `completeToolUse` NO SHALL invocarse desde el hook handler
- **AND** el tool SHALL permanecer en `status: running`

#### Scenario: Continuation completa Bash con stdout canónico

- **GIVEN** un tool `Bash` con `completionAuthority: continuation` y `status: running`
- **AND** un hook `PostToolUse` ya llegó sin completar el tool (escenario anterior)
- **WHEN** `handleContinuation` procesa un body cuyo último mensaje contiene `{ type: 'tool_result', tool_use_id, content: '<stdout>' }`
- **THEN** SHALL invocarse `completeToolUse` con `result.content === '<stdout>'`
- **AND** SHALL emitirse exactamente un evento `tool_result`
- **AND** `SessionPersistence` SHALL escribir `tools/KK-slug/result.json` con ese contenido

#### Scenario: Bash fallido recibe stderr real desde continuation

- **GIVEN** un tool `Bash` con `completionAuthority: continuation` y `status: running`
- **WHEN** llega `PostToolUseFailure` sin mensaje útil
- **THEN** el hook NO SHALL completar el tool
- **AND** cuando llegue la continuation con `tool_result` e `is_error: true` y contenido `Exit code 128 …`
- **THEN** `result.json` SHALL contener ese texto, no `{ error: 'PostToolUseFailure' }`

#### Scenario: WebFetch mantiene completación por hook

- **GIVEN** un tool `WebFetch` registrado vía `registerPendingToolUse` con `completionAuthority: hook`
- **WHEN** llega `PostToolUse` con `lastAssistantMessage: 'page summary'`
- **THEN** `completeToolUse` SHALL invocarse desde el hook handler con ese resultado

## MODIFIED Requirements

### Requirement: Registro de tool_use client-side observados en respuestas wire

Los bloques `tool_use` client-side (los tools de Claude Code: `Read`/`Edit`/`Bash`/`Grep`/…, esto es, todos los que NO pertenecen a `pendingToolUseKinds` = `agent`/`web_search`/`web_fetch`) observados al ensamblar una respuesta wire SHALL registrarse vía `IWorkflowRepository.registerToolUse(workflowId, toolUse)`.

`registerToolUse` SHALL: (a) emitir `tool_call` (proyectado por `SessionPersistence` a `tools/KK-slug/input.json` + `meta.json`), (b) hacer push del `IToolUse` a `step.toolUses` con `completionAuthority: continuation`, (c) poblar `toolUseIdToWorkflowId` mapeando el `tool_use_id` al `workflowId` dueño.

Este registro NO SHALL tocar `pendingToolUses`, por lo que NO SHALL disparar el camino de coalescing server-side (`resolveAgentContinuationTarget`/`handleSubagent`). El indexado de (c) garantiza que la continuation que porte el `tool_result` de ese tool encuentre su workflow padre vía `findWorkflowByToolUseId`.

`PostToolUse` NO SHALL ser la vía de completación para estos tools; la completación SHALL ocurrir exclusivamente cuando `handleContinuation` procese el bloque `tool_result` canónico del body HTTP.

Ambos caminos de respuesta SHALL mantener paridad: `AuditSseResponseHandler` (streaming) registra los `tool_use` ensamblados desde `assembled.toolUseBlocks`; `AuditStandardResponseHandler` (no-streaming) los extrae de los bloques `type === 'tool_use'` del body de respuesta.

#### Scenario: tool_use client-side se registra e indexa al ensamblar el wire

- **GIVEN** un `AuditSseResponseHandler` auditando el workflow `session-wire-3`
- **WHEN** el stream SSE ensambla un bloque `tool_use` client-side (p. ej. `Read` con `id: 'toolu-read-1'`) que NO está en `pendingToolUseKinds`
- **THEN** el handler SHALL invocar `registerToolUse('session-wire-3', toolUse)` (no `registerPendingToolUse`)
- **AND** el `IToolUse` registrado SHALL tener `completionAuthority: continuation`
- **AND** SHALL emitirse un evento `tool_call` para `toolu-read-1`
- **AND** `findWorkflowByToolUseId(sessionId, 'toolu-read-1')` SHALL devolver el workflow `session-wire-3`

#### Scenario: paridad en el camino no-streaming

- **GIVEN** un `AuditStandardResponseHandler` auditando el workflow `session-wire-3`
- **WHEN** el body de respuesta contiene un bloque `type: 'tool_use'` client-side con `id: 'toolu-edit-1'`
- **THEN** el handler SHALL invocar `registerToolUse('session-wire-3', toolUse)` para ese bloque
- **AND** `toolUseIdToWorkflowId` SHALL mapear `'toolu-edit-1'` a `'session-wire-3'`

### Requirement: completeToolUse idempotente

`WorkflowRepositoryService.completeToolUse` SHALL ser idempotente: si el `IToolUse` objetivo ya tiene `status` `completed` o `error`, el método SHALL retornar sin mutar estado ni emitir un segundo evento `tool_result` al EventBus.

#### Scenario: Segunda completación no duplica tool_result

- **GIVEN** un tool T1 ya completado vía continuation HTTP (`status: completed`, `completionAuthority: continuation`)
- **WHEN** `completeToolUse` se invoca de nuevo para T1 (p. ej. reintento o hook tardío)
- **THEN** NO SHALL emitirse un segundo evento `tool_result` para T1
- **AND** `events.ndjson` SHALL contener exactamente un `tool_result` por `tool_call` de T1

#### Scenario: Primera completación emite tool_result

- **GIVEN** un tool T1 registrado con `status: running`
- **WHEN** `completeToolUse` se invoca una vez
- **THEN** SHALL emitirse exactamente un evento `tool_result`
- **AND** `status` SHALL pasar a `completed` o `error`

### Requirement: Continuation completa tools client-side desde tool_result en body

Cuando `handleContinuation` procesa un request con bloques `tool_result` en el último mensaje user, el correlador SHALL invocar `completeToolUse` para cada `tool_use_id` registrado previamente vía `registerToolUse` (o vía `registerPendingToolUse` con `completionAuthority: continuation`) que permanezca en `status: running`, **antes** de registrar el step de continuación. Esta es la **vía canónica** de completación para tools client-side; no es un fallback opcional.

#### Scenario: Continuation con Bash registrado completa tool aunque PostToolUse haya llegado

- **GIVEN** un workflow wire con tool client-side `running` registrado por SSE (`registerToolUse`, `completionAuthority: continuation`)
- **AND** un hook `PostToolUse` llegó al proxy pero NO completó el tool (autoridad `continuation`)
- **WHEN** llega una continuation HTTP cuyo último mensaje contiene `{ type: 'tool_result', tool_use_id, content }`
- **THEN** el correlador SHALL invocar `completeToolUse` con el contenido del bloque
- **AND** SHALL emitirse evento `tool_result` en el EventBus
- **AND** `SessionPersistence` SHALL escribir `tools/KK-slug/result.json` con el contenido canónico
