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

Referencia: condiciones de cierre en [§9.4 gateway-architecture.md](../../../docs/gateway-architecture.md#94-derivación-de-outcome-y-reglas-de-cierre).

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

Referencia: idempotencia en [§22 gateway-architecture.md](../../../docs/gateway-architecture.md#22-integración-wire--hooks-carreras-y-estados).

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

### Requirement: forceClose — closedByEvent omitido cuando el cierre no viene de un hook event

`forceClose` en `WorkflowRepositoryService` SHALL producir un `IWorkflowResult` que NO incluya `closedByEvent` cuando el cierre no proviene de un hook event (outcomes `orphaned`, `upstream-error`, `truncated`, `api_error` vía stream error). El campo `closedByEvent` de `IWorkflowResult` es opcional (`closedByEvent?: WorkflowClosedByEvent`) y solo está presente cuando el cierre se origina desde `close(workflowId, hook)` con un hook event válido.

`forceClose` SHALL además invocar `clearToolUseIndexFor(workflowId)` para limpiar el índice de correlación del workflow cerrado.

#### Scenario: forceClose por orphan no incluye closedByEvent en el result

- **GIVEN** un workflow con id `session-wire-3` y `result === null` (aún no cerrado)
- **AND** `findWorkflowByToolUseId` no encontró el parent para una continuation
- **WHEN** `forceClose('session-wire-3', 'orphaned', { continuationOrphan: true })` se invoca
- **THEN** el `IWorkflowResult` SHALL tener `outcome: 'orphaned'` y `stepCount: 0`
- **AND** el `IWorkflowResult` SHALL NO tener la clave `closedByEvent`
- **AND** el evento `workflow_complete` SHALL emitirse al bus con `outcome: 'orphaned'`
- **AND** `workflow.status` SHALL quedar como `'failed'`
- **AND** el índice `toolUseIdToWorkflowId` SHALL limpiar las entradas asociadas a `session-wire-3`

#### Scenario: forceClose por upstream-error no incluye closedByEvent

- **GIVEN** un workflow activo con id `wf-1`
- **WHEN** `forceClose('wf-1', 'upstream-error', { httpStatus: 502 })` se invoca
- **THEN** el `IWorkflowResult` SHALL tener `outcome: 'upstream-error'`
- **AND** el `IWorkflowResult` SHALL NO tener la clave `closedByEvent`

#### Scenario: close con hook event mantiene closedByEvent

- **GIVEN** un workflow activo
- **WHEN** `close(workflowId, hook)` se invoca con un hook event válido (ej. `Stop`, `SubagentStop`, `StopFailure`)
- **THEN** el `IWorkflowResult` SHALL incluir `closedByEvent: hook.eventName`

---

### Requirement: clearToolUseIndexFor — limpieza explícita del índice de correlación

`IWorkflowRepository` SHALL exponer el método `clearToolUseIndexFor(workflowId: string): void` cuya implementación en `WorkflowRepositoryService` elimine todas las entradas de `toolUseIdToWorkflowId` cuyo valor asociado sea `workflowId`. El método SHALL ser no-op si el `workflowId` no tiene entradas asociadas.

#### Scenario: clearToolUseIndexFor elimina entradas del workflow

- **GIVEN** un `WorkflowRepositoryService` con `toolUseIdToWorkflowId` conteniendo entradas para `wf-A` y `wf-B`
- **WHEN** `clearToolUseIndexFor('wf-A')` se invoca
- **THEN** todas las entradas cuyo valor sea `'wf-A'` SHALL eliminarse
- **AND** las entradas de `wf-B` SHALL conservarse intactas

#### Scenario: clearToolUseIndexFor es no-op para workflowId sin entradas

- **GIVEN** un `WorkflowRepositoryService` con `toolUseIdToWorkflowId` vacío o sin entradas del workflow
- **WHEN** `clearToolUseIndexFor('wf-any')` se invoca
- **THEN** la operación retorna sin error y sin mutar el índice

---

### Requirement: Continuation de tool client-side enlaza como step del workflow padre

Cuando `handleContinuation` procesa una request de continuation que porta un `tool_result` cuyo `tool_use_id` fue previamente registrado vía `registerToolUse` (tool client-side), `findWorkflowByToolUseId` SHALL devolver el workflow padre dueño de ese `tool_use_id`. En ese caso, `handleContinuation` SHALL registrar la nueva inferencia como un step adicional encadenado al workflow padre (`stepIndex = parentWorkflow.steps.length + 1`).

En este escenario, `handleContinuation` NO SHALL crear un workflow standalone, NO SHALL invocar `forceClose(workflowId, 'orphaned', { continuationOrphan: true })`, y NO SHALL emitir el warning `[audit] No se encontró workflow padre para continuation`. El resultado es que un turno agéntico completo (delegación inicial + N round-trips de tools client-side) se proyecta como un único workflow con N steps encadenados, en lugar de N workflows orphan espurios.

El warning de orphan SHALL quedar reservado para casos genuinos: continuation sin `tool_use_id` (`toolUseIds === []`) o cuyo `tool_use_id` no está indexado (p. ej. workflow padre ya cerrado y su índice limpiado).

#### Scenario: continuation con tool_result client-side registrado enlaza step sin orphan

- **GIVEN** un workflow `session-wire-3` que registró vía `registerToolUse` un tool client-side con `id: 'toolu-read-1'` (indexado en `toolUseIdToWorkflowId`)
- **WHEN** el cliente envía una continuation cuyo body porta `tool_result` con `tool_use_id: 'toolu-read-1'`
- **THEN** `findWorkflowByToolUseId(sessionId, 'toolu-read-1')` SHALL devolver `session-wire-3`
- **AND** `handleContinuation` SHALL registrar un step nuevo contra `session-wire-3` con `stepIndex === parentWorkflow.steps.length + 1`
- **AND** NO SHALL invocarse `forceClose` con `outcome: 'orphaned'`
- **AND** NO SHALL emitirse el warning `[audit] No se encontró workflow padre para continuation`

---

### Requirement: Registro y cierre de steps desde handlers wire

`AuditWorkflowHandler` (ingress) SHALL abrir un `IStep` por hop HTTP vía `registerWireStepRequest` (`registerStep` + emit `step_request`).

`AuditSseResponseHandler` y `AuditStandardResponseHandler` (egress) SHALL enriquecer el último step sin `closedAt` del workflow mediante `enrichOpenWireStepWithResponse`, asignando `assistantMessage`, `usage` y `stopReason` desde el ensamblaje. NO SHALL invocar `registerStep` para un segundo `IStep` cuando existe step abierto del mismo hop.

Cuando el step es terminal (`stopReason === 'end_turn'` o equivalente), el handler SHALL invocar `closeStep` tras el enriquecimiento. Cuando el step termina con `tool_use`, el handler SHALL enriquecer y SHALL invocar `closeStep` (hop HTTP completo). Si no hay step abierto (edge case), egress MAY registrar un step nuevo como fallback con la misma regla de cierre en `tool_use`.

Referencia: [§38 gateway-architecture.md](../../../docs/gateway-architecture.md#38-capa-3--operations), [session-audit-model.md](../../../docs/session-audit-model.md#2-principio-de-diseño).

#### Scenario: Inferencia SSE con end_turn enriquece step abierto

- **GIVEN** un workflow wire con un step abierto registrado por `registerWireStepRequest`
- **WHEN** `AuditSseResponseHandler` completa un stream con `stopReason: 'end_turn'`
- **THEN** SHALL enriquecerse el step existente con `assistantMessage`, `usage` y `stopReason`
- **AND** `workflow.steps.length` SHALL permanecer igual (no +1)
- **AND** SHALL invocarse `closeStep` con el `stepId` del step enriquecido

#### Scenario: Inferencia SSE con tool_use cierra el hop

- **GIVEN** un workflow wire con step abierto de ingress
- **WHEN** `AuditSseResponseHandler` completa con `stopReason: 'tool_use'`
- **THEN** el step enriquecido SHALL tener `closedAt` definido
- **AND** `registerStep` NO SHALL añadir un segundo step
- **AND** el workflow wire SHALL permanecer `running` hasta `end_turn`

#### Scenario: Tres hops producen tres steps

- **GIVEN** un workflow wire con tres ciclos request+response
- **WHEN** cada egress enriquece el step abierto de su hop
- **THEN** `workflow.steps.length` SHALL ser 3, no 6

---

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

