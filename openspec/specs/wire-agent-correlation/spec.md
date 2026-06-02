# wire-agent-correlation Specification

## Purpose

Correlación determinista de subagentes mediante las cabeceras `X-Claude-Code-Agent-Id` y
`X-Claude-Code-Parent-Agent-Id` emitidas por Claude Code ≥ 2.1.139 (plano A, §22). Introduce
`resolveAgentContext()`, `IWorkflowRepository` mínima y `correlationMethod: 'agent-headers'` con
mayor autoridad que la heurística preexistente. La ruta heurística se conserva como fallback
documentado para clientes sin cabeceras (retirada planificada en G2).

## Requirements

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

El `AuditInteractionHandler` SHALL priorizar la rama de correlación por cabeceras cuando la request trae `X-Claude-Code-Parent-Agent-Id`: en ese caso SHALL invocar `openSubagentFromWire` en el `IWorkflowRepository` y luego llamar a `joinToolUseToSubagent` para resolver el `triggeringToolUseId` frente a **cualquier número** de pendings (único, múltiple o ninguno). Con N pendings y cabeceras, el `triggeringToolUseId` SHALL resolverse según la tabla §23 (prompt-match → FIFO) manteniendo `correlationMethod: 'agent-headers'`. La ruta heurística legacy SHALL ejecutarse únicamente cuando `isSubagentRequest` sea `false`.

#### Scenario: Request fresh con cabeceras y pending único — usa ruta de headers

- **GIVEN** una sesión activa con exactamente un `PendingAgentToolUse` en el padre
- **AND** la request entrante tiene `X-Claude-Code-Parent-Agent-Id: agent-parent`
- **WHEN** el `AuditInteractionHandler` procesa la request
- **THEN** SHALL llamarse `openSubagentFromWire(sessionId, agentCtx)` en el repo
- **AND** el `correlationMethod` resultante SHALL ser `'agent-headers'`
- **AND** `triggeringToolUseId` SHALL ser el `tool_use_id` del único pending
- **AND** la función `resolvePendingByPrompt` NO SHALL invocarse para esta request

#### Scenario: Request fresh con cabeceras y N pendings — resuelve por prompt-match

- **GIVEN** una sesión activa con 2 `PendingAgentToolUse` en el padre, cuyos prompts difieren
- **AND** la request entrante tiene `X-Claude-Code-Parent-Agent-Id: agent-parent`
- **AND** el primer mensaje de la request coincide en prompt con uno de los pendings
- **WHEN** el `AuditInteractionHandler` procesa la request
- **THEN** SHALL llamarse `openSubagentFromWire(sessionId, agentCtx)` en el repo
- **AND** el `correlationMethod` resultante SHALL ser `'agent-headers'`
- **AND** `triggeringToolUseId` SHALL ser el `tool_use_id` del pending cuyo prompt coincide

#### Scenario: Request fresh sin cabeceras — usa fallback heurístico

- **GIVEN** una sesión activa con un pending `PendingAgentToolUse` en el padre
- **AND** la request entrante NO tiene `X-Claude-Code-Agent-Id` ni `X-Claude-Code-Parent-Agent-Id`
- **WHEN** el `AuditInteractionHandler` procesa la request
- **THEN** SHALL ejecutarse la ruta heurística a través de `joinToolUseToSubagent` (rama sin-cabeceras)
- **AND** `openSubagentFromWire` NO SHALL invocarse

---

### Requirement: Valor `'agent-headers'` en CorrelationMethod

El tipo `CorrelationMethod` SHALL incluir los valores `'agent-headers'`, `'prompt'`, `'unique-pending'`, `'fifo-pending'` y `'none'` con la siguiente jerarquía de autoridad descendiente conforme a [§15](../../../docs/gateway-architecture.md#15-reglas-de-autoridad-por-concern):
1. `'agent-headers'` — señal estructural de plano A; máxima autoridad.
2. `'prompt'` — señal contextual (match de prompt); segunda autoridad.
3. `'unique-pending'` — señal estructural (pending único); tercera autoridad.
4. `'fifo-pending'` — señal posicional (primer pending registrado); último recurso determinista.
5. `'none'` — sin correlación; estado de fallo.

#### Scenario: Correlación por cabeceras registrada en metadata

- **GIVEN** una interacción de subagente correlacionada por cabeceras
- **WHEN** se escribe `meta.json` de la interacción al cerrarse
- **THEN** `parentContext.correlationMethod` en `meta.json` SHALL ser `'agent-headers'`
- **AND** `parentContext.correlationStatus` SHALL ser `'resolved'`
- **AND** `parentContext.wireAgentId` SHALL contener el valor de `X-Claude-Code-Agent-Id`
- **AND** `parentContext.wireParentAgentId` SHALL contener el valor de `X-Claude-Code-Parent-Agent-Id`

#### Scenario: Correlación FIFO registrada en metadata

- **GIVEN** una interacción de subagente sin cabeceras y con N pendings sin match de prompt
- **WHEN** se escribe `meta.json` de la interacción al cerrarse
- **THEN** `parentContext.correlationMethod` en `meta.json` SHALL ser `'fifo-pending'`
- **AND** `parentContext.correlationStatus` SHALL ser `'resolved'`
- **AND** `parentContext.triggeringToolUseId` SHALL ser el `tool_use_id` del primer pending registrado

---

### Requirement: Conservación del fallback heurístico

La ruta heurística de correlación (rama sin-cabeceras de `joinToolUseToSubagent`: `unique-pending`, `prompt`, `fifo-pending`) SHALL conservarse operativa cuando la request no trae cabeceras de agente, garantizando compatibilidad con clientes Claude Code < 2.1.139 u otros harnesses. La implementación SHALL señalar esta ruta con un comentario `@deprecated-fallback` que indique la fase de retirada planificada (G2) y la fecha estimada.

#### Scenario: Cliente legacy sin cabeceras — correlación heurística operativa

- **GIVEN** una request `fresh` sin cabeceras de agente y un único `PendingAgentToolUse` en el padre
- **WHEN** el `AuditInteractionHandler` intenta correlacionar
- **THEN** `correlationMethod` SHALL ser `'unique-pending'`
- **AND** el subagente SHALL abrirse correctamente como en el comportamiento preexistente
- **AND** no SHALL lanzarse ningún error relacionado con cabeceras ausentes

---

### Requirement: Join determinista tool_use_id↔subagente (plano B)

El sistema SHALL exponer una función pura `joinToolUseToSubagent(pendings, agentCtx, subagentPrompt)` en `src/1-domain/services/join-tool-use-to-subagent.service.ts` que aplique la siguiente tabla de política de join sin realizar ninguna operación de I/O:

| Condición | `toolUseId` | `correlationMethod` | `correlationStatus` |
|-----------|-------------|---------------------|---------------------|
| Con cabeceras, 1 pending | `tool_use_id` del único pending | `'agent-headers'` | `'resolved'` |
| Con cabeceras, N pendings + prompt match | `tool_use_id` del pending con match | `'agent-headers'` | `'resolved'` |
| Con cabeceras, N pendings sin match | `tool_use_id` del primer pending (FIFO) | `'agent-headers'` | `'resolved'` |
| Con cabeceras, 0 pendings | `null` | `'agent-headers'` | `'resolved'` |
| Sin cabeceras, 1 pending | `tool_use_id` del único pending | `'unique-pending'` | `'resolved'` |
| Sin cabeceras, N pendings + prompt match | `tool_use_id` del pending con match | `'prompt'` | `'resolved'` |
| Sin cabeceras, N pendings sin match | `tool_use_id` del primer pending (FIFO) | `'fifo-pending'` | `'resolved'` |
| Sin cabeceras, 0 pendings | `null` | `'none'` | `'unresolved'` |

#### Scenario: 1 pending con cabeceras — resuelve por unique con autoridad agent-headers

- **GIVEN** un array de 1 `PendingAgentToolUse` con `tool_use_id: 'tu-abc'`
- **AND** un `AgentContext` con `isSubagentRequest: true`
- **AND** `subagentPrompt` cualquiera
- **WHEN** se invoca `joinToolUseToSubagent(pendings, agentCtx, subagentPrompt)`
- **THEN** el resultado SHALL ser `{ toolUseId: 'tu-abc', correlationMethod: 'agent-headers', correlationStatus: 'resolved' }`

#### Scenario: N pendings con cabeceras y prompt match — resuelve el pending correcto

- **GIVEN** un array de 2 `PendingAgentToolUse`, el segundo con `tool_use_id: 'tu-xyz'` y prompt `'Busca datos'`
- **AND** un `AgentContext` con `isSubagentRequest: true`
- **AND** `subagentPrompt: 'Busca datos'`
- **WHEN** se invoca `joinToolUseToSubagent(pendings, agentCtx, subagentPrompt)`
- **THEN** el resultado SHALL ser `{ toolUseId: 'tu-xyz', correlationMethod: 'agent-headers', correlationStatus: 'resolved' }`

#### Scenario: N pendings sin cabeceras y sin prompt match — resuelve por FIFO

- **GIVEN** un array de 2 `PendingAgentToolUse`, el primero con `tool_use_id: 'tu-first'`
- **AND** `agentCtx: undefined`
- **AND** `subagentPrompt` que no coincide con el prompt de ningún pending
- **WHEN** se invoca `joinToolUseToSubagent(pendings, agentCtx, subagentPrompt)`
- **THEN** el resultado SHALL ser `{ toolUseId: 'tu-first', correlationMethod: 'fifo-pending', correlationStatus: 'resolved' }`

#### Scenario: 0 pendings con cabeceras — toolUseId null, correlación resuelta por identidad de cabeceras

- **GIVEN** un array vacío de `PendingAgentToolUse`
- **AND** un `AgentContext` con `isSubagentRequest: true`
- **AND** `subagentPrompt: null`
- **WHEN** se invoca `joinToolUseToSubagent(pendings, agentCtx, subagentPrompt)`
- **THEN** el resultado SHALL ser `{ toolUseId: null, correlationMethod: 'agent-headers', correlationStatus: 'resolved' }`

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
