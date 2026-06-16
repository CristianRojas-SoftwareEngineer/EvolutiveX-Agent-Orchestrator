## MODIFIED Requirements

### Requirement: Atribución de eventos del SSE handler al workflowId del context

`AuditSseResponseHandler` y `AuditStandardResponseHandler` SHALL resolver el workflow destino usando `getWorkflow(context.workflowId)`, donde `context.workflowId` es el campo obligatorio de `AuditWorkflowContext` que propaga el `workflowId` específico abierto por `AuditWorkflowHandler` para esa request.

Los eventos publicados al `EventBus` (`stream_chunk`, `step_response`, `tool_call`) y las mutaciones al `IWorkflowRepository` (`registerStep`, `closeStep`, `registerToolUse`, `completeToolUse`, `registerPendingToolUse`) SHALL atribuirse al `workflowId` presente en el `AuditWorkflowContext`, no al workflow main de la sesión.

Los eventos `stream_chunk` y `step_response` SHALL usar `stepIndex` igual a `context.assignedStepIndex` — el índice fijado en ingress por `registerWireStepRequest` para esa request HTTP — de modo que chunks y respuesta proyecten al mismo `steps/MM/` que el `step_request` correspondiente, **incluso cuando existan otros steps abiertos en el mismo workflow**.

`enrichOpenWireStepWithResponse` (heurística del último step abierto) MAY usarse solo como fallback cuando no exista step en el índice asignado (edge case sin ingress previo).

#### Scenario: stream_chunk usa assignedStepIndex del context

- **GIVEN** `registerWireStepRequest` registró un step en índice 1 para la request actual
- **AND** `AuditWorkflowContext.assignedStepIndex` es 1
- **WHEN** `AuditSseResponseHandler` emite `stream_chunk` durante el stream
- **THEN** `payload.stepIndex` SHALL ser 1
- **AND** NO SHALL derivarse de `workflow.steps.length` ni del último step abierto si difiere de 1

#### Scenario: Hops concurrentes no cruzan response entre steps

- **GIVEN** un workflow de turno con step 1 (`side-request`) y step 2 (`agentic`) abiertos simultáneamente
- **AND** step 1 tiene `request/body.json` con prompt `ai-title`
- **AND** step 2 tiene `request/body.json` con prompt agentic del usuario
- **WHEN** la respuesta SSE del hop 1 finaliza con `assignedStepIndex: 1`
- **AND** la respuesta SSE del hop 2 finaliza con `assignedStepIndex: 2`
- **THEN** `step_response` del hop 1 SHALL enriquecer step 1 (contenido coherente con `ai-title`)
- **AND** `step_response` del hop 2 SHALL enriquecer step 2 (contenido coherente con inferencia agentic)
- **AND** NO SHALL intercambiarse las respuestas entre `steps/01/response/` y `steps/02/response/`

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
