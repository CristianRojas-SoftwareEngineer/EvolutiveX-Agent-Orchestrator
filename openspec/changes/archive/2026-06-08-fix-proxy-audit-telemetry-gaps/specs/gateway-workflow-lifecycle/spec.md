## MODIFIED Requirements

### Requirement: buildWorkflowResult para cierre por hook

`buildWorkflowResult` SHALL construir `IWorkflowResult` al recibir un hook de cierre (`Stop`, `SubagentStop`, `StopFailure`) con `outcome`, `usage`, `stepCount`, `closedByEvent` y `sessionId`.

Cuando el workflow cerrado es el contenedor de sesión (`workflow.id === hook.sessionId`), el resultado SHALL **omitir** el campo `finalText`, reservando el texto final del turno agentic al workflow wire que posee la evidencia SSE.

#### Scenario: Shell sesión sin finalText duplicado

- **GIVEN** un workflow con `id === sessionId` (shell) y un workflow wire agentic del mismo turno
- **WHEN** el hook `Stop` cierra el shell vía `buildWorkflowResult`
- **THEN** `IWorkflowResult` del shell SHALL NOT incluir `finalText`
- **AND** el workflow wire SHALL conservar `finalText` en su `workflow_complete` vía SSE

### Requirement: Apertura de workflow sesión en UserPromptSubmit

Al procesar `UserPromptSubmit`, `AuditHookEventHandler` SHALL abrir el workflow de sesión con `workflowKind: 'session-shell'` (semántico) además del kind estructural `main`.

#### Scenario: UserPromptSubmit etiqueta session-shell

- **WHEN** llega un hook `UserPromptSubmit` para `sessionId` S
- **THEN** `openWorkflow` SHALL recibir `workflowKind: 'session-shell'`
- **AND** el evento `workflow_start` SHALL incluir ese valor en payload para persistencia
