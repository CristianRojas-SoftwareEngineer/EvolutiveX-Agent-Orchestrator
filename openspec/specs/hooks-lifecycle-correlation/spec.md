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

> **Nota sobre el matcher `*`:** El `matcher: "*"` aplica únicamente a la entrada que contiene el comando `POST /hooks` (la que el gateway necesita para correlacionar todas las tools). Cuando una clave de hook requiere notificación de UX restringida a una tool específica (p. ej. `PreToolUse:AskUserQuestion`), esa notificación SHALL declararse en una **entrada adicional bajo la misma clave** con su propio matcher (mecanismo nativo de Claude Code: una misma clave puede tener múltiples entradas con matchers distintos). El matcher `*` de la entrada de telemetría no se hereda a las entradas de notificación.

#### Scenario: Las entradas del proyecto sobrescriben las del user-level

- **GIVEN** el archivo `C:\Users\Cristian\.claude\settings.json` (user-level) contiene una entrada `SubagentStart` con un comando de notificación
- **AND** el archivo `.claude/settings.json` del proyecto contiene una entrada `SubagentStart` con un comando que invoca `POST /hooks`
- **WHEN** Claude Code dispara el hook `SubagentStart`
- **THEN** SHALL ejecutarse únicamente el comando del proyecto, no el del user-level

### Requirement: Doble comando en los hooks de lifecycle con notificación (excepto `Stop`)

La entrada del proyecto MUST contener, para los **4 hooks de lifecycle con doble comando** (`UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `StopFailure`), un array `hooks` con dos comandos. El primer comando invoca `POST /hooks` (definido por el requirement anterior). El segundo comando invoca el entry point CLI del servicio de notificaciones migrado al repositorio (`src/2-services/notifications/cli.ts`), con paths **relativos** a la raíz del proyecto y la flag `--event-type <EventName>` y `--message "<texto fijo>"` donde aplique (ver tabla). Los otros 3 hooks del lifecycle (`PreToolUse` con `*`, `PostToolUse` con `*`, `PostToolUseFailure`) MUST contener únicamente el comando `POST /hooks`, sin comando de notificación.

El hook **`Stop`** NO entra en este requirement: su configuración SHALL cumplir el requirement «Relay unificado del hook `Stop`» (un solo proceso; toast único con mensaje de continuidad generado por modelo).

**Justificación de la exclusión de `PreToolUse` / `PostToolUse`:** los eventos de tool tienen frecuencia alta (5–50 invocaciones por turno en sesiones largas). El gateway necesita `matcher: "*"` para correlacionar todas las tools, pero un toast por cada invocación es ruido de UX, no señal. La notificación se mantiene en las claves de lifecycle, donde un único toast por evento aporta valor (inicio del turno, spawn de subagente, cierre de subagente, cierre del turno, error de cierre). Mismo razonamiento aplica a `PostToolUseFailure` (frecuencia ligada a la de tools).

**Mensajes fijos por hook de notificación:**

| Hook | `--message` |
|---|---|
| `UserPromptSubmit` | (no se usa `--message`; la entrada usa `--stdin-json` para derivar `message` del payload) |
| `SubagentStart` | `"Subagente iniciado"` |
| `SubagentStop` | `"Subagente terminado"` |
| `StopFailure` | (no se usa `--message`; la entrada usa `--stdin-json` para derivar `message` del payload) |

> **Nota sobre el message fijo en `SubagentStart` / `SubagentStop`:** estos dos hooks no exponen `last_assistant_message` ni metadatos ricos en el payload (son eventos de spawning/cierre de subagente, no de cierre de turno). Un texto fijo en español es consistente con la decisión previa para `SessionStart`/`SessionEnd` (ver Requirement de UX no-lifecycle). En v1 no se aprovecha el payload; si en una iteración futura se desea derivar `message` del `agent_type` del payload, se reemplaza `--message "<fijo>"` por `--stdin-json` en la entrada correspondiente y se documenta el cambio.

#### Scenario: Los 4 hooks con doble comando disparan `POST /hooks` y notificación

- **GIVEN** `.claude/settings.json` del proyecto contiene la entrada `UserPromptSubmit` con dos comandos en el array `hooks`
- **WHEN** Claude Code dispara el evento `UserPromptSubmit`
- **THEN** SHALL ejecutarse el primer comando (que invoca `POST /hooks`)
- **AND** SHALL ejecutarse el segundo comando (que invoca el entry point CLI del servicio de notificaciones migrado al repositorio, `src/2-services/notifications/cli.ts`, con `--event-type UserPromptSubmit`)

#### Scenario: `SubagentStart` dispara dos comandos en orden

- **GIVEN** `.claude/settings.json` del proyecto contiene la entrada `SubagentStart` con dos comandos en el array `hooks`
- **WHEN** Claude Code dispara el evento `SubagentStart`
- **THEN** SHALL ejecutarse el primer comando (que invoca `POST /hooks`, correlacionando el spawn del subagente en el gateway)
- **AND** SHALL ejecutarse el segundo comando (que invoca el entry point CLI del servicio de notificaciones migrado al repositorio, `src/2-services/notifications/cli.ts`, con `--event-type SubagentStart --message "Subagente iniciado"`)

#### Scenario: `SubagentStop` dispara dos comandos en orden

- **GIVEN** `.claude/settings.json` del proyecto contiene la entrada `SubagentStop` con dos comandos en el array `hooks`
- **WHEN** Claude Code dispara el evento `SubagentStop`
- **THEN** SHALL ejecutarse el primer comando (que invoca `POST /hooks`, cerrando el sub-workflow en el gateway)
- **AND** SHALL ejecutarse el segundo comando (que invoca el entry point CLI del servicio de notificaciones migrado al repositorio, `src/2-services/notifications/cli.ts`, con `--event-type SubagentStop --message "Subagente terminado"`)

#### Scenario: Los 3 hooks restantes del lifecycle disparan un único comando

- **GIVEN** `.claude/settings.json` del proyecto contiene la entrada `PreToolUse` con `matcher: "*"` y un único comando en el array `hooks`
- **WHEN** Claude Code dispara el evento `PreToolUse` para cualquier tool
- **THEN** SHALL ejecutarse únicamente el comando que invoca `POST /hooks`
- **AND** NO SHALL invocarse el notificador externo

#### Scenario: `PreToolUse` con `matcher: "*"` ejecuta solo `POST /hooks`, sin notificación

- **GIVEN** `.claude/settings.json` del proyecto contiene la entrada `PreToolUse` con `matcher: "*"` y un único comando en el array `hooks`
- **WHEN** Claude Code dispara el evento `PreToolUse` para cualquier tool
- **THEN** SHALL ejecutarse únicamente el comando que invoca `POST /hooks`
- **AND** NO SHALL emitirse un toast del servicio de notificaciones

---

### Requirement: Relay unificado del hook `Stop` en el proyecto

El hook `Stop` en `.claude/settings.json` del proyecto Smart Code Proxy SHALL declarar un **único** handler `type: "command"` que ejecute `scripting/stop-hook-ux.ts` mediante `npx` + `tsx`, con rutas resueltas con `${CLAUDE_PROJECT_DIR}` (no SHALL depender del cwd del proceso hook). El timeout del handler SHOULD ser ≥ 120 s para cubrir la extracción del transcript, la llamada al modelo y la escritura en disco.

Ese proceso SHALL leer el payload JSON del hook **una sola vez** por stdin y, en secuencia:

1. Reenviar el cuerpo a `POST /hooks` del proxy (equivalente a `scripting/post-hook-event.ts`, URL vía `ANTHROPIC_BASE_URL`).
2. Extraer el contexto del workflow actual y del turno previo desde `transcript_path` del payload (ver spec `stop-hook-continuity-message`, Requirement «Extracción del contexto del workflow desde el transcript»).
3. Si `transcript_path` no está disponible o falla, usar `last_assistant_message` del payload como texto fuente de fallback.
4. Invocar la API de mensajes con credenciales `ANTHROPIC_API_KEY` o `ANTHROPIC_AUTH_TOKEN` del entorno del hook para generar el mensaje de continuidad (`generateContinuityMessage`); modelo por defecto Haiku (`ANTHROPIC_DEFAULT_HAIKU_MODEL` o fallback documentado en código).
5. Persistir el texto completo en `<CLAUDE_PROJECT_DIR>/sessions/.last-continuity-message.txt` (`writeContinuityMessage`).
6. Emitir el **único toast** con título `"Stop"` y cuerpo = preview truncado del mensaje de continuidad (o fallback según jerarquía definida en spec `stop-hook-continuity-message`).

El proceso NO SHALL emitir un primer toast de señal de estado separado («Tu turno — El asistente terminó»). El único toast cubre tanto el aviso de fin de turno como el contenido de continuidad.

El repositorio SHALL NOT configurar para `Stop` múltiples comandos en paralelo que lean stdin por separado, porque compiten por stdin (especialmente en Windows).

**Módulos normativos:** orquestador `scripting/stop-hook-ux.ts`; mensaje de continuidad y toast `scripting/stop-work-summary-notification.ts` (función `runContinuityNotification`); builder `buildStopHookUxCommand` en `scripting/shared/gateway-hook-command.ts`. Los prompt hooks (`type: "prompt"`) de Claude Code NO sustituyen este relay: no pueden invocar toasts.

**Documentación operativa (no normativa de comportamiento, referencia):** [`docs/notifications.md`](../../docs/notifications.md) § Hook Stop, [`README.md`](../../README.md) § Configuración de hooks. El directorio `.claude/` está en `.gitignore`; el fragmento JSON canónico vive en la guía de notificaciones.

#### Scenario: `Stop` con payload válido → `POST /hooks` y toast único con continuidad

- **GIVEN** `.claude/settings.json` del proyecto contiene la entrada `Stop` con un único comando a `stop-hook-ux.ts` y `${CLAUDE_PROJECT_DIR}` definido por Claude Code
- **AND** el proxy escucha en `ANTHROPIC_BASE_URL`
- **AND** el payload incluye `transcript_path` apuntando a un JSONL legible
- **AND** `ANTHROPIC_API_KEY` o `ANTHROPIC_AUTH_TOKEN` presentes en el entorno
- **WHEN** Claude Code dispara el evento `Stop`
- **THEN** SHALL llegar una request `POST /hooks` con el payload del evento
- **AND** SHALL emitirse **exactamente un** toast con título `"Stop"` y cuerpo no vacío (mensaje de continuidad)
- **AND** SHALL existir el archivo `sessions/.last-continuity-message.txt` con el texto completo

#### Scenario: `Stop` sin `transcript_path` pero con `last_assistant_message`

- **GIVEN** el payload de `Stop` no incluye `transcript_path` o el archivo no es legible
- **AND** el payload incluye `last_assistant_message` no vacío
- **WHEN** se ejecuta `stop-hook-ux.ts`
- **THEN** SHALL intentarse el mensaje de continuidad (o fallback) a partir de `last_assistant_message`
- **AND** SHALL emitirse **un** toast si se obtiene texto no vacío

#### Scenario: `Stop` con stdin vacío por competencia de hooks → sin toast de continuidad

- **GIVEN** una configuración incorrecta con dos comandos en paralelo que leen stdin
- **AND** el segundo proceso recibe stdin vacío
- **WHEN** se ejecuta solo el script de continuidad sin texto fuente
- **THEN** NO SHALL emitirse el toast de continuidad
- **AND** el proceso SHOULD registrar en stderr un mensaje diagnóstico

> **Nota de conformidad:** la configuración canónica del proyecto usa un solo comando (`stop-hook-ux.ts`) para evitar este escenario.

---

### Requirement: Notificaciones de UX no-lifecycle en `.claude/settings.json` del proyecto

El proyecto SHALL declarar **6 entradas adicionales** en `.claude/settings.json` para cubrir notificaciones de UX que no forman parte del lifecycle de correlación del gateway: `SessionStart` (con `matcher: "startup|resume"`), `SessionEnd`, `PermissionRequest`, una segunda entrada `PreToolUse` con `matcher: "AskUserQuestion"`, `TaskCreated`, y `TaskCompleted`. Cada entrada SHALL contener un **único comando**: el entry point CLI del servicio de notificaciones migrado (`src/2-services/notifications/cli.ts`) con paths relativos a la raíz del proyecto, `--event-type <EventName>` (canónico del lifecycle: `SessionStart`, `SessionEnd`, `PermissionRequest`, `PreToolUse`, `TaskCreated`, `TaskCompleted`) y `--stdin-json` donde aplique.

> **Nota sobre `TaskCreated` / `TaskCompleted`:** estos dos hooks nativos de Claude Code NO admiten campo `matcher` en `.claude/settings.json` (la documentación oficial indica que el campo es ignorado silenciosamente para estos eventos). Las entradas SHALL omitir el campo `matcher` para mantener la configuración limpia. En v1 se usa texto fijo `--message "<fijo>"`; no se aprovecha el payload vía `--stdin-json` (no aporta valor de UX diferenciado sobre el texto fijo en v1; podría aprovecharse en una iteración futura).

**Ninguna** de estas 6 entradas invoca `POST /hooks`: el `AuditHookEventHandler` solo procesa los 8 `eventName` del lifecycle definidos en el requirement de "Mapeo de eventos al correlador"; el resto cae en `default:` y se descarta. Enviar `POST /hooks` desde estos hooks sería ancho de banda desperdiciado.

**Trade-off explícito (override del user-level):** declarar estas claves en el proyecto sobrescribe las entradas equivalentes del user-level para la misma clave (regla de merge de Claude Code: project-level sobrescribe user-level por clave, ver Scenario "Las entradas del proyecto sobrescriben las del user-level"). Dentro de este repositorio, las notificaciones de UX pasan a ser responsabilidad del proyecto y no del user-level. El usuario asume este trade-off para que el ciclo de vida completo de una sesión quede cubierto desde el repo (sin depender del script externo `C:\AI\claude-code-notifications.ts`, deprecado con fecha de retirada 2026-09-01).

**Trade-off explícito (frecuencia de `TaskCreated` / `TaskCompleted`):** estos hooks disparan en cada invocación de la tool `TaskCreate` y en cada `TaskUpdate(status=completed)`. En sesiones con planificación activa (p. ej. `/openspec-new`, `/openspec-apply`, generación de listas de tareas), se generan múltiples toasts por turno. No existe mecanismo nativo de matcher/throttling para estos eventos. El usuario asume este trade-off a cambio de feedback explícito del avance de tareas. Si el ruido resulta excesivo en la práctica, la única mitigación nativa es retirar las entradas (no hay filtrado parcial sin implementar throttling/dedupe en el CLI de notificaciones — fuera del scope de este requirement).

**`--stdin-json` por entrada:**

| Entrada | Usa `--stdin-json` | Razón |
|---|---|---|
| `SessionStart` (matcher `startup|resume`) | No | El `eventName` viene del flag `--event-type`. El CLI exige `--message` cuando no se usa `--stdin-json` (contrato canónico en `desktop-notifications-service`), así que la entrada pasa un texto fijo `--message "Sesión iniciada"`. |
| `SessionEnd` | No | Igual que `SessionStart`; texto fijo `--message "Sesión finalizada"`. |
| `PermissionRequest` | Sí | El payload trae `tool_name` y `tool_input`, útiles para derivar el `message`. |
| `PreToolUse` (matcher `AskUserQuestion`) | Sí | El payload trae `session_id`, útil para derivar el `message`. |
| `TaskCreated` | No | Texto fijo `--message "Tarea creada"`; los hooks `TaskCreated`/`TaskCompleted` no soportan matcher y el payload no se aprovecha en v1. |
| `TaskCompleted` | No | Texto fijo `--message "Tarea completada"`. |

#### Scenario: Notificación de `SessionStart` ejecutada al arranque

- **GIVEN** `.claude/settings.json` del proyecto contiene una entrada `SessionStart` con `matcher: "startup|resume"` y un único comando que invoca el entry point CLI del servicio de notificaciones migrado con `--event-type SessionStart --message "Sesión iniciada"`
- **WHEN** Claude Code arranca una sesión (evento `SessionStart`)
- **THEN** SHALL ejecutarse el comando del CLI con `--event-type SessionStart` y `--message "Sesión iniciada"`
- **AND** SHALL emitirse un toast nativo del SO con título `SessionStart` y mensaje `Sesión iniciada`

#### Scenario: Notificación de `PreToolUse:AskUserQuestion` ejecutada solo para esa tool

- **GIVEN** `.claude/settings.json` del proyecto contiene una segunda entrada `PreToolUse` con `matcher: "AskUserQuestion"` y un único comando que invoca el entry point CLI del servicio de notificaciones migrado con `--event-type PreToolUse --stdin-json`
- **WHEN** Claude Code dispara `PreToolUse` para la tool `AskUserQuestion`
- **THEN** SHALL ejecutarse el comando del CLI
- **AND** SHALL emitirse un toast nativo del SO
- **WHEN** Claude Code dispara `PreToolUse` para una tool distinta de `AskUserQuestion` (p. ej. `Bash`, `Read`)
- **THEN** el comando de la entrada con `matcher: "AskUserQuestion"` NO SHALL ejecutarse (solo se ejecuta el comando de la entrada con `matcher: "*"` que invoca `POST /hooks`)

#### Scenario: Notificación de `TaskCreated` ejecutada al crear una tarea

- **GIVEN** `.claude/settings.json` del proyecto contiene una entrada `TaskCreated` (sin `matcher`) con un único comando que invoca el entry point CLI del servicio de notificaciones migrado con `--event-type TaskCreated --message "Tarea creada"`
- **WHEN** Claude Code invoca la tool `TaskCreate` (evento `TaskCreated` emitido)
- **THEN** SHALL ejecutarse el comando del CLI con `--event-type TaskCreated` y `--message "Tarea creada"`
- **AND** SHALL emitirse un toast nativo del SO con título `TaskCreated` y mensaje `Tarea creada`
- **AND** NO SHALL llegar request al endpoint `/hooks` del proxy desde esta entrada (el `AuditHookEventHandler` no procesa `TaskCreated`)

#### Scenario: Notificación de `TaskCompleted` ejecutada al marcar tarea completada

- **GIVEN** `.claude/settings.json` del proyecto contiene una entrada `TaskCompleted` (sin `matcher`) con un único comando que invoca el entry point CLI del servicio de notificaciones migrado con `--event-type TaskCompleted --message "Tarea completada"`
- **WHEN** Claude Code invoca la tool `TaskUpdate` con `status: "completed"` (evento `TaskCompleted` emitido)
- **THEN** SHALL ejecutarse el comando del CLI con `--event-type TaskCompleted` y `--message "Tarea completada"`
- **AND** SHALL emitirse un toast nativo del SO con título `TaskCompleted` y mensaje `Tarea completada`
- **AND** NO SHALL llegar request al endpoint `/hooks` del proxy desde esta entrada (el `AuditHookEventHandler` no procesa `TaskCompleted`)

#### Scenario: Las 6 entradas de UX no invocan `POST /hooks`

- **GIVEN** `.claude/settings.json` del proyecto contiene las 6 entradas de UX (`SessionStart`, `SessionEnd`, `PermissionRequest`, `PreToolUse` con `matcher: "AskUserQuestion"`, `TaskCreated`, `TaskCompleted`)
- **WHEN** Claude Code dispara cualquiera de los eventos `SessionStart`, `SessionEnd`, `PermissionRequest`, `PreToolUse` para la tool `AskUserQuestion`, `TaskCreated`, o `TaskCompleted`
- **THEN** NO SHALL llegar request al endpoint `/hooks` del proxy desde esas entradas
- **AND** SHALL ejecutarse únicamente el comando del CLI de notificaciones

---

---

