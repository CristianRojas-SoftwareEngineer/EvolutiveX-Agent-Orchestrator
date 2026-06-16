## MODIFIED Requirements

### Requirement: Atribución de eventos del SSE handler al workflowId del context

`AuditSseResponseHandler` y `AuditStandardResponseHandler` SHALL resolver el workflow destino usando `getWorkflow(context.workflowId)`, donde `context.workflowId` es el campo obligatorio de `AuditWorkflowContext` que propaga el `workflowId` específico abierto por `AuditWorkflowHandler` para esa request.

Los eventos publicados al `EventBus` (`stream_chunk`, `step_response`, `tool_call`) y las mutaciones al `IWorkflowRepository` (`registerStep`, `closeStep`, `registerToolUse`, `completeToolUse`, `registerPendingToolUse`) SHALL atribuirse al `workflowId` presente en el `AuditWorkflowContext`, no al workflow main de la sesión.

Los eventos `stream_chunk` SHALL usar `stepIndex` del step abierto por ingress (`resolveOpenWireStepIndex`), no `workflow.steps.length`, para que chunks y `step_response` proyecten al mismo `steps/MM/`.

#### Scenario: stream_chunk usa índice del step abierto

- **GIVEN** `registerWireStepRequest` registró un step en índice 0
- **WHEN** `AuditSseResponseHandler` emite `stream_chunk` durante el stream
- **THEN** `payload.stepIndex` SHALL ser 0
- **AND** NO SHALL ser 1 (`workflow.steps.length` tras ingress)

#### Scenario: SSE handler atribuye chunks al workflowId del context

- **GIVEN** un `AuditWorkflowHandler` que acaba de crear un workflow `wire-3` con `workflowId: 'session-wire-3'` y `sessionId: 'session'` para una request de continuation
- **AND** el `AuditWorkflowContext` que se pasa al SSE handler contiene `workflowId: 'session-wire-3'` y `auditSessionId: 'session'`
- **AND** existe también un workflow main con `id: 'session'`
- **WHEN** `AuditSseResponseHandler.execute()` procesa el stream SSE de esa request
- **THEN** el handler SHALL usar `getWorkflow('session-wire-3')` para resolver el workflow destino
- **AND** los `stream_chunk` eventos publicados al bus SHALL tener `workflowId: 'session-wire-3'`
- **AND** el `registerPendingToolUse` SHALL invocarse contra `workflowId: 'session-wire-3'`
- **AND** el índice `toolUseIdToWorkflowId` SHALL mapear los `tool_use_id` observados a `'session-wire-3'`, no a `'session'`

#### Scenario: Continuación siguiente encuentra el parent workflow

- **GIVEN** que el SSE del response anterior publicó `tool_use_id: 'tu-abc'` con `workflowId: 'session-wire-3'`
- **AND** el `registerPendingToolUse` correspondiente se ejecutó contra `workflowId: 'session-wire-3'`
- **WHEN** el cliente envía la siguiente continuation con `tool_result.tool_use_id: 'tu-abc'`
- **THEN** `findWorkflowByToolUseId('session', 'tu-abc')` SHALL devolver el workflow `session-wire-3`
- **AND** el `handleContinuation` SHALL registrar el step contra `session-wire-3` (no contra el main)
- **AND** NO SHALL emitirse el warning `[audit] No se encontró workflow padre para continuation`
