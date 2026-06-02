# gateway-workflow-lifecycle Specification (Delta P1)

## Purpose

Delta de P1 sobre el spec `gateway-workflow-lifecycle`: el correlador emite eventos al bus en cada mutación de estado y se crea el método `completeToolUse()`.

## MODIFIED Requirements

### Requirement: IWorkflowRepository — lifecycle completo del correlador

El sistema SHALL ampliar la interface `IWorkflowRepository` en `src/1-domain/repositories/IWorkflowRepository.ts` con los siguientes métodos de lifecycle, **manteniendo** los tres métodos existentes de correlación wire (`openSubagentFromWire`, `getWorkflowByAgentId`, `confirmSubagentFromHook`):

**Métodos de lifecycle:**

- `openWorkflow(sessionId: string, agentCtx: AgentContext): IWorkflow` — abre un workflow principal (`kind: 'main'`); indexado por `agentCtx.agentId` si está presente.
- `openSubagentWorkflow(sessionId: string, agentCtx: AgentContext, parentWorkflowId: string, parentToolUseId: string): IWorkflow` — abre un sub-workflow (`kind: 'subagent'`); indexado por `agentCtx.agentId` y enlazado por `parentToolUseId`.
- `getWorkflow(workflowId: string): IWorkflow | undefined` — recupera un workflow por su `id`.
- `registerStep(workflowId: string, step: IStep): void` — adjunta un step al workflow.
- `closeStep(workflowId: string, stepId: string): void` — marca el step como cerrado (`closedAt`).
- `registerToolUse(workflowId: string, toolUse: IToolUse): void` — registra un tool_use en el workflow.
- `completeToolUse(workflowId: string, toolUseId: string, result: { isError: boolean; result: unknown }): void` — completa un `ToolUse` existente (por timeout §24.1 o por hook `PostToolUse`/`PostToolUseFailure`). Actualiza `toolUse.result` y `toolUse.status`. Emite `tool_result` al bus. Si `toolUseId` no existe, es no-op.
- `readyToClose(workflowId: string, hook: ClaudeHookEvent): boolean` — evalúa si el workflow puede cerrarse según las condiciones §15.4.
- `close(workflowId: string, hook: ClaudeHookEvent): IWorkflowResult` — cierra el workflow invocando `buildWorkflowResult`; idempotente si ya está cerrado.

**Métodos de lookup (para migración de handlers L3):**

- `getWorkflowBySessionId(sessionId: string): IWorkflow | undefined` — recupera el workflow principal de una sesión.
- `findWorkflowWithPendingToolUse(sessionId: string, toolUseId: string): { workflow: IWorkflow; toolUse: IToolUse } | undefined` — busca un tool_use pendiente por su ID en todos los workflows de la sesión.
- `registerPendingToolUse(workflowId: string, stepId: string, toolUse: IToolUse): void` — registra un tool_use pendiente (agent, web_search, web_fetch) en el step correspondiente.
- `consumePendingToolUse(workflowId: string, toolUseId: string): IToolUse | undefined` — consume (elimina de pendientes) un tool_use por su ID. Devuelve el tool_use consumido o undefined.
- `findStaleWorkflows(sessionId: string, maxAgeMs: number): IWorkflow[]` — busca workflows con `awaitingContinuation` cuyo `awaitingSince` supera `maxAgeMs`.
- `nextSequence(sessionId: string): Promise<number>` — asigna el siguiente número de secuencia para la sesión (reemplaza `nextMainAgentSequence`/`nextSideInteractionSequence`).
- `withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T>` — ejecuta `fn` serializado por sesión.

El adapter en memoria SHALL implementar todos los métodos en `src/2-services/workflow-repository.service.ts`, manteniendo índices por `agentId` y por `parentToolUseId`.

Adicionalmente, el correlador SHALL recibir `IEventBus` como dependencia del constructor y SHALL emitir eventos al bus en cada mutación de estado:

| Método | Evento emitido |
|---|---|
| `openWorkflow()` | `workflow_start` |
| `openSubagentWorkflow()` | `workflow_spawn` |
| `registerStep()` | `step_request` |
| `registerToolUse()` | `tool_call` |
| `completeToolUse()` | `tool_result` |
| `close()` | `workflow_complete` o `workflow_cancel` (según `result.outcome`) |

#### Scenario: Apertura de workflow main emite workflow_start al bus

- **GIVEN** un `WorkflowRepositoryService` con un `IEventBus` inyectado
- **WHEN** se invoca `openWorkflow('session-1', { agentId: 'agent-root', isSubagentRequest: false })`
- **THEN** el workflow SHALL tener `kind: 'main'` y `status: 'running'`
- **AND** el bus SHALL recibir un evento `{ type: 'workflow_start', sessionId: 'session-1', payload: { workflowId, kind: 'main' } }`

#### Scenario: registerStep emite step_request al bus

- **GIVEN** un workflow abierto con id `'wf-1'`
- **WHEN** se invoca `registerStep('wf-1', step)`
- **AND** el bus SHALL recibir un evento `{ type: 'step_request', payload: { workflowId: 'wf-1', stepIndex, step } }`

#### Scenario: completeToolUse completa tool y emite tool_result

- **GIVEN** un workflow con un tool_use registrado `{ toolUseId: 'tu-1', status: 'running' }`
- **WHEN** se invoca `completeToolUse('wf-1', 'tu-1', { isError: false, result: 'ok' })`
- **THEN** el tool_use SHALL tener `status: 'completed'` y `result: { isError: false, result: 'ok' }`
- **AND** el bus SHALL recibir un evento `{ type: 'tool_result', payload: { workflowId: 'wf-1', toolUseId: 'tu-1', result } }`

#### Scenario: completeToolUse con tool inexistente es no-op

- **GIVEN** un workflow `'wf-1'` sin tool_use con id `'tu-999'`
- **WHEN** se invoca `completeToolUse('wf-1', 'tu-999', { isError: false, result: 'ok' })`
- **THEN** la operación SHALL ser no-op sin error
- **AND** el bus NO SHALL recibir evento `tool_result`

#### Scenario: close emite workflow_complete para outcome success

- **GIVEN** un workflow activo con steps cerrados
- **WHEN** se invoca `close('wf-1', hook)` y el resultado tiene `outcome: 'success'`
- **THEN** el bus SHALL recibir un evento `{ type: 'workflow_complete', payload: { workflowId: 'wf-1', result } }`

#### Scenario: close emite workflow_cancel para outcome cancelled

- **GIVEN** un workflow activo
- **WHEN** se invoca `close('wf-1', hook)` y el resultado tiene `outcome: 'cancelled'`
- **THEN** el bus SHALL recibir un evento `{ type: 'workflow_cancel', payload: { workflowId: 'wf-1', result } }`

#### Scenario: getWorkflowBySessionId devuelve workflow principal

- **GIVEN** un workflow principal abierto para sesión `'sess-1'`
- **WHEN** se invoca `getWorkflowBySessionId('sess-1')`
- **THEN** SHALL devolver el workflow principal de la sesión

#### Scenario: findWorkflowWithPendingToolUse encuentra tool_use pendiente

- **GIVEN** un workflow con un tool_use pendiente `{ toolUseId: 'tu-1', status: 'pending' }`
- **WHEN** se invoca `findWorkflowWithPendingToolUse('sess-1', 'tu-1')`
- **THEN** SHALL devolver `{ workflow, toolUse }` con el tool_use encontrado

#### Scenario: consumePendingToolUse elimina y devuelve tool_use

- **GIVEN** un workflow con un tool_use pendiente `{ toolUseId: 'tu-1' }`
- **WHEN** se invoca `consumePendingToolUse('wf-1', 'tu-1')`
- **THEN** SHALL devolver el tool_use
- **AND** el tool_use SHALL quedar marcado como consumido (no pendiente)

#### Scenario: withSessionLock serializa operaciones concurrentes

- **GIVEN** dos llamadas concurrentes a `withSessionLock('sess-1', fn)`
- **WHEN** ambas se ejecutan
- **THEN** SHALL ejecutarse secuencialmente (no en paralelo)

---

### Requirement: Delegación de eventos de cierre en el repo

El sistema SHALL actualizar `AuditHookEventHandler` en `src/3-operations/audit-hook-event.handler.ts` para que delegue en el repo los eventos de cierre y apertura, dejando de ser stubs:

| Evento | Acción en G2 |
|--------|-------------|
| `UserPromptSubmit` | Abre o confirma el workflow main en el repo (idempotente) |
| `Stop` | Invoca `readyToClose`; si `true`, invoca `close` |
| `SubagentStop` | Invoca `readyToClose` para el sub-workflow del agente; si `true`, invoca `close` |
| `StopFailure` | Invoca `close` directamente (no `readyToClose`; §15.4: siempre cierra) |
| `SubagentStart` | Sin cambio respecto a C3: llama `confirmSubagentFromHook` |
| `PreToolUse` | Stub diferido (ToolUse.status = running → fase posterior) |
| `PostToolUse` | Invoca `completeToolUse(workflowId, toolUseId, { isError: false, result })` |
| `PostToolUseFailure` | Invoca `completeToolUse(workflowId, toolUseId, { isError: true, result: error })` |

Tras `close()` exitoso en `Stop`, `SubagentStop` y `StopFailure`, el correlador emite `workflow_complete` (o `workflow_cancel`) al `EventBus`. `SessionPersistence` recibe el evento y proyecta `meta.json` + `output/result.json` a disco. `delegateClosure()` en `AuditHookEventHandler` se simplifica: solo invoca `sessionMetrics.updateFromWorkflow()` para workflows main (ver spec `gateway-audit-projection`).

El handler SHALL resolver el `workflowId` a partir del `sessionId` y `agentId` del hook usando `getWorkflowByAgentId` o `getWorkflowBySessionId`. Si no encuentra el workflow, SHALL registrar el evento en log sin lanzar excepción.

#### Scenario: PostToolUse invoca completeToolUse con resultado exitoso

- **GIVEN** un workflow activo con un tool_use `'tu-1'` en estado `running`
- **WHEN** `AuditHookEventHandler` procesa un hook `PostToolUse` con `toolUseId: 'tu-1'`
- **THEN** SHALL invocarse `completeToolUse(workflowId, 'tu-1', { isError: false, result: hook.result })`
- **AND** el tool_use SHALL quedar con `status: 'completed'`

#### Scenario: PostToolUseFailure invoca completeToolUse con error

- **GIVEN** un workflow activo con un tool_use `'tu-1'` en estado `running`
- **WHEN** `AuditHookEventHandler` procesa un hook `PostToolUseFailure` con `toolUseId: 'tu-1'`
- **THEN** SHALL invocarse `completeToolUse(workflowId, 'tu-1', { isError: true, result: hook.error })`
- **AND** el tool_use SHALL quedar con `status: 'error'`
