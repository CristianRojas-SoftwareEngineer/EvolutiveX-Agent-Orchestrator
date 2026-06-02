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
}
```

donde `HookEventName` es la unión de los 8 nombres de evento del lifecycle:
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

El sistema SHALL implementar un handler `AuditHookEventHandler` en capa 3 (`src/3-operations/`) que reciba un `ClaudeHookEvent` parseado y despache cada uno de los 8 eventos del lifecycle. En G2, los eventos de cierre y apertura ejecutan mutaciones reales en el repo; solo los eventos de estado de `ToolUse` permanecen como stubs:

| Evento | Acción en G2 |
|--------|-------------|
| `UserPromptSubmit` | **Abre o confirma el workflow main en el repo** (idempotente; ver `gateway-workflow-lifecycle`) |
| `SubagentStart` | **`confirmSubagentFromHook(agentId, toolUseId?)`** (sin cambio respecto a C3) |
| `Stop` | **`readyToClose` → si true: `close`** (§15.4) |
| `SubagentStop` | **`readyToClose` para sub-workflow → si true: `close`** (§15.4) |
| `StopFailure` | **`close` directamente** (§15.4: siempre cierra en error) |
| `PreToolUse` | Stub — log "recibido; `ToolUse.status = running` diferido a G4" |
| `PostToolUse` | Stub — log "recibido; `ToolUse.status = completed` diferido a G4" |
| `PostToolUseFailure` | Stub — log "recibido; `ToolUse.status = error` diferido a G4" |

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

#### Scenario: `PreToolUse` → stub reconocido, sin mutación de estado (sin cambio)

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PreToolUse'`, `sessionId: 's1'`, `toolUseId: 'tu-xyz'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** el handler SHALL completar sin lanzar excepción
- **AND** `workflowRepo.close` NO SHALL haberse llamado
- **AND** ningún workflow en el repo SHALL haber cambiado de estado

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

### Requirement: Configuración de las 8 entradas del lifecycle en `.claude/settings.json` del proyecto

El repositorio SHALL registrar las 8 entradas del lifecycle de hooks de Claude Code en su propio `.claude/settings.json` (no en el del usuario), sobrescribiendo las entradas que el user-level tenga definidas para esas mismas claves. Las 8 entradas SHALL ser: `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `Stop`, `StopFailure`. Cada entrada SHALL contener al menos un comando que invoque el endpoint `POST /hooks` del proxy, cuya URL SHALL resolverse mediante la variable de entorno `ANTHROPIC_BASE_URL` (no SHALL quedar acoplada a un host:puerto literal). Los matchers de `PreToolUse` y `PostToolUse` SHALL establecerse en `*` para que el gateway reciba los eventos de todas las tools (no solo de las listadas en matchers estrechos como `AskUserQuestion` o `Write|Edit`).

#### Scenario: Las 8 entradas invocan `POST /hooks` con `$ANTHROPIC_BASE_URL`

- **GIVEN** el archivo `.claude/settings.json` del proyecto contiene las 8 entradas del lifecycle
- **AND** la variable de entorno `ANTHROPIC_BASE_URL` está definida con un valor de URL válido
- **WHEN** Claude Code dispara cualquiera de los 8 eventos del lifecycle
- **THEN** el comando configurado SHALL ejecutarse
- **AND** SHALL llegar una request `POST` al endpoint `/hooks` del proxy con el payload JSON del evento

#### Scenario: Matcher `*` en `PreToolUse` y `PostToolUse`

- **GIVEN** `.claude/settings.json` del proyecto contiene las entradas `PreToolUse` y `PostToolUse` con `"matcher": "*"`
- **WHEN** Claude Code dispara `PreToolUse` o `PostToolUse` para cualquier tool (no solo `AskUserQuestion` o `Write|Edit`)
- **THEN** el comando configurado SHALL ejecutarse
- **AND** SHALL llegar una request `POST /hooks` al proxy con el payload del evento

#### Scenario: Las entradas del proyecto sobrescriben las del user-level

- **GIVEN** el archivo `C:\Users\Cristian\.claude\settings.json` (user-level) contiene una entrada `SubagentStart` con un comando de notificación
- **AND** el archivo `.claude/settings.json` del proyecto contiene una entrada `SubagentStart` con un comando que invoca `POST /hooks`
- **WHEN** Claude Code dispara el hook `SubagentStart`
- **THEN** SHALL ejecutarse únicamente el comando del proyecto, no el del user-level

### Requirement: Doble comando en los 5 hooks con notificación previa

La entrada del proyecto MUST contener, para los 5 hooks con notificación previa (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `StopFailure`), un array `hooks` con dos comandos. El primer comando invoca `POST /hooks` (definido por el requirement anterior). El segundo comando invoca el entry point CLI del servicio de notificaciones migrado al repositorio (`src/2-services/notifications/cli.ts`), con paths **relativos** a la raíz del proyecto y la flag `--event-type <EventName>` (y `--stdin-json` donde aplique). Los otros 3 hooks del lifecycle (`SubagentStart`, `SubagentStop`, `PostToolUseFailure`) MUST contener únicamente el comando `POST /hooks`, sin comando de notificación.

#### Scenario: Los 5 hooks con notificación disparan dos comandos en orden

- **GIVEN** `.claude/settings.json` del proyecto contiene la entrada `UserPromptSubmit` con dos comandos en el array `hooks`
- **WHEN** Claude Code dispara el evento `UserPromptSubmit`
- **THEN** SHALL ejecutarse el primer comando (que invoca `POST /hooks`)
- **AND** SHALL ejecutarse el segundo comando (que invoca el entry point CLI del servicio de notificaciones migrado al repositorio, `src/2-services/notifications/cli.ts`, con `--event-type UserPromptSubmit`)

#### Scenario: Los 3 hooks nuevos disparan un único comando

- **GIVEN** `.claude/settings.json` del proyecto contiene la entrada `SubagentStart` con un único comando en el array `hooks`
- **WHEN** Claude Code dispara el evento `SubagentStart`
- **THEN** SHALL ejecutarse únicamente el comando que invoca `POST /hooks`
- **AND** NO SHALL invocarse el notificador externo

---

