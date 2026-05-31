# gateway-workflow-lifecycle Specification

## Purpose

Lifecycle del correlador gateway (`IWorkflowRepository`): apertura/cierre de workflows, registro de steps desde wire (G4),
predicado `readyToClose`, delegación de hooks y proyección a disco vía `AuditWorkflowClosureHandler` (G4).
Implementado en fases G2 (repo + hooks) y G4 (wire→correlador + proyección).
## Requirements
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
| `PreToolUse` | Stub diferido (ToolUse.status = running → fase posterior) |
| `PostToolUse` | Stub diferido (ToolUse.status = completed → fase posterior) |
| `PostToolUseFailure` | Stub diferido (ToolUse.status = error → fase posterior) |

Tras `close()` exitoso en `Stop`, `SubagentStop` y `StopFailure`, el handler SHALL delegar la proyección a disco en `AuditWorkflowClosureHandler` (G4), resolviendo rutas de workflow desde `IWorkflowRepository` (wire meta / `layoutIndex`) y dejando que `SessionPersistence` proyecte `meta.json` y `output/result.json` bajo `sessions/<sessionId>/workflows/NN/`.

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

---

### Requirement: Propagación del modelo observado al workflow

El port `IWorkflowRepository` (capa 1) SHALL exponer una operación `setWorkflowModel(workflowId, modelId)` que asigne `workflow.languageModelId` con el **primer modelo observado** para ese workflow. La operación SHALL ser idempotente respecto al modelo: si `languageModelId` ya está fijado, no lo sobrescribe. Si el `workflowId` no existe en el correlador, la operación SHALL ser un no-op (sin error). Este dato es prerequisito de `SessionMetricsService` en G4 para desglosar `session-metrics.json` por modelo.

#### Scenario: Primer modelo observado fija languageModelId

- **WHEN** se invoca `setWorkflowModel(workflowId, 'claude-sonnet-4-6')` sobre un workflow cuyo `languageModelId` está sin fijar
- **THEN** `workflow.languageModelId` queda en `'claude-sonnet-4-6'`

#### Scenario: Modelo posterior no sobrescribe el primero

- **WHEN** un workflow ya tiene `languageModelId` fijado y se invoca `setWorkflowModel` con un modelo distinto
- **THEN** `workflow.languageModelId` conserva el primer valor observado

#### Scenario: Workflow inexistente es no-op

- **WHEN** se invoca `setWorkflowModel` con un `workflowId` no registrado en el correlador
- **THEN** la operación retorna sin error y sin mutar ningún workflow

### Requirement: El handler SSE propaga el modelo al completar la inferencia

`AuditSseResponseHandler` (capa 3) SHALL propagar, al completar la inferencia, el modelo del request hacia el correlador resolviendo el workflow por su clave de correlación (`sessionId` para el workflow main, `agentId` para subagente) e invocando `setWorkflowModel`. La propagación SHALL ser defensiva: si el workflow aún no fue abierto en el correlador (que corre en paralelo en memoria, sin impacto en disco), la propagación no produce efecto ni error.

#### Scenario: Propagación al workflow main abierto por hooks

- **WHEN** una inferencia de un workflow main completa y el workflow ya fue abierto en el correlador (vía `UserPromptSubmit`)
- **THEN** el handler invoca `setWorkflowModel(sessionId, modelId)` y `workflow.languageModelId` queda fijado con el modelo del request

#### Scenario: Propagación sin workflow abierto no afecta el flujo

- **WHEN** una inferencia completa pero el correlador no tiene el workflow correspondiente abierto
- **THEN** la propagación es no-op y el pipeline de auditoría legacy continúa sin alteración

### Requirement: Registro y cierre de steps desde handlers wire

`AuditSseResponseHandler` y `AuditStandardResponseHandler` (capa 3) SHALL, al completar cada inferencia, registrar el step en el correlador unificado (`IWorkflowRepository`) invocando `registerStep(workflowId, step)` con un `IStep` construido desde el snapshot del request de inferencia y el resultado ensamblado (`StepAssembler.result()` para SSE; respuesta parseada completa para standard). Cuando el step es terminal (`stopReason === 'end_turn'`), el handler SHALL invocar `closeStep(workflowId, stepId)` inmediatamente al finalizar la inferencia. Cuando el step termina con `tool_use`, el handler SHALL invocar `registerStep` pero NO SHALL invocar `closeStep` hasta el cierre diferido vía hooks (el step permanece abierto en el correlador). Si el workflow no existe en el correlador, las invocaciones SHALL ser no-op defensivo sin error ni interrupción del pipeline legacy.

Referencia: [§41 gateway-design.md](../../docs/proposals/gateway-design.md#41-capa-3-objetivo).

#### Scenario: Inferencia SSE con end_turn registra y cierra el step

- **GIVEN** un workflow main abierto en el correlador para `sessionId`
- **WHEN** `AuditSseResponseHandler` completa un stream con `stopReason: 'end_turn'`
- **THEN** SHALL invocarse `registerStep` con un `IStep` que incluye `inferenceRequest`, `assistantMessage`, `usage` y `stopReason` del ensamblaje
- **AND** SHALL invocarse `closeStep` con el `stepId` del step registrado
- **AND** el step en el correlador SHALL tener `closedAt` asignado

#### Scenario: Inferencia SSE con tool_use registra step abierto

- **GIVEN** un workflow main abierto en el correlador
- **WHEN** `AuditSseResponseHandler` completa un stream con `stopReason: 'tool_use'`
- **THEN** SHALL invocarse `registerStep` con el step ensamblado
- **AND** `closeStep` NO SHALL invocarse en ese momento
- **AND** el step en el correlador SHALL permanecer sin `closedAt`

#### Scenario: Workflow ausente en correlador es no-op

- **GIVEN** que el correlador no tiene el workflow correspondiente abierto
- **WHEN** un handler wire completa una inferencia
- **THEN** `registerStep` y `closeStep` no mutan estado ni lanzan error
- **AND** el pipeline de auditoría legacy continúa sin alteración

