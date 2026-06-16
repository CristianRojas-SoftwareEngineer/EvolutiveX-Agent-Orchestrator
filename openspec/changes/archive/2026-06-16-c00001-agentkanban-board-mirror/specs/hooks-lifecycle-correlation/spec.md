## MODIFIED Requirements

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
  transcriptPath?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResponse?: Record<string, unknown>;
  prompt?: string;
}
```

donde `HookEventName` es la unión de los 13 nombres de evento del lifecycle:
`'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse' | 'PostToolUseFailure' | 'SubagentStart' | 'SubagentStop' | 'Stop' | 'StopFailure' | 'SessionStart' | 'SessionEnd' | 'PermissionRequest' | 'TaskCreated' | 'TaskCompleted'` y cualquier nombre no reconocido representado como `string`.

`parseHookEvent` SHALL mapear los campos wire adicionales:
- `tool_name` (string) → `toolName`
- `tool_input` (object) → `toolInput`
- `tool_response` (object) → `toolResponse`
- `prompt` (string) → `prompt`

#### Scenario: Payload `PostToolUse` → campos mapeados correctamente

- **GIVEN** un payload JSON `{ "hook_event_name": "PostToolUse", "session_id": "s1", "tool_use_id": "tu-abc" }`
- **WHEN** se invoca `parseHookEvent(payload)`
- **THEN** el resultado SHALL ser `{ eventName: 'PostToolUse', sessionId: 's1', toolUseId: 'tu-abc' }`

#### Scenario: Payload sin `eventName` reconocido → resultado seguro, no lanza

- **GIVEN** un payload JSON sin campo `hook_event_name` o con valor no reconocido
- **WHEN** se invoca `parseHookEvent(payload)`
- **THEN** la función NO SHALL lanzar una excepción
- **AND** el resultado SHALL ser un `ClaudeHookEvent` con `eventName` igual al valor literal recibido o a una cadena segura por defecto

#### Scenario: Payload `PreToolUse` con `tool_name` y `tool_input` mapeados correctamente

- **GIVEN** un payload JSON `{ "hook_event_name": "PreToolUse", "session_id": "s1", "tool_name": "AskUserQuestion", "tool_input": { "questions": ["¿Continuar?"] } }`
- **WHEN** se invoca `parseHookEvent(payload)`
- **THEN** SHALL devolver `{ eventName: 'PreToolUse', sessionId: 's1', toolName: 'AskUserQuestion', toolInput: { questions: ['¿Continuar?'] } }`

#### Scenario: Payload `PostToolUse` con `tool_name` `TaskUpdate` mapeado

- **GIVEN** un payload JSON `{ "hook_event_name": "PostToolUse", "session_id": "s1", "tool_use_id": "tu-1", "tool_name": "TaskUpdate", "tool_input": { "status": "in_progress", "subject": "Refactor parser" } }`
- **WHEN** se invoca `parseHookEvent(payload)`
- **THEN** SHALL devolver un `ClaudeHookEvent` con `toolName: 'TaskUpdate'` y `toolInput.status: 'in_progress'`

#### Scenario: Payload `PermissionRequest` con `tool_name` mapeado

- **GIVEN** un payload JSON `{ "hook_event_name": "PermissionRequest", "session_id": "s1", "tool_name": "Bash", "tool_input": { "command": "rm -rf /tmp/test" } }`
- **WHEN** se invoca `parseHookEvent(payload)`
- **THEN** SHALL devolver `{ eventName: 'PermissionRequest', sessionId: 's1', toolName: 'Bash', toolInput: { command: 'rm -rf /tmp/test' } }`

#### Scenario: Payload `SessionStart` reconocido en HookEventName

- **GIVEN** un payload JSON `{ "hook_event_name": "SessionStart", "session_id": "s1" }`
- **WHEN** se invoca `parseHookEvent(payload)`
- **THEN** SHALL devolver `{ eventName: 'SessionStart', sessionId: 's1' }` sin lanzar error

#### Scenario: Payload sin `tool_name` no incluye `toolName` en el resultado

- **GIVEN** un payload JSON `{ "hook_event_name": "Stop", "session_id": "s1" }`
- **WHEN** se invoca `parseHookEvent(payload)`
- **THEN** el resultado NO SHALL tener propiedad `toolName`

#### Scenario: Payload `PostToolUse/TaskCreate` con `tool_response` mapeado correctamente

- **GIVEN** un payload JSON `{ "hook_event_name": "PostToolUse", "session_id": "s1", "tool_name": "TaskCreate", "tool_input": { "subject": "Extender parseHookEvent", "metadata": { "source": "spec-delta" } }, "tool_response": { "task": { "id": "7", "subject": "Extender parseHookEvent" } } }`
- **WHEN** se invoca `parseHookEvent(payload)`
- **THEN** SHALL devolver un `ClaudeHookEvent` con `toolResponse: { task: { id: '7', subject: 'Extender parseHookEvent' } }`

#### Scenario: Payload sin `tool_response` no incluye `toolResponse` en el resultado

- **GIVEN** un payload JSON `{ "hook_event_name": "PostToolUse", "session_id": "s1", "tool_name": "Bash" }` (sin `tool_response`)
- **WHEN** se invoca `parseHookEvent(payload)`
- **THEN** el resultado NO SHALL tener propiedad `toolResponse`

---

### Requirement: Mapeo de eventos al correlador (`AuditHookEventHandler`)

El sistema SHALL implementar un handler `AuditHookEventHandler` en capa 3 (`src/3-operations/`) que reciba un `ClaudeHookEvent` parseado y despache cada uno de los 13 eventos del lifecycle:

| Evento | Acción |
|--------|--------|
| `UserPromptSubmit` | Locución por voz; toast con preview del `prompt`. No crea ni alinea workflows (la apertura del turno corresponde a `ensureTurnWorkflow` en el primer hop HTTP) |
| `SubagentStart` | **`confirmSubagentFromHook(agentId, toolUseId?)`**; toast `"Subagente iniciado"` |
| `Stop` | **`readyToClose` → si true: `close`** (§15.4); voz + toast de continuidad (generado por LLM). Si no se encuentra workflow: **log `warn`** con `sessionId` |
| `SubagentStop` | **`readyToClose` para sub-workflow → si true: `close`** (§15.4); voz; toast `"Subagente terminado"`. Si no se encuentra entrada por `agentId`: **log `warn`**. Si `agentId` existe en índice wire pero no en lifecycle: **log `error`** |
| `StopFailure` | **`close` directamente** (§15.4: siempre cierra en error); voz; toast con detalle del error (vía `formatStopFailureMessage`). Si no se encuentra workflow: **log `warn`** con `sessionId` |
| `PreToolUse` | Log informativo; toast condicional si `toolName === 'AskUserQuestion' && toolInput.questions` (vía `formatPreToolUseAskMessage`) |
| `PostToolUse` | **`completeToolUse` solo si `completionAuthority === 'hook'`**; ignorar para tools `continuation`; toast condicional si `toolName === 'TaskUpdate' && toolInput.status === 'in_progress'` (vía `formatTaskInProgressMessage`); **proyección al board** si `toolName ∈ { TaskCreate, TaskUpdate }` y `toolInput.metadata.source === 'spec-delta'` (vía `KanbanBoardProjector`, opcional) |
| `PostToolUseFailure` | **`completeToolUse` con `isError: true` solo si `completionAuthority === 'hook'`**; ignorar para tools `continuation` |
| `SessionStart` | Toast `"Sesión iniciada"` |
| `SessionEnd` | Toast `"Sesión finalizada"` |
| `PermissionRequest` | Toast dinámico con `tool_name` y preview de `tool_input` (vía `formatPermissionRequestMessage`) |
| `TaskCreated` | Toast `"Tarea creada"` |
| `TaskCompleted` | Toast `"Tarea completada"` |

Los hooks `PostToolUse` / `PostToolUseFailure` siguen recibiéndose en `POST /hooks` (relay activo); la restricción es sobre **mutación de estado**, no sobre recepción del evento.

#### Scenario: `SubagentStart` → `confirmSubagentFromHook` invocado (sin cambio)

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'SubagentStart'`, `agentId: 'agent-child'`, `toolUseId: 'tu-abc'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** SHALL llamarse `workflowRepo.confirmSubagentFromHook('agent-child', 'tu-abc')`

#### Scenario: `Stop` con repo activo → delegado a readyToClose/close

- **GIVEN** un workflow activo identificado por `agentId` en el repo
- **AND** un `ClaudeHookEvent` con `eventName: 'Stop'`, `stopHookActive: false`, `backgroundTasks: 0`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** el handler SHALL invocar `readyToClose` sobre el workflow
- **AND** SHALL invocar `close` ya que `readyToClose` devolvió `true`
- **AND** el workflow SHALL quedar cerrado con `outcome: 'success'`

#### Scenario: `StopFailure` → close directo

- **GIVEN** un workflow activo en el repo
- **AND** un `ClaudeHookEvent` con `eventName: 'StopFailure'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** el handler SHALL invocar `close` directamente sin `readyToClose`
- **AND** el workflow SHALL quedar cerrado con `outcome: 'api_error'`

#### Scenario: `Stop` sin workflow en repo → warn con sessionId

- **GIVEN** no existe un workflow activo para el `sessionId` del evento
- **AND** un `ClaudeHookEvent` con `eventName: 'Stop'`, `sessionId: 's1'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** el handler SHALL logear a nivel `warn` con `{ eventName: 'Stop', sessionId: 's1' }`
- **AND** el handler NO SHALL logear a nivel `info` para este caso

#### Scenario: `StopFailure` sin workflow en repo → warn con sessionId

- **GIVEN** no existe un workflow activo para el `sessionId` del evento
- **AND** un `ClaudeHookEvent` con `eventName: 'StopFailure'`, `sessionId: 's1'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** el handler SHALL logear a nivel `warn` con `{ eventName: 'StopFailure', sessionId: 's1' }`
- **AND** el handler NO SHALL logear a nivel `info` para este caso

#### Scenario: `SubagentStop` sin entrada en índice por agentId → warn

- **GIVEN** no existe entrada en el índice wire para el `agentId` del evento
- **AND** un `ClaudeHookEvent` con `eventName: 'SubagentStop'`, `agentId: 'agent-child'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** el handler SHALL logear a nivel `warn` con `{ eventName: 'SubagentStop', agentId: 'agent-child' }`
- **AND** el handler NO SHALL logear a nivel `info` para este caso

#### Scenario: `SubagentStop` con inconsistencia wire/lifecycle → error

- **GIVEN** existe una entrada en el índice wire para `agentId: 'agent-child'` con `entry.agentId: 'wf-orphan'`
- **AND** no existe workflow con id `'wf-orphan'` en el lifecycle del repositorio
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** el handler SHALL logear a nivel `error` con `{ eventName: 'SubagentStop', agentId: 'agent-child', wfId: 'wf-orphan' }`
- **AND** el handler NO SHALL logear a nivel `info` para este caso

#### Scenario: PostToolUse para Bash client-side no muta el tool

- **GIVEN** un tool `Bash` con `completionAuthority: continuation` y `status: running`
- **WHEN** `AuditHookEventHandler` procesa `PostToolUse` para ese `tool_use_id`
- **THEN** `completeToolUse` NO SHALL invocarse
- **AND** el tool SHALL permanecer `running`

#### Scenario: PostToolUse para WebFetch con autoridad hook completa el tool

- **GIVEN** un tool `WebFetch` con `completionAuthority: hook` y `status: running`
- **WHEN** `AuditHookEventHandler` procesa `PostToolUse` con `lastAssistantMessage: 'summary'`
- **THEN** `completeToolUse` SHALL invocarse con `isError: false` y `result: 'summary'`

#### Scenario: `PreToolUse` → log informativo, sin mutación de estado

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PreToolUse'`, `sessionId: 's1'`, `toolUseId: 'tu-xyz'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** el handler SHALL completar sin lanzar excepción
- **AND** `workflowRepo.close` NO SHALL haberse llamado
- **AND** ningún workflow en el repo SHALL haber cambiado de estado

#### Scenario: `PreToolUse[AskUserQuestion]` → toast con preview de la pregunta

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PreToolUse'`, `toolName: 'AskUserQuestion'` y `toolInput.questions`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** SHALL emitirse un toast con el preview de la primera pregunta (vía `formatPreToolUseAskMessage`)

#### Scenario: `PreToolUse[Bash]` sin `tool_input.questions` → sin toast

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PreToolUse'`, `toolName: 'Bash'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** NO SHALL emitirse toast (filtro condicional no satisfecho)

#### Scenario: `PostToolUse[TaskUpdate+in_progress]` → toast de tarea iniciada

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PostToolUse'`, `toolName: 'TaskUpdate'` y `toolInput.status: 'in_progress'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** SHALL emitirse un toast `"Tarea iniciada: <subject>"` (vía `formatTaskInProgressMessage`)

#### Scenario: `PostToolUse[TaskUpdate+completed]` → sin toast

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PostToolUse'`, `toolName: 'TaskUpdate'` y `toolInput.status: 'completed'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** NO SHALL emitirse toast (filtro `in_progress` no satisfecho)

#### Scenario: `SessionStart` → toast de sesión iniciada

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'SessionStart'`, `sessionId: 's1'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** SHALL emitirse un toast con título `SessionStart` y mensaje `"Sesión iniciada"`

#### Scenario: `PermissionRequest[Bash]` → toast con preview del comando

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PermissionRequest'`, `toolName: 'Bash'`, `toolInput.command: 'rm -rf /tmp/test'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** SHALL emitirse un toast `"Permiso para: Bash\n<command preview>"` (vía `formatPermissionRequestMessage`)

#### Scenario: `PostToolUse[TaskCreate+spec-delta]` → proyección al board

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PostToolUse'`, `toolName: 'TaskCreate'`, `toolInput.metadata.source: 'spec-delta'`, `toolResponse.task.id: '7'`
- **AND** `AuditHookEventHandler` tiene `KanbanBoardProjector` inyectado
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** SHALL llamarse `KanbanBoardProjector.onTaskCreate(event)`
- **AND** el procesamiento existente (completeToolUse si aplica) SHALL continuar normalmente

#### Scenario: `PostToolUse[TaskUpdate+spec-delta]` → proyección al board

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PostToolUse'`, `toolName: 'TaskUpdate'`, `toolInput.metadata.source: 'spec-delta'`, `toolInput.status: 'completed'`
- **AND** `AuditHookEventHandler` tiene `KanbanBoardProjector` inyectado
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** SHALL llamarse `KanbanBoardProjector.onTaskUpdate(event)`
