## MODIFIED Requirements

### Requirement: buildWorkflowResult para cierre por hook

`buildWorkflowResult` SHALL construir `IWorkflowResult` al recibir un hook de cierre (`Stop`, `SubagentStop`, `StopFailure`) con `outcome`, `usage`, `stepCount`, `closedByEvent`, `sessionId` y `finalText` vía `deriveFinalText(hook)` (`last_assistant_message`).

Cuando el hook no incluye `last_assistant_message`, `finalText` SHALL ser `undefined`. El sistema SHALL NOT reconstruir `finalText` desde steps ni desde hops SSE `end_turn`.

`stepCount` SHALL igualar el número de steps con `closedAt` del workflow (incluye `stepKind: side-request` y `stepKind: agentic`).

#### Scenario: Turno unificado con finalText desde hook Stop

- **GIVEN** un workflow de turno con `id === sessionId`, `interactionType: agentic` y varios steps cerrados (side-request + agentic)
- **WHEN** el hook `Stop` cierra el workflow vía `buildWorkflowResult`
- **THEN** `IWorkflowResult.finalText` SHALL ser el valor de `last_assistant_message` del hook
- **AND** `stepCount` SHALL incluir todos los steps cerrados del turno

#### Scenario: Stop sin last_assistant_message

- **GIVEN** un workflow de turno y un hook `Stop` sin `last_assistant_message`
- **WHEN** se invoca `buildWorkflowResult`
- **THEN** `finalText` SHALL ser `undefined`
- **AND** SHALL conservar `outcome`, `stepCount`, `usage` y `closedByEvent`

## REMOVED Requirements

### Requirement: Apertura de workflow sesión en UserPromptSubmit

**Reason**: El contenedor `session-shell` se fusiona con el workflow de turno agentic; un único workflow E2E por turno.

**Migration**: `UserPromptSubmit` abre workflow con `workflowKind: 'agentic'` (ver ADDED). Consumidores que filtraban `interactionType: 'session-shell'` deben usar `workflowId === sessionId` con `interactionType: agentic`.

## ADDED Requirements

### Requirement: Apertura de workflow de turno en UserPromptSubmit

Al procesar `UserPromptSubmit`, `AuditHookEventHandler` SHALL abrir (o reutilizar idempotentemente) el workflow de turno con `workflowKind: 'agentic'`, `kind: 'main'` y `id === sessionId`. El workflow SHALL permanecer `running` hasta el hook `Stop` o `StopFailure`.

Como máximo **un** workflow de turno `running` por `sessionId` con `id === sessionId` SHALL existir en el correlador.

#### Scenario: UserPromptSubmit abre turno agentic

- **WHEN** llega un hook `UserPromptSubmit` para `sessionId` S sin turno abierto
- **THEN** `openWorkflow` SHALL recibir `workflowKind: 'agentic'`
- **AND** el evento `workflow_start` SHALL incluir `interactionType: agentic` en payload para persistencia
- **AND** el workflow SHALL NOT tener steps HTTP aún

#### Scenario: UserPromptSubmit idempotente con turno lazy-open

- **GIVEN** un turno ya abierto por side-request o fresh (lazy open) con `id === sessionId`
- **WHEN** llega `UserPromptSubmit` para el mismo `sessionId`
- **THEN** el correlador SHALL reutilizar el mismo workflow sin `forceNew`
- **AND** NO SHALL crear un segundo workflow hermano

### Requirement: Cierre E2E del turno solo por hook

El workflow de turno (`id === sessionId`) SHALL cerrarse exclusivamente por hook `Stop` o `StopFailure`. SSE `end_turn` SHALL NOT invocar `forceClose` ni emitir `workflow_complete` para el workflow de turno.

Sub-workflows (`kind: subagent`) SHALL seguir la misma regla: cierre E2E por `SubagentStop`, no por `end_turn` SSE.

#### Scenario: end_turn cierra step pero no workflow de turno

- **GIVEN** un workflow de turno con step agentic abierto
- **WHEN** `AuditSseResponseHandler` completa con `stopReason: end_turn`
- **THEN** el step SHALL cerrarse (`closedAt` definido)
- **AND** el workflow de turno SHALL permanecer `running`
- **AND** NO SHALL emitirse `workflow_complete` para `workflowId === sessionId`

#### Scenario: Stop cierra turno y emite workflow_complete

- **GIVEN** un workflow de turno con todos los hops HTTP cerrados
- **WHEN** llega hook `Stop` con `readyToClose === true`
- **THEN** el correlador SHALL invocar `close` y emitir `workflow_complete`
- **AND** `SessionPersistence` SHALL escribir `output/result.json` bajo `workflows/NN/`
