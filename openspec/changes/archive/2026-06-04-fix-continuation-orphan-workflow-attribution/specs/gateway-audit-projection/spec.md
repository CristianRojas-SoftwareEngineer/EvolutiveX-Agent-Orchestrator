# gateway-audit-projection — Delta

## MODIFIED Requirements

### Requirement: Atribución de eventos del SSE handler al workflowId del context

El sistema SHALL modificar `AuditSseResponseHandler` (capa 3, `src/3-operations/audit-sse-response.handler.ts`) y `AuditStandardResponseHandler` para que los eventos publicados al `EventBus` (`stream_chunk`, `step_response`, `tool_call`) y las mutaciones al `IWorkflowRepository` (`registerStep`, `closeStep`, `registerToolUse`, `completeToolUse`, `registerPendingToolUse`) se atribuyan al `workflowId` presente en el `AuditWorkflowContext`, no al workflow main de la sesión.

Cuando el `AuditWorkflowContext.workflowId` está presente, el handler SHALL usar `getWorkflow(context.workflowId)` para resolver el workflow destino de los eventos y mutaciones. Cuando `workflowId` no está presente (código legacy, no recomendado), el handler SHALL caer al lookup por `getWorkflowBySessionId(context.auditSessionId)` como fallback defensivo.

Esta atribución garantiza que la proyección a disco vía `SessionPersistence` refleje la causalidad correcta: los `stream_chunks`, el `step_response`, y los `tool_call` de una inferencia se proyectan contra el workflow específico que abrió el `AuditWorkflowHandler` para esa request (incluyendo wire-N de continuations, subagentes, etc.), no contra el main estable con `id == sessionId`.

#### Scenario: SSE handler atribuye chunks al workflowId del context

- **GIVEN** un `AuditWorkflowHandler` que acaba de crear un workflow `wire-3` con `workflowId: 'session-wire-3'` y `sessionId: 'session'` para una request de continuation
- **AND** el `AuditWorkflowContext` que se pasa al SSE handler contiene `workflowId: 'session-wire-3'` y `auditSessionId: 'session'`
- **AND** existe también un workflow main con `id: 'session'` (que sería el devuelto por `getWorkflowBySessionId`)
- **WHEN** `AuditSseResponseHandler.execute()` procesa el stream SSE de esa request
- **THEN** el handler SHALL usar `getWorkflow('session-wire-3')` para resolver el workflow destino
- **AND** los `stream_chunk` eventos publicados al bus SHALL tener `workflowId: 'session-wire-3'`
- **AND** el `registerPendingToolUse` SHALL invocarse contra `workflowId: 'session-wire-3'`
- **AND** el `index` `toolUseIdToWorkflowId` SHALL mapear los `tool_use_id` observados a `'session-wire-3'`, no a `'session'`

#### Scenario: Fallback al lookup por sessionId cuando workflowId no está en el context

- **GIVEN** un `AuditWorkflowContext` sin campo `workflowId` (código legacy)
- **AND** existe un workflow main con `id: 'session'`
- **WHEN** `AuditSseResponseHandler.execute()` procesa el stream SSE
- **THEN** el handler SHALL usar `getWorkflowBySessionId('session')` como fallback
- **AND** los eventos se atribuyen al workflow main (comportamiento legacy, no recomendado en código nuevo)

#### Scenario: Continuación siguiente encuentra el parent workflow

- **GIVEN** que el SSE del response anterior publicó `tool_use_id: 'tu-abc'` con `workflowId: 'session-wire-3'`
- **AND** el `registerPendingToolUse` correspondiente se ejecutó contra `workflowId: 'session-wire-3'`
- **WHEN** el cliente envía la siguiente continuation con `tool_result.tool_use_id: 'tu-abc'`
- **THEN** `findWorkflowByToolUseId('session', 'tu-abc')` SHALL devolver el workflow `session-wire-3`
- **AND** el `handleContinuation` SHALL registrar el step contra `session-wire-3` (no contra el main)
- **AND** NO SHALL emitirse el warning `[audit] No se encontró workflow padre para continuation`

### Requirement: Limpieza de toolUseIdToWorkflowId en paths de error

El sistema SHALL exponer en `IWorkflowRepository` un método `clearToolUseIndexFor(workflowId: string): void` que elimine todas las entradas de `toolUseIdToWorkflowId` cuyo valor sea el `workflowId` dado. Este método SHALL ser invocado desde:

- `AuditSseResponseHandler` en el handler de `stream.on('error')` para el workflow que se está auditando en ese momento.
- `audit-upstream-error.handler` cuando procesa un error que invalida la inferencia en curso.
- `forceClose` (invocación interna, ya implementada; el método público reemplaza el código inline actual).

#### Scenario: stream.on('error') limpia el índice para el workflow afectado

- **GIVEN** un SSE handler auditando el workflow `session-wire-3` con varios `tool_use_id` ya en `toolUseIdToWorkflowId`
- **WHEN** el stream emite un error y `stream.on('error')` se dispara
- **THEN** el handler SHALL invocar `clearToolUseIndexFor('session-wire-3')`
- **AND** las entradas correspondientes SHALL eliminarse del `toolUseIdToWorkflowId`

#### Scenario: error upstream limpia el índice del workflow afectado

- **GIVEN** un error upstream que invalida la inferencia del workflow `session-wire-3`
- **WHEN** `audit-upstream-error.handler` procesa el error
- **THEN** SHALL invocar `clearToolUseIndexFor('session-wire-3')` antes de cualquier mutación de cierre
- **AND** las entradas de `tool_use_id` reservadas SHALL eliminarse
