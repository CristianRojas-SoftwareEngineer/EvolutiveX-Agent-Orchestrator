## ADDED Requirements

### Requirement: Endpoint `POST /hooks`

El sistema SHALL exponer un endpoint `POST /hooks` que:
- Acepte un payload JSON de evento de hook de Claude Code.
- Responda con un código 2xx **antes** de completar el procesamiento del evento (respuesta rápida).
- No reenvíe el payload a ningún upstream ni lo incluya en side-interactions.
- Esté registrado en el servidor Fastify **antes** del proxy catch-all para que la ruta no sea capturada por la ruta comodín de `/v1/messages`.

#### Scenario: Evento válido recibe respuesta 2xx rápida

- **GIVEN** el servidor está levantado con el endpoint `POST /hooks` activo
- **AND** el cliente envía un payload JSON de evento `PostToolUse` válido a `POST /hooks`
- **WHEN** el servidor recibe la request
- **THEN** SHALL responder con HTTP 2xx antes de que el procesamiento interno del evento complete

#### Scenario: La ruta `POST /hooks` no cae en el proxy catch-all

- **GIVEN** el servidor tiene registrada la ruta `POST /hooks` y el proxy catch-all de `/v1/messages`
- **WHEN** el cliente envía `POST /hooks` con un payload de hook válido
- **THEN** la request NO SHALL llegar al upstream Anthropic
- **AND** la request NO SHALL generar una side-interaction de auditoría

---

### Requirement: Parsing puro del evento de hook

El sistema SHALL exponer una función pura `parseHookEvent(payload: unknown): ClaudeHookEvent` en capa 1 (`src/1-domain/`) que mapee el payload JSON crudo de un hook de Claude Code al tipo interno `ClaudeHookEvent` sin realizar ninguna operación de I/O. El tipo `ClaudeHookEvent` SHALL tener la siguiente forma:

```
ClaudeHookEvent {
  eventName: HookEventName;
  sessionId: string;
  toolUseId?: string;
  agentId?: string;
  stopHookActive?: boolean;
  backgroundTasks?: number;
  lastAssistantMessage?: string;
}
```

donde `HookEventName` es la unión de los 10 nombres de evento §24:
`'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse' | 'PostToolUseFailure' | 'SubagentStart' | 'SubagentStop' | 'Stop' | 'StopFailure'` y cualquier nombre no reconocido representado como `string`.

#### Scenario: Payload `PostToolUse` → campos mapeados correctamente

- **GIVEN** un payload JSON `{ "hook_event_name": "PostToolUse", "session_id": "s1", "tool_use_id": "tu-abc" }`
- **WHEN** se invoca `parseHookEvent(payload)`
- **THEN** el resultado SHALL ser `{ eventName: 'PostToolUse', sessionId: 's1', toolUseId: 'tu-abc' }`

#### Scenario: Payload sin `eventName` reconocido → resultado seguro, no lanza

- **GIVEN** un payload JSON sin campo `hook_event_name` o con valor no reconocido
- **WHEN** se invoca `parseHookEvent(payload)`
- **THEN** la función NO SHALL lanzar una excepción
- **AND** el resultado SHALL ser un `ClaudeHookEvent` con `eventName` igual al valor literal recibido o a una cadena segura por defecto

---

### Requirement: Mapeo de eventos al correlador (`AuditHookEventHandler`)

El sistema SHALL implementar un handler `AuditHookEventHandler` en capa 3 (`src/3-operations/`) que reciba un `ClaudeHookEvent` parseado y despache cada uno de los 10 eventos §24. **Solo `SubagentStart`** ejecuta una mutación real en C3. Los demás eventos se reconocen y se enrutan como stubs que registran en log el evento recibido; sus mutaciones de estado (`ToolUse.status`, `readyToClose`, apertura de workflow `main`) requieren el modelo `Workflow/Step/ToolUse` de G1/G2 y se difieren a G2/C4:

| Evento | Acción en C3 |
|--------|-------------|
| `UserPromptSubmit` | Stub — log "recibido; apertura de workflow main diferida a G2/C4" |
| `SubagentStart` | **`confirmSubagentFromHook(agentId, toolUseId?)`** (mutación real) |
| `PreToolUse` | Stub — log "recibido; `ToolUse.status = running` diferido a G2/C4" |
| `PostToolUse` | Stub — log "recibido; `ToolUse.status = completed` diferido a G2/C4" |
| `PostToolUseFailure` | Stub — log "recibido; `ToolUse.status = error` diferido a G2/C4" |
| `SubagentStop` | Stub — log "recibido; cierre de sub-workflow diferido a C4" |
| `Stop` | Stub — log "recibido; cierre de workflow main diferido a C4" (sin acción) |
| `StopFailure` | Stub — log "recibido; cierre con error diferido a C4" (sin acción) |

#### Scenario: `SubagentStart` → `confirmSubagentFromHook` invocado

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'SubagentStart'`, `agentId: 'agent-child'`, `toolUseId: 'tu-abc'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** SHALL llamarse `workflowRepo.confirmSubagentFromHook('agent-child', 'tu-abc')`

#### Scenario: `PreToolUse` → stub reconocido, sin mutación de estado

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PreToolUse'`, `sessionId: 's1'`, `toolUseId: 'tu-xyz'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** el handler SHALL completar sin lanzar excepción
- **AND** `workflowRepo.confirmSubagentFromHook` NO SHALL haberse llamado
- **AND** el correlador en memoria NO SHALL haber mutado (sin tipo `ToolUse` con `status`)

#### Scenario: `Stop` con cualquier valor de `stopHookActive` → sin acción de cierre en C3

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'Stop'`, `stopHookActive: true` o `false`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** el handler SHALL completar sin lanzar excepción
- **AND** no SHALL construirse ningún `WorkflowResult`
- **AND** `workflowRepo` NO SHALL haber recibido ninguna llamada (el tipo `ToolUse`/`readyToClose` no existe en C3)

---

### Requirement: `confirmSubagentFromHook` en `IWorkflowRepository`

El sistema SHALL añadir el método `confirmSubagentFromHook(agentId: string, toolUseId?: string): void` a `IWorkflowRepository` (`src/1-domain/repositories/IWorkflowRepository.ts`) e implementarlo en `WorkflowRepositoryService` (`src/2-services/`). La implementación extiende `WireSubagentEntry` con `confirmed: boolean` y `triggeringToolUseId?: string`. El método SHALL:
- Marcar la entrada del subagente identificada por `agentId` como `confirmed: true`.
- Si `toolUseId` está presente, registrarlo como `triggeringToolUseId` en la entrada.
- Si el join wire (plano B, `openSubagentFromWire`) aún no ocurrió para ese `agentId`, registrar la confirmación como pendiente de enlace (hook-antes-wire).

#### Scenario: `confirmSubagentFromHook` tras `openSubagentFromWire` → entrada confirmada con `triggeringToolUseId`

- **GIVEN** que `openSubagentFromWire` ya fue llamado para `agentId: 'agent-child'`
- **WHEN** se llama `confirmSubagentFromHook('agent-child', 'tu-abc')`
- **THEN** la entrada del sub-workflow SHALL estar marcada como `confirmed: true`
- **AND** la entrada SHALL tener `triggeringToolUseId: 'tu-abc'`

#### Scenario: `confirmSubagentFromHook` sin join wire previo → confirmación pendiente de enlace

- **GIVEN** que `openSubagentFromWire` NO ha sido llamado para `agentId: 'agent-child'`
- **WHEN** se llama `confirmSubagentFromHook('agent-child', 'tu-abc')`
- **THEN** la entrada SHALL quedar registrada como confirmada-pendiente-de-enlace
- **AND** NO SHALL lanzarse una excepción ni perderse la información

---

### Requirement: Cierre diferido a C4/G2

Los eventos de cierre (`Stop`, `SubagentStop`, `StopFailure`) se reconocen en C3 pero no se actúan: el lifecycle de workflow (`readyToClose`, `WorkflowResult`) requiere el modelo `Workflow/Step/ToolUse` que G2 introduce. C3 NO SHALL mutar ninguna entrada de workflow en respuesta a eventos de cierre ni escribir nada en `sessions/`.

#### Scenario: `Stop` → reconocido, sin escritura ni mutación en C3

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'Stop'`, `stopHookActive: false`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** el handler SHALL completar sin lanzar excepción
- **AND** NO SHALL escribirse ningún archivo bajo `sessions/`
- **AND** NO SHALL construirse ningún `WorkflowResult`
- **AND** el correlador en memoria NO SHALL tener un campo `readyToClose` modificado (el campo no existe en C3)
