# Spec: hooks-lifecycle-correlation

## Purpose

Define el comportamiento del borde hooks del proxy: el endpoint `POST /hooks`, el parsing puro de eventos de Claude Code, el despacho al correlador (`AuditHookEventHandler`) y la mutación real de confirmación de subagente (`confirmSubagentFromHook`). Implementado en C3; los eventos de cierre y las mutaciones de estado de `ToolUse` se difieren a C4/G2.

---
## Requirements
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

---

### Requirement: `confirmSubagentFromHook` en `IWorkflowRepository`

El sistema SHALL exponer el método `confirmSubagentFromHook(agentId: string, toolUseId?: string): void` en `IWorkflowRepository` (`src/1-domain/repositories/IWorkflowRepository.ts`) e implementarlo en `WorkflowRepositoryService` (`src/2-services/`). La implementación extiende `WireSubagentEntry` con `confirmed: boolean` y `triggeringToolUseId?: string`. El método SHALL:
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

### Requirement: Configuración de las entradas del lifecycle en `.claude/settings.json` del proyecto

El repositorio SHALL registrar las entradas del lifecycle de hooks de Claude Code en su propio `.claude/settings.json` (no en el del usuario), sobrescribiendo las entradas que el user-level tenga definidas para esas mismas claves. Cada entrada SHALL contener al menos un comando que invoque el endpoint `POST /hooks` del proxy, cuya URL SHALL resolverse mediante la variable de entorno `ANTHROPIC_BASE_URL` (no SHALL quedar acoplada a un host:puerto literal). Los matchers de `PreToolUse` y `PostToolUse` SHALL establecerse en `*` para que el gateway reciba los eventos de todas las tools (no solo de las listadas en matchers estrechos como `AskUserQuestion` o `Write|Edit`).

#### Scenario: Las entradas invocan `POST /hooks` con `$ANTHROPIC_BASE_URL`

- **GIVEN** el archivo `.claude/settings.json` del proyecto contiene las entradas del lifecycle
- **AND** la variable de entorno `ANTHROPIC_BASE_URL` está definida con un valor de URL válido
- **WHEN** Claude Code dispara cualquiera de los eventos del lifecycle
- **THEN** el comando configurado SHALL ejecutarse
- **AND** SHALL llegar una request `POST` al endpoint `/hooks` del proxy con el payload JSON del evento

#### Scenario: Matcher `*` en `PreToolUse` y `PostToolUse`

- **GIVEN** `.claude/settings.json` del proyecto contiene las entradas `PreToolUse` y `PostToolUse` con `"matcher": "*"`
- **WHEN** Claude Code dispara `PreToolUse` o `PostToolUse` para cualquier tool (no solo `AskUserQuestion` o `Write|Edit`)
- **THEN** el comando configurado SHALL ejecutarse
- **AND** SHALL llegar una request `POST /hooks` al proxy con el payload del evento

> **Nota sobre el matcher `*`:** El `matcher: "*"` aplica únicamente a la entrada que contiene el comando `POST /hooks` (la que el gateway necesita para correlacionar todas las tools). El filtrado por tool específica (p. ej. `PreToolUse:AskUserQuestion` para toast) lo hace el **gateway** sobre el payload parseado, no un matcher del lado de Claude Code.

#### Scenario: Las entradas del proyecto sobrescriben las del user-level

- **GIVEN** el archivo `C:\Users\Cristian\.claude\settings.json` (user-level) contiene una entrada `SubagentStart` con un comando de notificación
- **AND** el archivo `.claude/settings.json` del proyecto contiene una entrada `SubagentStart` con un comando que invoca `POST /hooks`
- **WHEN** Claude Code dispara el hook `SubagentStart`
- **THEN** SHALL ejecutarse únicamente el comando del proyecto, no el del user-level

---

### Requirement: Todos los eventos de hook ciclan por `POST /hooks`

Todos los **13 eventos** de Claude Code gestionados por SCP SHALL usar `scripting/post-hook-event.ts` como único comando relay en `configs/hooks.json`. El gateway (`AuditHookEventHandler`) es el único punto de decisión de efectos (toast, TTS, audit): los scripts relay nunca deciden efectos locales.

Los eventos que antes emitían toast directamente desde scripts (`gateway-hook-notify.ts`, `pre-tool-use-hook-ux.ts`, `task-in-progress-hook-ux.ts`) o desde `notifications/cli.ts` (`SessionStart`, `SessionEnd`, `PermissionRequest`, `TaskCreated`, `TaskCompleted`) ahora ciclan por el gateway: `post-hook-event.ts` → `POST /hooks` → `AuditHookEventHandler.executeAsync` → `emitToast`.

Los eventos condicionales (`PreToolUse[AskUserQuestion]`, `PostToolUse[TaskUpdate+in_progress]`) también ciclan por el gateway, que aplica el filtro (`toolName === 'AskUserQuestion' && toolInput.questions`; `toolName === 'TaskUpdate' && toolInput.status === 'in_progress'`) antes de emitir el toast.

Ninguna clave SHALL contener un segundo comando en paralelo que lea stdin por separado (race condition de Windows eliminada de raíz: un solo relay por evento).

**Módulos normativos:** `scripting/post-hook-event.ts` (único relay); `src/3-operations/audit-hook-event.handler.ts` (único punto de despacho de efectos).

#### Scenario: Todos los eventos en hooks.json usan post-hook-event como comando

- **GIVEN** `configs/hooks.json` instalado por SCP
- **WHEN** se inspeccionan todos los comandos de hook de todos los eventos
- **THEN** cada comando SHALL referenciar únicamente `scripting/post-hook-event.ts`
- **AND** SHALL no existir ningún comando que referencie `scripting/gateway-hook-notify.ts`, `scripting/pre-tool-use-hook-ux.ts`, `scripting/task-in-progress-hook-ux.ts`, ni `src/2-services/notifications/cli.ts`

#### Scenario: PostToolUse tiene una sola entrada de hook (sin duplicado TaskUpdate)

- **GIVEN** `configs/hooks.json`
- **WHEN** se inspeccionan las entradas bajo la clave `PostToolUse`
- **THEN** SHALL existir exactamente una entrada con `matcher: "*"` y comando `post-hook-event.ts`
- **AND** SHALL no existir una segunda entrada separada para el matcher `TaskUpdate`

#### Scenario: SubagentStart tiene una sola entrada de hook (sin cli.ts en paralelo)

- **GIVEN** `configs/hooks.json`
- **WHEN** se inspeccionan las entradas bajo la clave `SubagentStart`
- **THEN** SHALL existir exactamente un comando por bloque de hook
- **AND** el comando SHALL referenciar `post-hook-event.ts`

#### Scenario: PreToolUse → gateway decide toast condicional para AskUserQuestion

- **GIVEN** `configs/hooks.json` con `PreToolUse[matcher=*]` apuntando a `post-hook-event.ts`
- **AND** el gateway recibe un payload `PreToolUse` con `tool_name: 'AskUserQuestion'` y `tool_input.questions`
- **WHEN** el gateway procesa el evento
- **THEN** SHALL emitir toast con preview de la primera pregunta (vía `formatPreToolUseAskMessage`)
- **WHEN** el gateway recibe un payload `PreToolUse` con otra tool o sin `questions`
- **THEN** SHALL ejecutar `POST /hooks` y NO SHALL emitir toast

#### Scenario: PostToolUse → gateway decide toast condicional para TaskUpdate+in_progress

- **GIVEN** `configs/hooks.json` con `PostToolUse[matcher=*]` apuntando a `post-hook-event.ts`
- **AND** el gateway recibe un payload `PostToolUse` con `tool_name: 'TaskUpdate'` y `tool_input.status: 'in_progress'`
- **WHEN** el gateway procesa el evento
- **THEN** SHALL emitir toast con `"Tarea iniciada: <subject>"` (vía `formatTaskInProgressMessage`)
- **WHEN** el gateway recibe `tool_input.status` distinto a `in_progress`
- **THEN** SHALL ejecutar el audit sin emitir toast

#### Scenario: Eventos lifecycle y de sesión llegan al gateway

- **GIVEN** `configs/hooks.json` con entradas para los 13 eventos apuntando a `post-hook-event.ts`
- **WHEN** Claude Code dispara `SessionStart`, `SessionEnd`, `TaskCreated`, `TaskCompleted` o `PermissionRequest`
- **THEN** SHALL llegar `POST /hooks` al gateway con el payload completo
- **AND** el gateway SHALL emitir el toast correspondiente (texto estático para sesión/tareas; dinámico para `PermissionRequest`)

---

### Requirement: Distribución de hooks de SCP en `~/.claude/settings.json` (user-level)

El sistema SHALL proporcionar un mecanismo de instalación de las **13 claves** de hooks de SCP en `~/.claude/settings.json` (user-level) mediante el script `setup --hooks` o `setup:hooks`. La instalación SHALL ser **merge selectivo** que preserve configs ajenas a SCP en las mismas claves.

Las 13 claves gestionadas por SCP SHALL ser: `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `Stop`, `StopFailure`, `SessionStart`, `SessionEnd`, `PermissionRequest`, `TaskCreated`, `TaskCompleted`. Cada clave SHALL contener un único comando que apunte a `scripting/post-hook-event.ts`.

La entrada `SessionStart` en `configs/hooks.json` SHALL omitir el campo `"matcher"` para que Claude Code despache el hook para todos los valores de `source` (`startup`, `resume`, `clear`, `compact`). **No SHALL existir un campo `"matcher"` en la entrada `SessionStart` de `configs/hooks.json`.**

El merge selectivo SHALL seguir esta política para cada clave:

1. Si la clave NO existe en `~/.claude/settings.json` → crear con versión canónica de SCP.
2. Si la clave existe y TODOS sus comandos son de SCP → reemplazar con versión canónica.
3. Si la clave existe y tiene comandos MIXTOS (SCP + ajenos) → preservar los ajenos, agregar los comandos SCP faltantes.
4. Si la clave existe y TODOS sus comandos son ajenos → preservar intactos (SCP no toca, salvo `--force`).

Un comando se considera "de SCP" si su path normalizado (backslash→forward slash) contiene:
- `post-hook-event`
- La ruta resolved de `EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT`

La plantilla canónica SHALL vivir en `configs/hooks.json` en el repo SCP y SHALL estar versionada. La instalación SHALL escribir `env.EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT` con la ruta absoluta del repo para que el gateway y los hooks la lean. Antes de modificar `settings.json`, SHALL crearse un backup en `~/.claude/settings-backup-<timestamp>.json`.

#### Scenario: Instalación en config vacía

- **GIVEN** `~/.claude/settings.json` no existe o tiene `hooks: {}`
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** las 13 claves de SCP SHALL crearse en `settings.hooks`
- **AND** `settings.env.EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT` SHALL establecerse con la ruta del repo

#### Scenario: SessionStart instalado sin matcher

- **GIVEN** `~/.claude/settings.json` no existe o tiene `hooks: {}`
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** la entrada `SessionStart` en `settings.hooks` NO SHALL tener campo `"matcher"`
- **AND** el comando relay SHALL estar presente en la entrada `SessionStart`

#### Scenario: Instalación con hooks ajenos existentes

- **GIVEN** `~/.claude/settings.json` tiene `hooks.github-copilot: [{ type: "command", command: "..." }]` (clave ajena a las 13 gestionadas)
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** `hooks.github-copilot` SHALL preservarse intacto
- **AND** las 13 claves de SCP SHALL crearse o actualizarse

#### Scenario: Instalación con clave mixta (SCP + ajenos)

- **GIVEN** `hooks.UserPromptSubmit` tiene un comando de SCP y un comando ajeno
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** el comando ajeno SHALL preservarse
- **AND** los comandos de SCP SHALL agregarse a la entrada (no reemplazar los ajenos)

#### Scenario: --dry-run muestra diff sin escribir

- **GIVEN** `~/.claude/settings.json` tiene config existente
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --dry-run`
- **THEN** el script SHALL mostrar los cambios que se aplicarían
- **AND** `settings.json` SHALL permanecer sin modificar

#### Scenario: Backup automático antes de escribir

- **GIVEN** `~/.claude/settings.json` tiene config existente
- **WHEN** el usuario ejecuta `npm run setup -- --hooks` (sin --dry-run)
- **THEN** un backup SHALL crearse en `~/.claude/settings-backup-<timestamp>.json`
- **AND** el archivo modificado SHALL escribirse después del backup

#### Scenario: Uninstall elimina solo comandos de SCP

- **GIVEN** `~/.claude/settings.json` tiene `hooks.UserPromptSubmit` con comandos SCP y ajenos mezclados
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --uninstall`
- **THEN** solo los comandos de SCP SHALL eliminarse
- **AND** los comandos ajenos SHALL preservarse
- **AND** si la entrada queda vacía tras eliminar comandos SCP, la entrada SHALL eliminarse

#### Scenario: Uninstall con clave solo de SCP elimina la entrada

- **GIVEN** `hooks.Stop` solo tiene comandos de SCP
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --uninstall`
- **THEN** la entrada `Stop` SHALL eliminarse completamente de `settings.hooks`

#### Scenario: --force sobrescribe hooks ajenos tras backup

- **GIVEN** `hooks.SubagentStart` tiene solo comandos ajenos
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --force`
- **THEN** backup SHALL crearse antes del cambio
- **AND** la entrada SHALL reemplazarse con la versión canónica de SCP (los ajenos se pierden)

---

### Requirement: Modelo de instalación user-level por defecto

Las entradas de hooks de SCP SHALL instalarse en `~/.claude/settings.json` (user-level) como modelo por defecto, no en el `.claude/settings.json` del proyecto. La configuración en el proyecto (`<proyecto>/.claude/settings.json`) es un override opcional que el usuario puede establecer manualmente.

**Justificación:** user-level permite que los hooks de SCP se hereden automáticamente en todos los proyectos del usuario sin duplicación de configuración.

#### Scenario: hooks se instalan en user-level por defecto

- **GIVEN** el usuario ejecuta `npm run setup -- --hooks`
- **WHEN** el script determina el destino de instalación
- **THEN** el destino SHALL ser `~/.claude/settings.json` (no el `.claude/` del proyecto)

---
