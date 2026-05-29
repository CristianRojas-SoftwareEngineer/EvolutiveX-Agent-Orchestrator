# Spec: gateway-workflow-lifecycle

## Purpose

Lifecycle completo del correlador `IWorkflowRepository` en G2: apertura de workflows (main y subagente), registro y cierre de steps y tool_uses, predicado `readyToClose` (§15.4) y operación `close` que invoca `buildWorkflowResult` de G1. Integra las costuras wire C1/C2 y la confirmación de subagente C3 con los modelos de dominio G1 (`IWorkflow`, `IStep`, `IToolUse`, `IWorkflowResult`). El adapter en memoria corre en paralelo al pipeline legacy `ISessionStore`/`ActiveInteraction` hasta G4.

---

## ADDED Requirements

### Requirement: IWorkflowRepository — lifecycle completo del correlador

El sistema SHALL ampliar la interface `IWorkflowRepository` en `src/1-domain/repositories/IWorkflowRepository.ts` con los siguientes métodos de lifecycle, **manteniendo** los tres métodos existentes de correlación wire (`openSubagentFromWire`, `getWorkflowByAgentId`, `confirmSubagentFromHook`):

- `openWorkflow(sessionId: string, agentCtx: AgentContext): IWorkflow` — abre un workflow principal (`kind: 'main'`); indexado por `agentCtx.agentId` si está presente.
- `openSubagentWorkflow(sessionId: string, agentCtx: AgentContext, parentWorkflowId: string, parentToolUseId: string): IWorkflow` — abre un sub-workflow (`kind: 'subagent'`); indexado por `agentCtx.agentId` y enlazado por `parentToolUseId`.
- `getWorkflow(workflowId: string): IWorkflow | undefined` — recupera un workflow por su `id`.
- `registerStep(workflowId: string, step: IStep): void` — adjunta un step al workflow.
- `closeStep(workflowId: string, stepId: string): void` — marca el step como cerrado (`closedAt`).
- `registerToolUse(workflowId: string, toolUse: IToolUse): void` — registra un tool_use en el workflow.
- `readyToClose(workflowId: string, hook: ClaudeHookEvent): boolean` — evalúa si el workflow puede cerrarse según las condiciones §15.4.
- `close(workflowId: string, hook: ClaudeHookEvent): IWorkflowResult` — cierra el workflow invocando `buildWorkflowResult`; idempotente si ya está cerrado.

El adapter en memoria SHALL implementar todos los métodos en `src/2-services/workflow-repository.service.ts`, manteniendo índices por `agentId` y por `parentToolUseId`.

#### Scenario: Apertura de workflow main y registro de step

- **GIVEN** un `WorkflowRepositoryService` en memoria vacío
- **WHEN** se invoca `openWorkflow('session-1', { agentId: 'agent-root', isSubagentRequest: false })`
- **AND** se invoca `registerStep(workflow.id, step)` con un step válido
- **THEN** el workflow SHALL tener `kind: 'main'` y `status: 'running'`
- **AND** `getWorkflow(workflow.id)` SHALL devolver el workflow con el step en `steps[]`

#### Scenario: Apertura de subagente enlazado por tool_use_id

- **GIVEN** un workflow main ya abierto con id `'wf-main'`
- **WHEN** se invoca `openSubagentWorkflow('session-1', { agentId: 'agent-child', isSubagentRequest: true }, 'wf-main', 'tu-abc')`
- **THEN** el sub-workflow SHALL tener `kind: 'subagent'`, `parentWorkflowId: 'wf-main'` y `parentToolUseId: 'tu-abc'`
- **AND** `getWorkflowByAgentId('agent-child')` SHALL devolver la entrada del sub-workflow

---

### Requirement: readyToClose — predicado de cierre §15.4

El sistema SHALL implementar `readyToClose(workflowId, hook)` en `IWorkflowRepository` siguiendo las condiciones de cierre de §15.4:

- SHALL devolver `false` si `hook.stopHookActive === true` (el sistema de hooks stop está activo; se esperan más hooks de stop).
- SHALL devolver `false` si `hook.backgroundTasks` indica subagentes async pendientes (valor > 0 o presencia de tareas pendientes).
- SHALL devolver `true` en cualquier otro caso.
- SHALL devolver `false` si el workflow con `workflowId` no existe en el repo.
- El predicado NO SHALL tener efectos secundarios en el estado del repo.

Referencia: condiciones de cierre en [§15.4 gateway-design.md](../../../../../docs/proposals/gateway-design.md#154-derivación-de-outcome-y-reglas-de-cierre).

#### Scenario: stop_hook_active true → no cerrar

- **GIVEN** un workflow activo con id `'wf-1'`
- **AND** un hook `Stop` con `stopHookActive: true`
- **WHEN** se invoca `readyToClose('wf-1', hook)`
- **THEN** el resultado SHALL ser `false`
- **AND** el estado del workflow en el repo SHALL no haber cambiado

#### Scenario: background_tasks pendientes → no cerrar

- **GIVEN** un workflow activo con id `'wf-1'`
- **AND** un hook `Stop` con `stopHookActive: false` y `backgroundTasks: 1`
- **WHEN** se invoca `readyToClose('wf-1', hook)`
- **THEN** el resultado SHALL ser `false`

#### Scenario: sin bloqueos → cerrable

- **GIVEN** un workflow activo con id `'wf-1'`
- **AND** un hook `Stop` con `stopHookActive: false` y `backgroundTasks: 0`
- **WHEN** se invoca `readyToClose('wf-1', hook)`
- **THEN** el resultado SHALL ser `true`

---

### Requirement: close — cierre del workflow e idempotencia §28

El sistema SHALL implementar `close(workflowId, hook)` en `IWorkflowRepository`:

- SHALL recopilar los steps cerrados del workflow (`steps` con `closedAt != null`) y los `IWorkflowResult` de sub-workflows completados.
- SHALL invocar `buildWorkflowResult(workflow, closedSteps, childResults, hook)` de G1 para obtener el `IWorkflowResult`.
- SHALL adjuntar el resultado a `workflow.result` y marcar `workflow.status` como `'completed'` (si `outcome === 'success'`) o `'failed'` (si `outcome === 'api_error'`) y asignar `completedAt`.
- SHALL ser **idempotente**: si el workflow ya está cerrado (`result != null`), SHALL ignorar la llamada y devolver el resultado existente sin mutar el estado.
- El resultado `IWorkflowResult` devuelto SHALL tener `totalCostUsd: undefined` (cálculo de pricing diferido a G4).

Referencia: idempotencia en [§28 gateway-design.md](../../../../../docs/proposals/gateway-design.md#28-integración-wire--hooks-carreras-y-estados).

#### Scenario: hook Stop → workflow cerrado con outcome success

- **GIVEN** un workflow activo con steps cerrados y un hook `Stop` con `lastAssistantMessage: 'Listo'`
- **WHEN** se invoca `close(workflow.id, hook)`
- **THEN** `workflow.result.outcome` SHALL ser `'success'`
- **AND** `workflow.result.closedByEvent` SHALL ser `'Stop'`
- **AND** `workflow.status` SHALL ser `'completed'`
- **AND** `workflow.result.finalText` SHALL ser `'Listo'`

#### Scenario: hook StopFailure → workflow cerrado con outcome api_error

- **GIVEN** un workflow activo con id `'wf-1'` y un hook `StopFailure`
- **WHEN** se invoca `close('wf-1', hook)`
- **THEN** `workflow.result.outcome` SHALL ser `'api_error'`
- **AND** `workflow.result.closedByEvent` SHALL ser `'StopFailure'`

#### Scenario: segundo hook de cierre ignorado — idempotencia

- **GIVEN** un workflow que ya fue cerrado con un primer hook `Stop`
- **WHEN** se invoca `close(workflow.id, hook)` por segunda vez con un hook `Stop` diferente
- **THEN** el resultado SHALL ser el `IWorkflowResult` del primer cierre sin cambios
- **AND** `workflow.result` SHALL seguir siendo el snapshot del primer cierre

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
| `PreToolUse` | Stub diferido (ToolUse.status = running → G4) |
| `PostToolUse` | Stub diferido (ToolUse.status = completed → G4) |
| `PostToolUseFailure` | Stub diferido (ToolUse.status = error → G4) |

El handler SHALL resolver el `workflowId` a partir del `sessionId` y `agentId` del hook usando `getWorkflowByAgentId` o un índice de sesión. Si no encuentra el workflow, SHALL registrar el evento en log sin lanzar excepción.

#### Scenario: hook Stop con repo activo → readyToClose + close

- **GIVEN** un workflow activo identificado por `agentId: 'agent-root'` en el repo
- **AND** un hook `Stop` con `stopHookActive: false`, `backgroundTasks: 0`
- **WHEN** `AuditHookEventHandler.execute(hook)` se invoca
- **THEN** SHALL llamarse `readyToClose(workflowId, hook)` → `true`
- **AND** SHALL llamarse `close(workflowId, hook)` sobre el workflow
- **AND** el workflow SHALL quedar con `status: 'completed'` y `result` asignado

#### Scenario: hook Stop con stop_hook_active true → no cierra

- **GIVEN** un workflow activo en el repo
- **AND** un hook `Stop` con `stopHookActive: true`
- **WHEN** `AuditHookEventHandler.execute(hook)` se invoca
- **THEN** `readyToClose` SHALL devolver `false`
- **AND** `close` NO SHALL invocarse
- **AND** el workflow SHALL permanecer `status: 'running'`

#### Scenario: hook StopFailure → close directo sin readyToClose

- **GIVEN** un workflow activo en el repo
- **AND** un hook `StopFailure`
- **WHEN** `AuditHookEventHandler.execute(hook)` se invoca
- **THEN** `close` SHALL invocarse directamente sin llamar a `readyToClose`
- **AND** `workflow.result.outcome` SHALL ser `'api_error'`
