# gateway-audit-projection Specification

## Purpose

Proyección de auditoría vía `EventBus` + `SessionPersistence` al layout `causal-workflows-v1` (`sessions/{sessionId}/workflows/NN/`).
Los handlers L3 publican eventos; `SessionPersistence` escribe `meta.json`, steps, tools y `output/result.json`.
`AuditWorkflowClosureHandler` conserva métricas de sesión sin escribir disco. Actualizado en fase P1 (2026-05-30).
## Requirements
### Requirement: AuditWorkflowClosureHandler — proyección de WorkflowResult a disco

`AuditWorkflowClosureHandler` SHALL delegar la escritura de `meta.json` y `output/result.json` a `SessionPersistence` a través del `EventBus`. El handler SHALL seguir existiendo como orquestador de capa 3 que coordina el cierre y las métricas de sesión, pero NO SHALL escribir archivos directamente. La secuencia es:

1. `AuditHookEventHandler` invoca `close()` en el correlador.
2. El correlador emite `workflow_complete` (o `workflow_cancel`) al `EventBus`.
3. `SessionPersistence` recibe el evento y proyecta `meta.json` + `output/result.json` a disco.

El layout bajo `sessions/` SHALL ser `causal-workflows-v1` (`sessions/{sessionId}/workflows/NN/`).

#### Scenario: Hook Stop cierra workflow y persistencia proyecta vía bus

- **GIVEN** un workflow main con steps cerrados en el correlador
- **WHEN** `AuditHookEventHandler` procesa un hook `Stop` que invoca `close()` y obtiene `IWorkflowResult`
- **THEN** el correlador SHALL emitir `workflow_complete` al bus
- **AND** `SessionPersistence` SHALL recibir el evento y escribir `meta.json` y `output/result.json` en `workflows/NN/`
- **AND** `AuditWorkflowClosureHandler` NO SHALL escribir archivos directamente

#### Scenario: Separación cuándo cerrar vs qué escribir se mantiene

- **GIVEN** un hook de cierre que pasa `readyToClose` y ejecuta `close()`
- **WHEN** el correlador emite el evento al bus
- **THEN** `AuditHookEventHandler` NO SHALL escribir `meta.json` directamente
- **AND** `SessionPersistence` SHALL ser el único componente que escribe a disco

#### Scenario: Nombres canónicos en código

- **WHEN** se ejecuta `npm run typecheck` tras el rename
- **THEN** NO SHALL existir referencias a `AuditInteractionHandler`, `AuditInteractionContext`,
  `auditInteractionDir` ni `interactionType` en `src/`
- **AND** NO SHALL existir referencias a `InteractionType` ni `InteractionOutcome` en `src/`

### Requirement: Delegación de cierre de workflow main en delegateClosure

`delegateClosure()` en `AuditHookEventHandler` SHALL, cuando el workflow sea de kind `main` **o** `subagent`, invocar `sessionMetrics.finalizeWorkflowMetrics()` (incremento de `finalized_runs` / reconciliación de ejecución) y NO SHALL re-ejecutar un merge completo de steps/tokens que duplique hops ya contabilizados per-step en la misma ejecución. NO SHALL invocar `AuditWorkflowClosureHandler.execute()` ni resolver rutas flat legacy.

#### Scenario: Delegación de cierre main actualiza finalized_runs sin duplicar steps

- **GIVEN** un workflow `kind: 'main'` cerrado por hook `Stop` o `StopFailure`
- **AND** sus steps contables ya fueron persistidos vía `updateFromStep`
- **WHEN** `delegateClosure` ejecuta
- **THEN** `finalizeWorkflowMetrics` SHALL invocarse una vez
- **AND** `finalized_runs` SHALL incrementarse en 1 para el modelo atribuido del workflow
- **AND** `billable_hops` y tokens NO SHALL duplicarse

#### Scenario: Delegación de cierre subagent actualiza finalized_runs

- **GIVEN** un workflow `kind: 'subagent'` cerrado por hook `SubagentStop`
- **AND** al menos un step del subagent tuvo `usage` contabilizado per-step
- **WHEN** `delegateClosure` ejecuta
- **THEN** `finalizeWorkflowMetrics` SHALL invocarse
- **AND** `finalized_runs` SHALL incrementarse para el modelo atribuido del sub-workflow

### Requirement: Cierre wire-only degradado a fallback

El cierre del turno basado únicamente en `stop_reason` del wire (sin hook `Stop`/`SubagentStop`) NO SHALL ser la ruta principal de escritura de `meta.json` en G4. El sistema SHALL conservar un fallback wire-only documentado (`@deprecated-fallback`) cuando los hooks no disparan.

#### Scenario: Cierre normativo vía hooks

- **GIVEN** hooks configurados y un workflow con steps registrados desde wire
- **WHEN** llega el hook `Stop` tras completar el turno
- **THEN** `meta.json` SHALL escribirse vía `AuditWorkflowClosureHandler` tras `close()`
- **AND** la ruta wire-only NO SHALL ser la única escritura de cierre en el flujo nominal

### Requirement: Retiro de InteractionMetadata como fuente primaria de meta.json

Los handlers wire (`AuditSseResponseHandler`, `AuditStandardResponseHandler`) NO SHALL construir `InteractionMetadata` como fuente primaria de `meta.json` al cierre del turno nominal con hooks. El tipo `InteractionMetadata` MAY permanecer como `@deprecated` para consumidores transitorios (p. ej. `audit-upstream-error.handler.ts`).

#### Scenario: Ruta nominal de cierre no construye InteractionMetadata

- **GIVEN** hooks configurados y un workflow con cierre normativo vía hook `Stop`
- **WHEN** el turno finaliza y `AuditWorkflowClosureHandler` proyecta el resultado a disco
- **THEN** `meta.json` SHALL derivarse de `IWorkflowResult` mediante el mapper dedicado
- **AND** los handlers wire (`AuditSseResponseHandler`, `AuditStandardResponseHandler`) NO SHALL escribir `meta.json` como fuente primaria en ese flujo

### Requirement: Retiro de componentes legacy (P1)

El sistema SHALL retirar `SessionStoreService`, `WorkflowResultProjector`, el puerto `ISessionStore` y el puerto `IAuditWriter`. Los handlers L3 SHALL usar `IWorkflowRepository` + `EventBus`. La forensia SSE SHALL materializarse vía eventos `stream_chunk` y proyección en `SessionPersistence`; NO SHALL usar `ISseAuditWriter`, `AuditWriterService` ni `response/sse.jsonl` en código de producción tras P2.

#### Scenario: Sesiones nuevas usan layout causal-workflows-v1

- **GIVEN** un proxy con P1 implementado
- **WHEN** se procesa una solicitud completa (workflow + steps + tools)
- **THEN** los archivos de sesión SHALL crearse bajo `sessions/<id>/workflows/NN/steps/MM/tools/KK/`
- **AND** NO SHALL crearse archivos bajo el layout flat (`main-agent/interactions/`)

#### Scenario: No existen referencias a ISessionStore en producción

- **WHEN** se ejecuta `npm run typecheck`
- **THEN** NO SHALL existir referencias a `ISessionStore` ni `SessionStoreService` en `src/`

---

### Requirement: Retiro del shim ISseAuditWriter (P2)

Tras P2, el sistema SHALL NOT exponer ni usar `ISseAuditWriter` ni `AuditWriterService` en código de producción. `AuditSseResponseHandler` SHALL publicar eventos `stream_chunk` al `EventBus` y SHALL NOT escribir `sse.jsonl`, `sse.txt` ni artefactos SSE inline en disco.

#### Scenario: Handler SSE sin escritura directa

- **GIVEN** P2 implementado
- **WHEN** `AuditSseResponseHandler` procesa un stream SSE
- **THEN** SHALL publicar `stream_chunk` al bus por cada evento relevante
- **AND** SHALL NOT invocar métodos de escritura SSE en disco

#### Scenario: Sin sse.jsonl en producción

- **WHEN** se buscan referencias a `sse.jsonl` bajo `src/`
- **THEN** NO SHALL existir rutas de escritura de producción que creen `response/sse.jsonl`

---

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

### Requirement: Autoridad de completación de tool_use

Cada `IToolUse` registrado en el correlador SHALL llevar `completionAuthority: 'continuation' | 'hook'`, fijada en el momento del registro y inmutable hasta el cierre del tool.

| Registro | `completionAuthority` |
|----------|----------------------|
| `registerToolUse` | `continuation` |
| `registerPendingToolUse` con nombre `Agent` (case-insensitive) | `continuation` |
| `registerPendingToolUse` con nombre `web_search` o `web_fetch` (case-insensitive) | `hook` |

`IWorkflowRepository` SHALL exponer la autoridad de un tool por `workflowId` + `toolUseId`.

`AuditHookEventHandler` SHALL invocar `completeToolUse` en `PostToolUse` / `PostToolUseFailure` **solo** cuando `completionAuthority === 'hook'`.

`handleContinuation` SHALL invocar `completeToolUse` desde bloques `tool_result` del body HTTP para tools con `completionAuthority === 'continuation'` que sigan en `status: running`.

#### Scenario: Bash client-side no se completa desde PostToolUse

- **GIVEN** un tool `Bash` registrado vía `registerToolUse` con `completionAuthority: continuation` y `status: running`
- **WHEN** llega un hook `PostToolUse` sin `lastAssistantMessage` para ese `tool_use_id`
- **THEN** `completeToolUse` NO SHALL invocarse desde el hook handler
- **AND** el tool SHALL permanecer en `status: running`

#### Scenario: Continuation completa Bash con stdout canónico

- **GIVEN** un tool `Bash` con `completionAuthority: continuation` y `status: running`
- **AND** un hook `PostToolUse` ya llegó sin completar el tool (escenario anterior)
- **WHEN** `handleContinuation` procesa un body cuyo último mensaje contiene `{ type: 'tool_result', tool_use_id, content: '<stdout>' }`
- **THEN** SHALL invocarse `completeToolUse` con `result.content === '<stdout>'`
- **AND** SHALL emitirse exactamente un evento `tool_result`
- **AND** `SessionPersistence` SHALL escribir `tools/KK-slug/result.json` con ese contenido

#### Scenario: Bash fallido recibe stderr real desde continuation

- **GIVEN** un tool `Bash` con `completionAuthority: continuation` y `status: running`
- **WHEN** llega `PostToolUseFailure` sin mensaje útil
- **THEN** el hook NO SHALL completar el tool
- **AND** cuando llegue la continuation con `tool_result` e `is_error: true` y contenido `Exit code 128 …`
- **THEN** `result.json` SHALL contener ese texto, no `{ error: 'PostToolUseFailure' }`

#### Scenario: WebFetch mantiene completación por hook

- **GIVEN** un tool `WebFetch` registrado vía `registerPendingToolUse` con `completionAuthority: hook`
- **WHEN** llega `PostToolUse` con `lastAssistantMessage: 'page summary'`
- **THEN** `completeToolUse` SHALL invocarse desde el hook handler con ese resultado

### Requirement: Registro de tool_use client-side observados en respuestas wire

Los bloques `tool_use` client-side (los tools de Claude Code: `Read`/`Edit`/`Bash`/`Grep`/…, esto es, todos los que NO pertenecen a `pendingToolUseKinds` = `agent`/`web_search`/`web_fetch`) observados al ensamblar una respuesta wire SHALL registrarse vía `IWorkflowRepository.registerToolUse(workflowId, toolUse)`.

`registerToolUse` SHALL: (a) emitir `tool_call` (proyectado por `SessionPersistence` a `tools/KK-slug/input.json` + `meta.json`), (b) hacer push del `IToolUse` a `step.toolUses` con `completionAuthority: continuation`, (c) poblar `toolUseIdToWorkflowId` mapeando el `tool_use_id` al `workflowId` dueño.

Este registro NO SHALL tocar `pendingToolUses`, por lo que NO SHALL disparar el camino de coalescing server-side (`resolveAgentContinuationTarget`/`handleSubagent`). El indexado de (c) garantiza que la continuation que porte el `tool_result` de ese tool encuentre su workflow padre vía `findWorkflowByToolUseId`.

`PostToolUse` NO SHALL ser la vía de completación para estos tools; la completación SHALL ocurrir exclusivamente cuando `handleContinuation` procese el bloque `tool_result` canónico del body HTTP.

Ambos caminos de respuesta SHALL mantener paridad: `AuditSseResponseHandler` (streaming) registra los `tool_use` ensamblados desde `assembled.toolUseBlocks`; `AuditStandardResponseHandler` (no-streaming) los extrae de los bloques `type === 'tool_use'` del body de respuesta.

#### Scenario: tool_use client-side se registra e indexa al ensamblar el wire

- **GIVEN** un `AuditSseResponseHandler` auditando el workflow `session-wire-3`
- **WHEN** el stream SSE ensambla un bloque `tool_use` client-side (p. ej. `Read` con `id: 'toolu-read-1'`) que NO está en `pendingToolUseKinds`
- **THEN** el handler SHALL invocar `registerToolUse('session-wire-3', toolUse)` (no `registerPendingToolUse`)
- **AND** el `IToolUse` registrado SHALL tener `completionAuthority: continuation`
- **AND** SHALL emitirse un evento `tool_call` para `toolu-read-1`
- **AND** `findWorkflowByToolUseId(sessionId, 'toolu-read-1')` SHALL devolver el workflow `session-wire-3`

#### Scenario: paridad en el camino no-streaming

- **GIVEN** un `AuditStandardResponseHandler` auditando el workflow `session-wire-3`
- **WHEN** el body de respuesta contiene un bloque `type: 'tool_use'` client-side con `id: 'toolu-edit-1'`
- **THEN** el handler SHALL invocar `registerToolUse('session-wire-3', toolUse)` para ese bloque
- **AND** `toolUseIdToWorkflowId` SHALL mapear `'toolu-edit-1'` a `'session-wire-3'`

---

### Requirement: Limpieza de toolUseIdToWorkflowId en paths de error

El sistema SHALL exponer en `IWorkflowRepository` un método `clearToolUseIndexFor(workflowId: string): void` que elimine todas las entradas de `toolUseIdToWorkflowId` cuyo valor sea el `workflowId` dado. Este método SHALL ser invocado desde:

- `AuditSseResponseHandler` en el handler de `stream.on('error')` para el workflow que se está auditando en ese momento.
- `audit-upstream-error.handler` cuando procesa un error que invalida la inferencia en curso.
- `forceClose` (invocación interna; el método público reemplaza el código inline previo).

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

---

### Requirement: AuditWorkflowContext — contexto de handlers L3

La interfaz que desacopla los handlers L3 de Fastify SHALL llamarse `AuditWorkflowContext`
(renombrada desde `AuditInteractionContext`). Sus campos SHALL ser:

- `auditWorkflowDir` (renombrado desde `auditInteractionDir`): ruta al directorio `workflows/NN/` (índice base 1)
- `workflowKind` (renombrado desde `interactionType`): tipo `WorkflowRequestKind` (`'agentic' | 'side-request'` para hops auditados)
- `workflowId`: identificador obligatorio del workflow específico abierto para esta request; los handlers de respuesta usan este campo para resolver el workflow destino de eventos y mutaciones

Los augments de Fastify (`fastify.augments.d.ts`) SHALL usar los nombres canónicos
`request.auditWorkflowDir` y `request.workflowKind`.

Referencia técnica: [§23 gateway-architecture.md](../../../docs/gateway-architecture.md#23-integración-correlador--bus-de-eventos--persistencia).

#### Scenario: AuditWorkflowHandler usa AuditWorkflowContext

- **GIVEN** `AuditWorkflowHandler` y `AuditSseResponseHandler` activos
- **WHEN** se construye `AuditWorkflowContext` en `ProxyController`
- **THEN** los campos `auditWorkflowDir` y `workflowKind` SHALL estar presentes
- **AND** el tipo SHALL estar importado desde `audit.types.ts` (no desde `types/gateway/`)

---

### Requirement: Clasificación de requests — `continuation` basada en el último mensaje

`classifyRequestBody` SHALL clasificar un request como `continuation` únicamente si el **último mensaje** del array `messages` contiene uno o más bloques `type: "tool_result"` con `tool_use_id` de tipo string. La presencia de `"tool_result"` en mensajes anteriores del historial acumulado NO SHALL ser condición suficiente para la clasificación `continuation`.

La implementación SHALL mantener el fast-path de búsqueda de string como pre-filtro (si no hay `"tool_result"` en el buffer completo, no hay continuation posible), y solo cuando el pre-filtro detecte el string SHALL parsear el body para verificar la condición semántica en el último mensaje.

Esta invariante es consistente con la semántica del protocolo Anthropic Messages API: una continuation es una respuesta de herramienta que ocupa la última posición del array de mensajes, no un artefacto del historial acumulado de la conversación.

#### Scenario: request con tool_result en último mensaje se clasifica como continuation

- **WHEN** el body contiene un array `messages` cuyo último elemento es `{ role: "user", content: [{ type: "tool_result", tool_use_id: "tu-x", ... }] }`
- **THEN** `classifyRequestBody` SHALL devolver `{ type: "continuation" }`

#### Scenario: request con tool_result solo en historial no se clasifica como continuation

- **WHEN** el body contiene un array `messages` donde un mensaje anterior tiene `type: "tool_result"` pero el último mensaje es `{ role: "user", content: "nueva instrucción" }` (sin tool_result)
- **THEN** `classifyRequestBody` SHALL NOT devolver `{ type: "continuation" }`
- **AND** la clasificación SHALL aplicar las reglas subsiguientes (`fresh`, `side-request`, etc.) sobre el body

#### Scenario: request con tool_result en historial Y tools no vacío se clasifica como fresh

- **WHEN** el body contiene mensajes de historial con `tool_result` y el último mensaje es un nuevo turno del usuario
- **AND** el body incluye un campo `tools` con al menos una herramienta definida
- **THEN** `classifyRequestBody` SHALL devolver `{ type: "fresh" }`

#### Scenario: body malformado o sin mensajes no es continuation

- **WHEN** el fast-path de string detecta `"tool_result"` en el buffer
- **AND** el parseo JSON falla o `messages` está vacío o el último mensaje no tiene bloques `tool_result` válidos
- **THEN** `classifyRequestBody` SHALL NOT devolver `{ type: "continuation" }`

### Requirement: Cierre de workflows wire en stop terminal SSE

Cuando `enrichOpenWireStepWithResponse` o `closeWireWorkflowOnTerminalStop` procesan un step con `stopReason` terminal (`end_turn`, `max_tokens`, o ausente tras stream completo), el correlador SHALL invocar `closeStep` y SHALL NOT emitir `workflow_complete` para workflows con `closeAuthority: 'stop-hook'` (turnos E2E —primero `workflowId === sessionId` y posteriores `${sessionId}-turn-N`— y sub-workflows `kind: subagent`).

El cierre del workflow E2E SHALL permanecer exclusivamente vía hook (`Stop`, `SubagentStop`, `StopFailure`).

Workflows con `closeAuthority: 'sse'` (wire huérfanos de continuation, `workflowId !== sessionId`, `kind: main`) SHALL cerrarse por SSE terminal vía `forceClose`, con sus steps ya cerrados por `closeStep` (nunca un cierre de 0 steps).

Cuando `enrichOpenWireStepWithResponse` procesa un step con `stopReason === 'tool_use'`, el correlador SHALL asignar `closedAt` al step y SHALL invocar `closeStep` antes de retornar, de modo que cada hop HTTP completo cuente para `stepCount`.

Cuando `registerWireStepInCorrelator` cae en la rama fallback (no hay step abierto y registra un step nuevo), SHALL aplicar la misma regla de cierre para `stopReason === 'tool_use'`: asignar `closedAt` e invocar `closeStep` antes de retornar.

#### Scenario: end_turn cierra step sin workflow_complete en turno

- **GIVEN** un workflow de turno `workflowId === sessionId` (`closeAuthority: 'stop-hook'`) con step agentic abierto
- **WHEN** llega una respuesta SSE con `stopReason: end_turn`
- **THEN** el step SHALL cerrarse con `closedAt` definido
- **AND** el correlador SHALL NOT emitir `workflow_complete` para el workflow de turno
- **AND** el workflow SHALL permanecer `running` hasta hook `Stop`

#### Scenario: end_turn no cierra workflow turn-N (closeAuthority stop-hook)

- **GIVEN** un workflow `turn-N` (`workflowId === \`${sessionId}-turn-2\``, `closeAuthority: 'stop-hook'`) con step agentic abierto
- **WHEN** llega una respuesta SSE con `stopReason: end_turn`
- **THEN** el step SHALL cerrarse con `closedAt` definido
- **AND** el correlador SHALL NOT emitir `workflow_complete` para el workflow `turn-N`
- **AND** el workflow SHALL permanecer `running` hasta hook `Stop`

#### Scenario: huérfano end_turn cierra vía forceClose (closeAuthority sse)

- **GIVEN** un workflow wire huérfano (`workflowId !== sessionId`, `kind: main`, `closeAuthority: 'sse'`) con step ya cerrado
- **WHEN** llega una respuesta SSE con `stopReason: end_turn`
- **THEN** `closeWireWorkflowOnTerminalStop` SHALL invocar `forceClose` con `stepCount >= 1`
- **AND** el correlador SHALL emitir `workflow_complete` para el workflow huérfano

#### Scenario: Sub-workflow end_turn no cierra sub-workflow

- **GIVEN** un sub-workflow `kind: subagent` con step abierto
- **WHEN** la respuesta SSE tiene `stopReason: end_turn`
- **THEN** el step SHALL cerrarse
- **AND** el sub-workflow SHALL permanecer `running` hasta hook `SubagentStop`

#### Scenario: Workflow de turno con tool_use NO cierra el workflow

- **GIVEN** un workflow de turno o sub-workflow en ciclo agentic
- **WHEN** la respuesta SSE tiene `stopReason: tool_use`
- **THEN** el correlador SHALL NOT emitir `workflow_complete` para ese workflow
- **AND** el workflow SHALL permanecer `running` hasta el hook de ciclo correspondiente

#### Scenario: Multi-hop agentic con tool_use reporta stepCount en cierre por hook

- **GIVEN** un workflow de turno con 3 hops HTTP cerrados con `tool_use` y un hop terminal con `end_turn`
- **WHEN** el hook `Stop` cierra el workflow vía `buildWorkflowResult`
- **THEN** `result.stepCount` SHALL ser `4`
- **AND** SHALL igualar el número de directorios `steps/` materializados por `step_request`

#### Scenario: Hop tool_use cierra step en correlador

- **GIVEN** un step abierto por `registerWireStepRequest`
- **WHEN** `enrichOpenWireStepWithResponse` recibe `stopReason: 'tool_use'`
- **THEN** el step SHALL tener `closedAt` definido
- **AND** `closeStep` SHALL haberse invocado para ese step

#### Scenario: Fallback registerWireStepInCorrelator cierra step en tool_use

- **GIVEN** un workflow wire sin step abierto (edge case: ingress no registró step previo)
- **WHEN** `registerWireStepInCorrelator` registra un step nuevo con `stopReason: 'tool_use'`
- **THEN** el step registrado SHALL tener `closedAt` definido
- **AND** `closeStep` SHALL haberse invocado para ese step
- **AND** el comportamiento SHALL ser equivalente al de `enrichOpenWireStepWithResponse` en el camino feliz

### Requirement: completeToolUse idempotente

`WorkflowRepositoryService.completeToolUse` SHALL ser idempotente: si el `IToolUse` objetivo ya tiene `status` `completed` o `error`, el método SHALL retornar sin mutar estado ni emitir un segundo evento `tool_result` al EventBus.

#### Scenario: Segunda completación no duplica tool_result

- **GIVEN** un tool T1 ya completado vía continuation HTTP (`status: completed`, `completionAuthority: continuation`)
- **WHEN** `completeToolUse` se invoca de nuevo para T1 (p. ej. reintento o hook tardío)
- **THEN** NO SHALL emitirse un segundo evento `tool_result` para T1
- **AND** `events.ndjson` SHALL contener exactamente un `tool_result` por `tool_call` de T1

#### Scenario: Primera completación emite tool_result

- **GIVEN** un tool T1 registrado con `status: running`
- **WHEN** `completeToolUse` se invoca una vez
- **THEN** SHALL emitirse exactamente un evento `tool_result`
- **AND** `status` SHALL pasar a `completed` o `error`

### Requirement: StepAssembler ensambla bloques text

`StepAssemblerService` SHALL acumular bloques `content_block` de tipo `text` mediante eventos `text_delta` y SHALL incluirlos en `assistantMessage.content` junto a `thinking` y `tool_use`.

#### Scenario: SSE con text_delta produce bloque text en la raíz de body.json (before-change)

- **GIVEN** un stream SSE con `content_block_start` type `text` y deltas `text_delta`
- **WHEN** `AuditSseResponseHandler` finaliza el stream y publica `step_response`
- **THEN** `response/body.json` SHALL contener al menos un bloque `{ type: 'text', text: '...' }` en la raíz del payload, sin envelope (el publish usa `assembled.assistantMessage` con shape `{role, content}` directamente)

#### Scenario: SSE con text_delta produce bloque text en el content[] del envelope (after-change)

- **GIVEN** un stream SSE con `content_block_start` type `text` y deltas `text_delta`
- **WHEN** `AuditSseResponseHandler` finaliza el stream y publica `step_response` con el envelope Message Anthropic completo (`{id, type: 'message', role: 'assistant', model, content, stop_reason, stop_sequence: null, usage}`)
- **THEN** `response/body.json` SHALL contener al menos un bloque `{ type: 'text', text: '...' }` dentro del array `content[]` del envelope

### Requirement: Continuation completa tools client-side desde tool_result en body

Cuando `handleContinuation` procesa un request con bloques `tool_result` en el último mensaje user, el correlador SHALL invocar `completeToolUse` para cada `tool_use_id` registrado previamente vía `registerToolUse` (o vía `registerPendingToolUse` con `completionAuthority: continuation`) que permanezca en `status: running`, **antes** de registrar el step de continuación. Esta es la **vía canónica** de completación para tools client-side; no es un fallback opcional.

#### Scenario: Continuation con Bash registrado completa tool aunque PostToolUse haya llegado

- **GIVEN** un workflow wire con tool client-side `running` registrado por SSE (`registerToolUse`, `completionAuthority: continuation`)
- **AND** un hook `PostToolUse` llegó al proxy pero NO completó el tool (autoridad `continuation`)
- **WHEN** llega una continuation HTTP cuyo último mensaje contiene `{ type: 'tool_result', tool_use_id, content }`
- **THEN** el correlador SHALL invocar `completeToolUse` con el contenido del bloque
- **AND** SHALL emitirse evento `tool_result` en el EventBus
- **AND** `SessionPersistence` SHALL escribir `tools/KK-slug/result.json` con el contenido canónico

### Requirement: Hops HTTP como steps del turno activo

Cuando existe un workflow de turno abierto (`status: running`, `id === sessionId`), `AuditWorkflowHandler` SHALL registrar hops HTTP como steps bajo ese workflow:

| Clasificación | Comportamiento |
|---------------|----------------|
| `side-request` | Nuevo step con `stepKind: side-request`. Cierra el step en respuesta terminal. NO abre workflow hermano. |
| `fresh` | Nuevo step con `stepKind: agentic`. Si es el primer hop agentic del turno, materializa `request/body.json` del workflow. |
| `continuation` | Nuevo step bajo el mismo workflow padre (correlación por `toolUseId` sin cambio de principio). |

Si no hay turno abierto, el primer `side-request` o `fresh` SHALL abrir el turno (lazy open) antes de registrar el step.

`handleSideRequest` y `handleFresh` SHALL NOT invocar `openWireWorkflow(..., forceNew: true)` para crear workflows hermanos.

#### Scenario: Side-request como step del turno

- **GIVEN** un turno abierto con `id === sessionId`
- **WHEN** llega una petición clasificada `side-request`
- **THEN** SHALL registrarse un step con `stepKind: side-request` bajo el turno
- **AND** NO SHALL emitirse `workflow_start` para un workflow hermano adicional

#### Scenario: Fresh agentic como step del turno

- **GIVEN** un turno abierto
- **WHEN** llega una petición clasificada `fresh` con `tools` no vacío
- **THEN** SHALL registrarse un step con `stepKind: agentic`
- **AND** si es el primer hop agentic, SHALL escribirse `workflows/NN/request/body.json`

#### Scenario: Lazy open en side-request pre-UserPromptSubmit

- **GIVEN** no hay turno abierto para `sessionId` S
- **WHEN** llega un `side-request` (p. ej. session naming)
- **THEN** SHALL abrirse un workflow de turno con `interactionType: agentic`
- **AND** el side-request SHALL registrarse como `steps/01/` con `stepKind: side-request`

### Requirement: Preflights sin proyección causal

Las clasificaciones `preflight-quota` y `preflight-warmup` SHALL NOT abrir workflow, step ni escribir bajo `sessions/`. Tras clasificar, `AuditWorkflowHandler.execute()` SHALL retornar `null`.

El proxy SHALL continuar el reenvío upstream a Anthropic con normalidad (mismo patrón que `sessionId === '_unknown'`).

#### Scenario: Preflight quota sin auditoría

- **WHEN** `AuditWorkflowHandler` clasifica una petición como `preflight-quota`
- **THEN** `execute()` SHALL retornar `null`
- **AND** NO SHALL emitirse `workflow_start` ni `step_request`
- **AND** el orquestador del proxy SHALL reenviar la petición upstream

#### Scenario: Preflight no consume layoutIndex

- **GIVEN** una sesión nueva sin turnos previos
- **WHEN** llegan preflights antes del primer `UserPromptSubmit`
- **THEN** el primer turno de usuario SHALL materializarse en `workflows/01/`
- **AND** los preflights SHALL NOT crear `workflows/00/` ni ninguna carpeta en `sessions/`

### Requirement: Serialización de mutaciones HTTP por sesión

Toda mutación del correlador disparada desde `AuditWorkflowHandler` (apertura de step, registro de request, side-request, fresh, continuation, internal tools) SHALL ejecutarse bajo `workflowRepo.withSessionLock(sessionId)`.

#### Scenario: Side-request y fresh concurrentes serializados

- **GIVEN** un turno abierto y dos peticiones HTTP concurrentes (side-request + fresh) para el mismo `sessionId`
- **WHEN** `AuditWorkflowHandler` procesa ambas
- **THEN** la asignación de `IStep.index` SHALL ser secuencial sin duplicados
- **AND** los índices SHALL ser base 1 (`01`, `02`, …)

### Requirement: stepKind en evento step_request

El evento `step_request` emitido por handlers L3 SHALL incluir `stepKind` (`agentic` | `side-request`) en su payload para proyección a disco.

#### Scenario: step_request transporta stepKind side-request

- **WHEN** `handleSideRequest` emite `step_request`
- **THEN** el payload SHALL incluir `stepKind: 'side-request'`

### Requirement: Proyección de respuesta estándar sin usage

`AuditStandardResponseHandler` SHALL proyectar respuestas HTTP estándar (no-SSE) al step cuyo índice es `context.assignedStepIndex` cuando el body acumulado sea JSON válido, **independientemente** de que el objeto parseado incluya campo `usage`.

En respuestas sin `usage`, el handler SHALL:

- enriquecer el step abierto en el índice asignado (con fallback heurístico solo si el índice no encuentra step abierto);
- publicar `step_response` con `payload.stepIndex` igual a `context.assignedStepIndex` y `payload.response` igual al body parseado;
- cerrar el step en el correlador (respuesta terminal cuando `stop_reason` es terminal, ausente o vacío);
- **NO** invocar `persistBillableStepMetricsIfNeeded` ni incrementar contadores/tokens en `session-metrics.json`.

Si el body no es JSON válido (p. ej. buffer truncado por `MAX_RESPONSE_BUFFER_BYTES`), el handler SHALL NOT publicar `step_response` (comportamiento sin cambio respecto al límite de buffer).

#### Scenario: count_tokens side-request cierra step con step_response

- **GIVEN** un turno abierto con un step `side-request` registrado en índice 5 vía `step_request`
- **AND** `AuditWorkflowContext.assignedStepIndex` es 5
- **WHEN** `AuditStandardResponseHandler` procesa una respuesta HTTP 200 cuyo body es `{"input_tokens": 42444}` (sin campo `usage`)
- **THEN** SHALL publicarse `step_response` con `payload.stepIndex` 5
- **AND** `payload.response` SHALL contener el objeto parseado con `input_tokens`
- **AND** el step 5 SHALL quedar cerrado en el correlador (`closedAt` definido)
- **AND** `SessionPersistence` SHALL poder escribir `workflows/MM/steps/05/response/body.json`

#### Scenario: Respuesta estándar con stop_reason pero sin usage proyecta auditoría

- **GIVEN** un step abierto en índice 1 con `assignedStepIndex` 1
- **WHEN** el body de respuesta es JSON válido `{"id":"msg_1","stop_reason":"end_turn"}` sin campo `usage`
- **THEN** SHALL publicarse `step_response` para índice 1
- **AND** el step SHALL cerrarse en el correlador

#### Scenario: Respuesta sin usage no incrementa métricas per-step

- **GIVEN** un workflow `kind: main` y un step abierto enriquecido sin `usage`
- **WHEN** `AuditStandardResponseHandler` completa el procesamiento de una respuesta sin campo `usage`
- **THEN** `persistBillableStepMetricsIfNeeded` SHALL NOT invocar `SessionMetricsService.updateFromStep` para ese hop
- **AND** `session-metrics-applied.json` SHALL NOT registrar el `step.id` de ese hop como aplicado por métricas

#### Scenario: Body JSON inválido no emite step_response

- **GIVEN** el buffer acumulado supera `MAX_RESPONSE_BUFFER_BYTES` y el contenido restante no es JSON válido
- **WHEN** `AuditStandardResponseHandler` finaliza el stream
- **THEN** NO SHALL publicarse `step_response`
- **AND** NO SHALL enriquecerse el step en el correlador

#### Scenario: count_tokens concurrente con hop agentic no cruza índices

- **GIVEN** steps 5 (`side-request` count_tokens) y 6 (`agentic`) abiertos en el mismo workflow
- **WHEN** la respuesta estándar de count_tokens llega con `assignedStepIndex` 5
- **AND** la respuesta SSE del hop agentic llega con `assignedStepIndex` 6
- **THEN** `step_response` del hop 5 SHALL usar `stepIndex` 5 únicamente
- **AND** `step_response` del hop 6 SHALL usar `stepIndex` 6 únicamente
- **AND** NO SHALL omitirse `step_response` para índice 5 por ausencia de `usage`

### Requirement: Proyección de envelope completo en response/body.json para steps SSE

Al finalizar un stream SSE, `AuditSseResponseHandler` SHALL publicar en `payload.response` del evento `step_response` un envelope Message Anthropic completo construido desde `AssembledInference`:

```json
{
  "id": "<anthropicMessageId>",
  "type": "message",
  "role": "assistant",
  "model": "<model>",
  "content": [...],
  "stop_reason": "<stopReason>",
  "stop_sequence": null,
  "usage": { ... }
}
```

`response/body.json` SHALL reflejar ese envelope (proyección directa de `SessionPersistence.onStepResponse`, sin re-derivación). El shape SHALL ser homólogo al que el path estándar (no-SSE) proyecta para el mismo tipo de respuesta (`Requirement: Proyección de respuesta estándar sin usage`): un consumidor forense SHALL poder leer `stop_reason`, `usage`, `model` e `id` de cualquier `body.json` sin distinguir el transporte del hop.

#### Scenario: Step SSE con end_turn proyecta envelope completo

- **GIVEN** un stream SSE que finaliza con `stop_reason: 'end_turn'` y `usage` ensamblado
- **WHEN** `AuditSseResponseHandler` publica `step_response` y `SessionPersistence` proyecta el step
- **THEN** `response/body.json` SHALL contener `stop_reason`, `usage`, `model` e `id`
- **AND** `content` SHALL contener los bloques ensamblados del mensaje assistant

#### Scenario: Step SSE con tool_use proyecta el mismo envelope

- **GIVEN** un stream SSE que finaliza con `stop_reason: 'tool_use'`
- **WHEN** el handler publica `step_response`
- **THEN** `payload.response` SHALL tener el mismo shape de envelope con `stop_reason: 'tool_use'`
- **AND** `usage` SHALL estar presente con los tokens del hop

#### Scenario: Paridad de shape entre path SSE y path estándar

- **GIVEN** un step SSE y un step estándar (no-SSE) proyectados en la misma sesión
- **WHEN** se comparan sus `response/body.json`
- **THEN** ambos SHALL exponer los campos de envelope `id`, `model`, `stop_reason` y `usage` al mismo nivel raíz
- **AND** NO SHALL existir un shape `{role, content}` sin envelope para steps SSE

