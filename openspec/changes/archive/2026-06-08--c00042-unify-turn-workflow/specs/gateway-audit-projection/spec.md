## MODIFIED Requirements

### Requirement: AuditWorkflowContext — contexto de handlers L3

La interfaz que desacopla los handlers L3 de Fastify SHALL llamarse `AuditWorkflowContext`
(renombrada desde `AuditInteractionContext`). Sus campos SHALL ser:

- `auditWorkflowDir` (renombrado desde `auditInteractionDir`): ruta al directorio `workflows/NN/` (índice base 1)
- `workflowKind` (renombrado desde `interactionType`): tipo `WorkflowRequestKind` (`'agentic' | 'side-request'` para hops auditados)
- `workflowId`: identificador obligatorio del workflow específico abierto para esta request; los handlers de respuesta usan este campo para resolver el workflow destino de eventos y mutaciones

Los augments de Fastify (`fastify.augments.d.ts`) SHALL usar los nombres canónicos
`request.auditWorkflowDir` y `request.workflowKind`.

Referencia técnica: [§23 gateway-architecture.md](../../../../docs/gateway-architecture.md#23-integración-correlador--bus-de-eventos--persistencia).

#### Scenario: AuditWorkflowHandler usa AuditWorkflowContext

- **GIVEN** `AuditWorkflowHandler` y `AuditSseResponseHandler` activos
- **WHEN** se construye `AuditWorkflowContext` en `ProxyController`
- **THEN** los campos `auditWorkflowDir` y `workflowKind` SHALL estar presentes
- **AND** el tipo SHALL estar importado desde `audit.types.ts` (no desde `types/gateway/`)

### Requirement: Cierre de workflows wire en stop terminal SSE

Cuando `enrichOpenWireStepWithResponse` o `closeWireWorkflowOnTerminalStop` procesan un step con `stopReason` terminal (`end_turn`, `max_tokens`, o ausente tras stream completo), el correlador SHALL invocar `closeStep` y SHALL NOT emitir `workflow_complete` para workflows E2E de ciclo completo (workflow de turno con `workflowId === sessionId` y sub-workflows con `kind: subagent`).

El cierre del workflow E2E SHALL permanecer exclusivamente vía hook (`Stop`, `SubagentStop`, `StopFailure`).

Cuando `enrichOpenWireStepWithResponse` procesa un step con `stopReason === 'tool_use'`, el correlador SHALL asignar `closedAt` al step y SHALL invocar `closeStep` antes de retornar, de modo que cada hop HTTP completo cuente para `stepCount`.

#### Scenario: end_turn cierra step sin workflow_complete en turno

- **GIVEN** un workflow de turno `workflowId === sessionId` con step agentic abierto
- **WHEN** llega una respuesta SSE con `stopReason: end_turn`
- **THEN** el step SHALL cerrarse con `closedAt` definido
- **AND** el correlador SHALL NOT emitir `workflow_complete` para el workflow de turno
- **AND** el workflow SHALL permanecer `running` hasta hook `Stop`

#### Scenario: Sub-workflow end_turn no cierra sub-workflow

- **GIVEN** un sub-workflow `kind: subagent` con step abierto
- **WHEN** la respuesta SSE tiene `stopReason: end_turn`
- **THEN** el step SHALL cerrarse
- **AND** el sub-workflow SHALL permanecer `running` hasta hook `SubagentStop`

#### Scenario: Workflow wire con tool_use NO cierra el workflow

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

## REMOVED Requirements

### Requirement: Cierre de workflows wire en stop terminal SSE (comportamiento legacy)

**Reason**: El requisito anterior emitía `workflow_complete` en `end_turn` para workflows wire (`workflowId !== sessionId`). Tras la fusión, el turno usa `workflowId === sessionId` y el cierre E2E es por hook.

**Migration**: Consumidores que esperaban `workflow_complete` en SSE `end_turn` deben escuchar el hook `Stop` / evento `workflow_complete` del cierre por hook.

## ADDED Requirements

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
