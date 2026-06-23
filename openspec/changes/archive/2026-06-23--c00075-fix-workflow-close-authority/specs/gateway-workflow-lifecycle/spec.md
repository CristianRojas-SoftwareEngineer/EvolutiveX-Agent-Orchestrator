## ADDED Requirements

### Requirement: closeAuthority — autoridad explícita de cierre del workflow

El modelo `Workflow` (y su interface `IWorkflow`) SHALL exponer un campo `closeAuthority: 'stop-hook' | 'sse'` (tipo `WorkflowCloseAuthority`) que declara explícitamente qué autoridad cierra el workflow E2E, reemplazando la heurística basada en el esquema de `id` (`workflow.id === workflow.sessionId`).

El valor SHALL fijarse en el momento de creación del workflow, de forma determinista:

- `openWorkflow` SHALL asignar `closeAuthority: 'sse'` cuando `forceNew === true` (workflow wire huérfano de continuation) y `closeAuthority: 'stop-hook'` en cualquier otro caso (turno E2E: primero `id === sessionId` o posteriores `${sessionId}-turn-N`).
- `openSubagentWorkflow` SHALL asignar `closeAuthority: 'stop-hook'` (cierre por `SubagentStop`).
- El resultado defensivo sintético de `close()` cuando el workflow no existe SHALL usar `closeAuthority: 'stop-hook'`.

El campo SHALL ser de solo lectura tras la creación: ninguna ruta de cierre lo muta.

#### Scenario: turno E2E recibe closeAuthority stop-hook

- **GIVEN** una sesión que abre su primer turno (`openWorkflow` sin `forceNew`)
- **WHEN** se crea el workflow de turno (`id === sessionId`)
- **THEN** `workflow.closeAuthority` SHALL ser `'stop-hook'`

#### Scenario: turno posterior turn-N recibe closeAuthority stop-hook

- **GIVEN** una sesión con un segundo turno (`openWorkflow` sin `forceNew`, `layoutIndex > 1`)
- **WHEN** se crea el workflow `${sessionId}-turn-2`
- **THEN** `workflow.closeAuthority` SHALL ser `'stop-hook'`

#### Scenario: workflow wire huérfano recibe closeAuthority sse

- **GIVEN** una continuation sin workflow padre que invoca `openWireWorkflow` (`forceNew: true`)
- **WHEN** se crea el workflow `${sessionId}-wire-N`
- **THEN** `workflow.closeAuthority` SHALL ser `'sse'`

#### Scenario: sub-workflow recibe closeAuthority stop-hook

- **GIVEN** un spawn de subagente que invoca `openSubagentWorkflow`
- **WHEN** se crea el sub-workflow (`kind: subagent`)
- **THEN** `workflow.closeAuthority` SHALL ser `'stop-hook'`

## MODIFIED Requirements

### Requirement: Cierre E2E del turno solo por hook

**Reason**: La heurística `id === sessionId` solo identifica el primer turno; los turnos posteriores (`${sessionId}-turn-N`, N≥2) no la satisfacían y se forzaban a cerrar en SSE antes de que llegara el hook `Stop`, dejando el evento `Stop` sin workflow abierto (sin cierre por hook, sin voz, sin toast).

**Migration**: El criterio pasa de `id === sessionId` a `closeAuthority === 'stop-hook'`, que cubre el primer turno y los `${sessionId}-turn-N` por igual, sin alterar el comportamiento del primer turno ni de los subagentes.

El workflow de turno E2E —el primero (`id === sessionId`) y los posteriores (`id === \`${sessionId}-turn-N\``)— SHALL tener `closeAuthority: 'stop-hook'` y SHALL cerrarse exclusivamente por hook `Stop` o `StopFailure`. SSE `end_turn` SHALL NOT invocar `forceClose` ni emitir `workflow_complete` para ningún workflow con `closeAuthority: 'stop-hook'`.

Sub-workflows (`kind: subagent`) SHALL tener `closeAuthority: 'stop-hook'` y seguir la misma regla: cierre E2E por `SubagentStop`, no por `end_turn` SSE.

#### Scenario: end_turn cierra step pero no workflow de turno

- **GIVEN** un workflow de turno con step agentic abierto
- **WHEN** `AuditSseResponseHandler` completa con `stopReason: end_turn`
- **THEN** el step SHALL cerrarse (`closedAt` definido)
- **AND** el workflow de turno SHALL permanecer `running`
- **AND** NO SHALL emitirse `workflow_complete` para `workflowId === sessionId`

#### Scenario: end_turn no cierra workflow turn-N (regresión)

- **GIVEN** un workflow `turn-N` (`id === \`${sessionId}-turn-2\``, `closeAuthority: 'stop-hook'`) con step agentic abierto
- **WHEN** `AuditSseResponseHandler` completa con `stopReason: end_turn`
- **THEN** el step SHALL cerrarse (`closedAt` definido)
- **AND** el workflow `turn-N` SHALL permanecer `running` (`result === null`)
- **AND** NO SHALL emitirse `workflow_complete` por SSE para el workflow `turn-N`
- **AND** `getWorkflowBySessionId(sessionId)` SHALL devolver el workflow `turn-N` para que el hook `Stop` lo cierre

#### Scenario: side-request end_turn no cierra workflow turn-N con tool_use cliente pendiente

- **GIVEN** un workflow `turn-N` (id `${sessionId}-turn-N`, N≥2) con un step agéntico que cerró con `stopReason: 'tool_use'` y un tool cliente (p. ej. `ExitPlanMode`) indexado en `toolUseIdToWorkflowId`
- **AND** un step `stepKind: 'side-request'` adjunto al mismo workflow que cierra con `stopReason: 'end_turn'`
- **WHEN** `closeWireWorkflowOnTerminalStop` evalúa el `end_turn` del step side-request
- **THEN** el workflow `turn-N` SHALL permanecer `running` (`result === null`)
- **AND** `findWorkflowByToolUseId` SHALL seguir devolviendo el workflow para el `tool_use_id` del step agéntico

#### Scenario: Stop cierra turno y emite workflow_complete

- **GIVEN** un workflow de turno con todos los hops HTTP cerrados
- **WHEN** llega hook `Stop` con `readyToClose === true`
- **THEN** el correlador SHALL invocar `close` y emitir `workflow_complete`
- **AND** `SessionPersistence` SHALL escribir `output/result.json` bajo `workflows/NN/`

### Requirement: Rama huérfana de continuation — workflow abierto hasta reaper o shutdown

**Reason**: El requirement omitía la rama de cierre SSE-terminal legítima del huérfano y atribuía implícitamente el bug de métricas al cierre en SSE, cuando la causa real era el `forceClose` prematuro con 0 steps en el momento de creación.

**Migration**: Se hace explícito que el huérfano tiene `closeAuthority: 'sse'` y que su cierre nunca es prematuro: el step se cierra (`closeStep`) antes del `forceClose`, de modo que `finalizeWorkflowMetrics` siempre recibe steps reales. El cierre por SSE terminal y el cierre por reaper cubren casos disjuntos del huérfano.

Cuando `handleContinuation` no encuentra un workflow padre para una continuation (resultado genuinamente huérfano, p. ej. SSE previo nunca llegó), el handler SHALL:

- Crear un workflow wire nuevo con `openWireWorkflow` (`forceNew: true`, `closeAuthority: 'sse'`).
- Marcar `continuationOrphan: true` en `wireMeta` (señal diagnóstica).
- **NOT** invocar `forceClose` en el momento de creación: el workflow permanece `running` con 0 steps hasta que su inferencia registre y cierre sus steps reales. Esta es la invariante que evita el bug de métricas (un `forceClose` prematuro con 0 steps quemaba la guarda de idempotencia de `finalizeWorkflowMetrics`).

El cierre efectivo del huérfano SHALL ocurrir por una de dos rutas disjuntas, ambas con sus steps reales ya cerrados:

- **Stop terminal SSE**: si la inferencia del huérfano cierra con `stopReason` terminal (`end_turn`, `max_tokens`, ausente), `closeWireWorkflowOnTerminalStop` SHALL invocar `forceClose` tras `closeStep`, de modo que `closedSteps.length >= 1` y `finalizeWorkflowMetrics` reciba los steps reales.
- **Reaper / shutdown**: si la inferencia cierra con `stopReason: 'tool_use'` y el huérfano queda en `awaitingContinuation` sin continuation posterior, el reaper (`closeOrphanWorkflow` tras `ORPHAN_MAX_AGE_MS`) o el cierre de sesión SHALL invocar `forceClose('orphaned')` con los steps reales acumulados.

`finalizeWorkflowMetrics` SHALL barrer el `usage` completo del workflow en el momento de cierre efectivo, sin que ninguna de las dos rutas ejecute un cierre de 0 steps.

#### Scenario: continuation sin padre crea workflow abierto con continuationOrphan

- **GIVEN** una sesión sin ningún workflow padre que coincida con el `tool_use_id` de la continuation
- **WHEN** `handleContinuation` procesa la request
- **THEN** SHALL crearse un workflow nuevo cuyo `result` SHALL ser `null` (abierto)
- **AND** `workflow.closeAuthority` SHALL ser `'sse'`
- **AND** `getWireMeta(workflow.id).continuationOrphan` SHALL ser `true`
- **AND** NO SHALL emitirse `workflow_complete` en este momento

#### Scenario: huérfano cierra en stop terminal SSE con steps reales

- **GIVEN** un workflow `continuationOrphan` (`closeAuthority: 'sse'`) cuya inferencia registró un step
- **WHEN** la respuesta SSE cierra con `stopReason: end_turn`
- **THEN** el step SHALL cerrarse (`closeStep`) antes del `forceClose`
- **AND** `closeWireWorkflowOnTerminalStop` SHALL invocar `forceClose` con `stepCount >= 1`
- **AND** `finalizeWorkflowMetrics` SHALL recibir los steps reales (no un cierre de 0 steps)

#### Scenario: reaper cierra workflow continuationOrphan con outcome orphaned

- **GIVEN** un workflow abierto con `continuationOrphan: true` y `awaitingContinuation: true` en wireMeta cuyo `awaitingSince` supera `ORPHAN_MAX_AGE_MS`
- **WHEN** `closeOrphanWorkflow` del reaper lo procesa
- **THEN** `forceClose('orphaned')` SHALL invocarse con los steps reales del workflow
- **AND** `finalizeWorkflowMetrics` SHALL ejecutarse sobre esos steps reales al cerrarse
