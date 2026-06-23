## MODIFIED Requirements

### Requirement: Cierre de workflows wire en stop terminal SSE

**Reason**: El discriminador `workflowId === sessionId` / `kind: subagent` solo distinguía el primer turno y los subagentes; los turnos posteriores (`${sessionId}-turn-N`) caían en la rama de `forceClose` y se cerraban en SSE antes del hook `Stop`. El criterio debe basarse en la autoridad de cierre explícita, no en el esquema de `id`.

**Migration**: La decisión pasa a leer `workflow.closeAuthority`: `'stop-hook'` defiere el cierre al hook (no emite `workflow_complete` en SSE) y `'sse'` cierra vía `forceClose`. El campo se fija en la creación (ver `gateway-workflow-lifecycle`), por lo que el comportamiento del primer turno y de los subagentes no cambia.

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

- **GIVEN** un sub-workflow `kind: subagent` (`closeAuthority: 'stop-hook'`) con step abierto
- **WHEN** la respuesta SSE tiene `stopReason: end_turn`
- **THEN** el step SHALL cerrarse
- **AND** el sub-workflow SHALL permanecer `running` hasta hook `SubagentStop`

#### Scenario: Workflow de turno con tool_use NO cierra el workflow

- **GIVEN** un workflow de turno o sub-workflow en ciclo agentic
- **WHEN** la respuesta SSE tiene `stopReason: tool_use`
- **THEN** el correlador SHALL NOT emitir `workflow_complete` para ese workflow
- **AND** el workflow SHALL permanecer `running` hasta el hook de ciclo correspondiente
