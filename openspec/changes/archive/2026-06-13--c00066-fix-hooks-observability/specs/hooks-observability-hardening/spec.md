## ADDED Requirements

### Requirement: Observabilidad de fallos de correlación en eventos de cierre

El sistema SHALL logear como `warn` (o `error` según severidad) cuando un evento de cierre de ciclo de vida (`Stop`, `SubagentStop`, `StopFailure`) llega al `AuditHookEventHandler` y no se encuentra el workflow correspondiente. Los mensajes SHALL incluir los identificadores relevantes para diagnóstico.

Los niveles de severidad SHALL ser:
- `warn`: `Stop` sin workflow por `sessionId`; `SubagentStop` sin entrada por `agentId`; `StopFailure` sin workflow por `sessionId`
- `error`: `SubagentStop` con `agentId` presente en el índice wire pero ausente en el lifecycle del repositorio (inconsistencia de estado interno)

#### Scenario: `Stop` sin workflow → warn con sessionId

- **WHEN** `AuditHookEventHandler` procesa un evento `Stop` y `getWorkflowBySessionId` devuelve null
- **THEN** el sistema SHALL logear a nivel `warn` con `{ eventName: 'Stop', sessionId }` y el mensaje `'workflow no encontrado — evento ignorado'`
- **AND** el sistema NO SHALL logear a nivel `info` para este caso

#### Scenario: `StopFailure` sin workflow → warn con sessionId

- **WHEN** `AuditHookEventHandler` procesa un evento `StopFailure` y `getWorkflowBySessionId` devuelve null
- **THEN** el sistema SHALL logear a nivel `warn` con `{ eventName: 'StopFailure', sessionId }` y el mensaje `'workflow no encontrado — evento ignorado'`
- **AND** el sistema NO SHALL logear a nivel `info` para este caso

#### Scenario: `SubagentStop` sin entrada por agentId → warn

- **WHEN** `AuditHookEventHandler` procesa un evento `SubagentStop` y `getWorkflowByAgentId` devuelve undefined
- **THEN** el sistema SHALL logear a nivel `warn` con `{ eventName: 'SubagentStop', agentId }` y el mensaje `'sub-workflow no encontrado — evento ignorado'`
- **AND** el sistema NO SHALL logear a nivel `info` para este caso

#### Scenario: `SubagentStop` con inconsistencia wire/lifecycle → error

- **WHEN** `AuditHookEventHandler` procesa un evento `SubagentStop` y `getWorkflowByAgentId` devuelve una entrada, pero `getWorkflow(entry.agentId)` devuelve undefined
- **THEN** el sistema SHALL logear a nivel `error` con `{ eventName: 'SubagentStop', agentId, wfId }` y el mensaje `'sub-workflow en índice wire pero no en lifecycle — evento ignorado'`
- **AND** el sistema NO SHALL logear a nivel `info` para este caso

---

### Requirement: Detección de payloads inválidos en el endpoint `POST /hooks`

El sistema SHALL detectar cuando `parseHookEvent` produce un `ClaudeHookEvent` con `eventName` vacío y logear un `warn` en `HooksController` antes de retornar, sin despachar el evento al handler.

#### Scenario: Payload JSON malformado → warn en controlador, sin despacho al handler

- **WHEN** `POST /hooks` recibe un body que tras `parseHookEvent` resulta en `eventName: ''`
- **THEN** el controlador SHALL logear a nivel `warn` con los primeros 200 caracteres del body recibido
- **AND** el controlador SHALL retornar sin invocar `hookEventHandler.execute`
- **AND** la respuesta HTTP SHALL ser 202 (ya enviada antes del procesamiento)

#### Scenario: Payload JSON válido con eventName → despacho normal sin warn

- **WHEN** `POST /hooks` recibe un body con `hook_event_name` válido y no vacío
- **THEN** el controlador NO SHALL logear warn por payload inválido
- **AND** el controlador SHALL invocar `hookEventHandler.execute` normalmente

---

### Requirement: Exit codes semánticos en el relay `post-hook-event.ts`

El relay SHALL retornar exit code `1` (error no bloqueante según el contrato documentado de Claude Code) cuando falla al contactar el servidor proxy, permitiendo que Claude Code muestre el error en el transcript sin bloquear el flujo del asistente. SHALL retornar `0` solo cuando el servidor responde con un código HTTP exitoso.

#### Scenario: Error de red al contactar el servidor → exit code 1

- **WHEN** `postHookEvent` ejecuta `fetch` y la llamada lanza una excepción (servidor no disponible, ECONNREFUSED, etc.)
- **THEN** el proceso SHALL terminar con exit code `1`
- **AND** el mensaje de error SHALL escribirse a `stderr`

#### Scenario: Respuesta HTTP no-ok del servidor → exit code 1

- **WHEN** `postHookEvent` recibe una respuesta con `res.ok === false` (ej. HTTP 503)
- **THEN** el proceso SHALL terminar con exit code `1`
- **AND** el mensaje `post-hook-event: HTTP <status> <url>` SHALL escribirse a `stderr`

#### Scenario: POST exitoso → exit code 0

- **WHEN** `postHookEvent` recibe una respuesta con `res.ok === true`
- **THEN** el proceso SHALL terminar con exit code `0`

---

### Requirement: Cobertura completa de `SessionStart` en `configs/hooks.json`

La entrada `SessionStart` en `configs/hooks.json` SHALL cubrir todos los valores documentados del campo `source` de Claude Code (`startup`, `resume`, `clear`, `compact`) sin excluir ninguno mediante un matcher restrictivo.

#### Scenario: Ausencia de matcher en SessionStart cubre todos los sub-tipos

- **GIVEN** `configs/hooks.json` con la entrada `SessionStart` sin campo `"matcher"`
- **WHEN** Claude Code dispara `SessionStart` con `source: "clear"` o `source: "compact"`
- **THEN** el comando relay SHALL ejecutarse
- **AND** SHALL llegar `POST /hooks` al proxy con el payload del evento

#### Scenario: SessionStart con source startup y resume siguen funcionando

- **GIVEN** `configs/hooks.json` con la entrada `SessionStart` sin campo `"matcher"`
- **WHEN** Claude Code dispara `SessionStart` con `source: "startup"` o `source: "resume"`
- **THEN** el comando relay SHALL ejecutarse normalmente (sin regresión respecto al comportamiento anterior)
