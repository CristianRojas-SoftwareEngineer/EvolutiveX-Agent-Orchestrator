## ADDED Requirements

### Requirement: Parsing puro de cabeceras de agente

El sistema SHALL exponer una función pura `resolveAgentContext(headers)` en
`src/1-domain/services/resolve-agent-context.service.ts` que lea las cabeceras HTTP
`X-Claude-Code-Agent-Id` y `X-Claude-Code-Parent-Agent-Id` de forma case-insensitive y devuelva
`{ agentId?: string, parentAgentId?: string, isSubagentRequest: boolean }` sin realizar ninguna
operación de I/O.

#### Scenario: Cabeceras presentes — request de subagente

- **GIVEN** una request HTTP con cabecera `X-Claude-Code-Agent-Id: agent-abc` y
  `X-Claude-Code-Parent-Agent-Id: agent-root`
- **WHEN** se invoca `resolveAgentContext(headers)`
- **THEN** el resultado SHALL ser `{ agentId: 'agent-abc', parentAgentId: 'agent-root', isSubagentRequest: true }`

#### Scenario: Solo `Agent-Id` presente (agente raíz)

- **GIVEN** una request HTTP con cabecera `X-Claude-Code-Agent-Id: agent-root` y sin
  `X-Claude-Code-Parent-Agent-Id`
- **WHEN** se invoca `resolveAgentContext(headers)`
- **THEN** `isSubagentRequest` SHALL ser `false`
- **AND** `agentId` SHALL ser `'agent-root'`
- **AND** `parentAgentId` SHALL ser `undefined`

#### Scenario: Sin cabeceras de agente (cliente legacy)

- **GIVEN** una request HTTP sin `X-Claude-Code-Agent-Id` ni `X-Claude-Code-Parent-Agent-Id`
- **WHEN** se invoca `resolveAgentContext(headers)`
- **THEN** el resultado SHALL ser `{ agentId: undefined, parentAgentId: undefined, isSubagentRequest: false }`

#### Scenario: Cabeceras en mayúsculas mixtas

- **GIVEN** una request HTTP con cabecera `x-claude-code-agent-id: agent-xyz` (minúsculas)
- **WHEN** se invoca `resolveAgentContext(headers)`
- **THEN** `agentId` SHALL ser `'agent-xyz'` (case-insensitive lookup, mismo resultado que en
  mayúsculas canónicas)

---

### Requirement: Precedencia de correlación por cabeceras sobre heurística

El `AuditInteractionHandler` SHALL priorizar la rama de correlación por cabeceras cuando la request trae `X-Claude-Code-Parent-Agent-Id`: en ese caso SHALL invocar `openSubagentFromWire` en el `IWorkflowRepository` antes de intentar la ruta heurística (`resolvePendingByPrompt` / `unique-pending`). La ruta heurística SHALL ejecutarse únicamente cuando `isSubagentRequest` sea `false`.

#### Scenario: Request fresh con cabeceras — usa ruta de headers

- **GIVEN** una sesión activa con un pending `PendingAgentToolUse` en el padre
- **AND** la request entrante tiene `X-Claude-Code-Parent-Agent-Id: agent-parent`
- **WHEN** el `AuditInteractionHandler` procesa la request
- **THEN** SHALL llamarse `openSubagentFromWire(sessionId, agentCtx)` en el repo
- **AND** el `correlationMethod` resultante SHALL ser `'agent-headers'`
- **AND** la función `resolvePendingByPrompt` NO SHALL invocarse para esta request

#### Scenario: Request fresh sin cabeceras — usa fallback heurístico

- **GIVEN** una sesión activa con un pending `PendingAgentToolUse` en el padre
- **AND** la request entrante NO tiene `X-Claude-Code-Agent-Id` ni `X-Claude-Code-Parent-Agent-Id`
- **WHEN** el `AuditInteractionHandler` procesa la request
- **THEN** SHALL ejecutarse la ruta heurística actual (`resolvePendingByPrompt` / `unique-pending`)
- **AND** `openSubagentFromWire` NO SHALL invocarse

---

### Requirement: Valor `'agent-headers'` en CorrelationMethod

El tipo `CorrelationMethod` SHALL incluir el valor `'agent-headers'` para identificar las
correlaciones resueltas mediante las cabeceras de Claude Code. Este valor SHALL tener mayor
autoridad que `'prompt'`, `'unique-pending'` y `'fifo-pending'` conforme a la jerarquía de planos
de señal de [§21](../../../../docs/proposals/gateway-design.md#21-reglas-de-autoridad-por-concern).

#### Scenario: Correlación por cabeceras registrada en metadata

- **GIVEN** una interacción de subagente correlacionada por cabeceras
- **WHEN** se escribe `meta.json` de la interacción al cerrarse
- **THEN** `parentContext.correlationMethod` en `meta.json` SHALL ser `'agent-headers'`
- **AND** `parentContext.correlationStatus` SHALL ser `'resolved'`
- **AND** `parentContext.wireAgentId` SHALL contener el valor de `X-Claude-Code-Agent-Id`
- **AND** `parentContext.wireParentAgentId` SHALL contener el valor de `X-Claude-Code-Parent-Agent-Id`

---

### Requirement: Conservación del fallback heurístico

La ruta heurística de correlación (`resolvePendingByPrompt`, `unique-pending`) SHALL conservarse operativa cuando la request no trae cabeceras de agente, garantizando compatibilidad con clientes Claude Code < 2.1.139 u otros harnesses. La implementación SHALL señalar esta ruta con un comentario `@deprecated-fallback` que indique la fase de retirada planificada (G2) y la fecha estimada.

#### Scenario: Cliente legacy sin cabeceras — correlación heurística operativa

- **GIVEN** una request `fresh` sin cabeceras de agente y un único `PendingAgentToolUse` en el padre
- **WHEN** el `AuditInteractionHandler` intenta correlacionar
- **THEN** `correlationMethod` SHALL ser `'unique-pending'`
- **AND** el subagente SHALL abrirse correctamente como en el comportamiento preexistente
- **AND** no SHALL lanzarse ningún error relacionado con cabeceras ausentes

---

### Requirement: Índice mínimo en IWorkflowRepository

La interface `IWorkflowRepository` mínima SHALL exponer al menos los métodos
`openSubagentFromWire(sessionId, agentCtx)` para abrir un subagente a partir del contexto de
cabeceras, y `getWorkflowByAgentId(agentId)` para resolver el contexto de un agente registrado
por `agentId`. El adapter en memoria SHALL implementar ambos métodos.

#### Scenario: Apertura de subagente por wire y recuperación posterior

- **GIVEN** un `WorkflowRepository` en memoria vacío
- **WHEN** se invoca `openSubagentFromWire('session-1', { agentId: 'agent-child', parentAgentId: 'agent-root', isSubagentRequest: true })`
- **THEN** el repo SHALL registrar la entrada indexada por `agentId`
- **AND** una llamada posterior a `getWorkflowByAgentId('agent-child')` SHALL devolver la entrada
  registrada
- **AND** `getWorkflowByAgentId('agent-unknown')` SHALL devolver `undefined`
