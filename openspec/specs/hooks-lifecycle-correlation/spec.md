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

### Requirement: Relay unificado `gateway-hook-notify` (stdin-json + gateway)

Para los hooks de lifecycle que necesitan **`POST /hooks` y toast con mensaje derivado de stdin**, el repositorio SHALL declarar un **único** comando por clave de evento que ejecute `scripting/gateway-hook-notify.ts` con `--event-type <EventName>`, en lugar de dos comandos paralelos (`post-hook-event.ts` + `cli.ts --stdin-json`).

El relay SHALL leer stdin una vez (UTF-8), reenviar el cuerpo a `POST /hooks`, parsear el JSON, invocar `buildEvent` con `stdinJson: true` y emitir el toast. Eventos cubiertos: `UserPromptSubmit`, `StopFailure`.

**Módulos normativos:** `scripting/gateway-hook-notify.ts`; `buildGatewayHookNotifyCommand` en `scripting/shared/gateway-hook-command.ts`.

#### Scenario: `UserPromptSubmit` con prompt UTF-8 → gateway y toast con tildes

- **GIVEN** `configs/hooks.json` declara un único comando `gateway-hook-notify.ts --event-type UserPromptSubmit`
- **AND** el payload stdin incluye `prompt` con tildes en español
- **WHEN** Claude Code dispara `UserPromptSubmit`
- **THEN** SHALL llegar `POST /hooks` con el payload completo
- **AND** el toast `message` SHALL contener el preview del `prompt` con tildes preservadas

---

### Requirement: Relay unificado `pre-tool-use-hook-ux` (PreToolUse)

Para `PreToolUse`, el repositorio SHALL declarar **una sola** entrada con `matcher: "*"` que ejecute `scripting/pre-tool-use-hook-ux.ts`: siempre `POST /hooks`; toast solo si `resolveHookNotificationMessage('PreToolUse', payload)` devuelve texto (p. ej. `AskUserQuestion`).

**Módulo normativo:** `scripting/pre-tool-use-hook-ux.ts`.

#### Scenario: `AskUserQuestion` con pregunta acentuada

- **GIVEN** payload con `tool_input.questions[0].question` en español con tildes
- **WHEN** se ejecuta `pre-tool-use-hook-ux.ts`
- **THEN** SHALL ejecutarse `POST /hooks`
- **AND** el toast SHALL contener el preview con tildes preservadas

#### Scenario: `PreToolUse` para Bash sin questions

- **GIVEN** payload sin `tool_input.questions`
- **WHEN** se ejecuta `pre-tool-use-hook-ux.ts`
- **THEN** SHALL ejecutarse `POST /hooks`
- **AND** SHALL NOT emitirse toast

---

### Requirement: Doble comando en los hooks de lifecycle con notificación (excepto `Stop`)

La entrada del proyecto MUST contener, para los **2 hooks de lifecycle con doble comando** (`SubagentStart`, `SubagentStop`), un array `hooks` con dos comandos. El primer comando invoca `POST /hooks`. El segundo invoca el CLI de notificaciones con `--event-type` y `--message "<texto fijo>"`.

Los hooks **`UserPromptSubmit`** y **`StopFailure`** SHALL usar `gateway-hook-notify.ts` (un solo comando). El hook **`Stop`** SHALL usar `stop-hook-ux.ts`. El hook **`PreToolUse`** SHALL usar `pre-tool-use-hook-ux.ts`. `PostToolUse` y `PostToolUseFailure` MUST contener únicamente `POST /hooks`.

**Mensajes fijos (solo Subagent*):**

| Hook | `--message` |
|---|---|
| `SubagentStart` | `"Subagente iniciado"` |
| `SubagentStop` | `"Subagente terminado"` |

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

#### Scenario: `UserPromptSubmit` usa un solo relay (no doble comando)

- **GIVEN** la plantilla canónica `configs/hooks.json` para `UserPromptSubmit`
- **WHEN** se inspecciona el array `hooks`
- **THEN** SHALL existir exactamente un comando a `gateway-hook-notify.ts`
- **AND** SHALL NOT existir `post-hook-event.ts` y `cli.ts --stdin-json` en paralelo para la misma clave

---

### Requirement: Relay unificado del hook `Stop` en el proyecto

El hook `Stop` en `~/.claude/settings.json` SHALL declarar un **único** handler `type: "command"` que ejecute `scripting/stop-hook-ux.ts` mediante `npx` + `tsx`, con rutas resueltas con `${SMART_CODE_PROXY_ROOT}` en install-time por el instalador universal (no `${CLAUDE_PROJECT_DIR}`; el comando SHALL ser auto-suficiente independientemente del proyecto activo). El timeout del handler SHOULD ser ≥ 120 s para cubrir la extracción del transcript, la llamada al modelo y la escritura en disco.

Ese proceso SHALL leer el payload JSON del hook **una sola vez** por stdin y, en secuencia:

1. Reenviar el cuerpo a `POST /hooks` del proxy (equivalente a `scripting/post-hook-event.ts`, URL vía `ANTHROPIC_BASE_URL`).
2. Extraer el contexto del workflow actual y del turno previo desde `transcript_path` del payload (ver spec `stop-hook-continuity-message`, Requirement «Extracción del contexto del workflow desde el transcript»).
3. Si `transcript_path` no está disponible o falla, usar `last_assistant_message` del payload como texto fuente de fallback.
4. Invocar la API de mensajes con credenciales `ANTHROPIC_API_KEY` o `ANTHROPIC_AUTH_TOKEN` del entorno del hook para generar el mensaje de continuidad (`generateContinuityMessage`); modelo por defecto Haiku (`ANTHROPIC_DEFAULT_HAIKU_MODEL` o fallback documentado en código).
5. Persistir el texto completo en `<SMART_CODE_PROXY_ROOT>/sessions/.last-continuity-message.txt` (`writeContinuityMessage`). La raíz de SCP SHALL derivarse de la ubicación del propio script (`import.meta.url`), sin depender de ninguna variable de entorno inyectada por Claude Code.
6. Emitir el **único toast** con título `"Stop"` y cuerpo = preview truncado del mensaje de continuidad (o fallback según jerarquía definida en spec `stop-hook-continuity-message`).

El proceso NO SHALL emitir un primer toast de señal de estado separado («Tu turno — El asistente terminó»). El único toast cubre tanto el aviso de fin de turno como el contenido de continuidad.

El repositorio SHALL NOT configurar para `Stop` múltiples comandos en paralelo que lean stdin por separado, porque compiten por stdin (especialmente en Windows).

**Módulos normativos:** orquestador `scripting/stop-hook-ux.ts`; mensaje de continuidad y toast `scripting/stop-work-summary-notification.ts` (función `runContinuityNotification`); builder `buildStopHookUxCommand` en `scripting/shared/gateway-hook-command.ts`. Los prompt hooks (`type: "prompt"`) de Claude Code NO sustituyen este relay: no pueden invocar toasts.

**Documentación operativa (no normativa de comportamiento, referencia):** [`docs/notifications.md`](../../docs/notifications.md) § Hook Stop, [`README.md`](../../README.md) § Configuración de hooks. El directorio `.claude/` está en `.gitignore`; el fragmento JSON canónico vive en la guía de notificaciones.

#### Scenario: `Stop` con payload válido → `POST /hooks` y toast único con continuidad

- **GIVEN** `~/.claude/settings.json` contiene la entrada `Stop` con un único comando a `stop-hook-ux.ts` con rutas POSIX absolutas a SCP
- **AND** el proxy escucha en `ANTHROPIC_BASE_URL`
- **AND** el payload incluye `transcript_path` apuntando a un JSONL legible
- **AND** `ANTHROPIC_API_KEY` o `ANTHROPIC_AUTH_TOKEN` presentes en el entorno
- **WHEN** Claude Code dispara el evento `Stop` desde cualquier proyecto
- **THEN** SHALL llegar una request `POST /hooks` con el payload del evento
- **AND** SHALL emitirse **exactamente un** toast con título `"Stop"` y cuerpo no vacío (mensaje de continuidad)
- **AND** SHALL existir el archivo `<SMART_CODE_PROXY_ROOT>/sessions/.last-continuity-message.txt` con el texto completo

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

El proyecto SHALL declarar **5 entradas adicionales** en `.claude/settings.json` para notificaciones de UX fuera del lifecycle de correlación del gateway: `SessionStart` (con `matcher: "startup|resume"`), `SessionEnd`, `PermissionRequest`, `TaskCreated`, y `TaskCompleted`. Cada entrada SHALL contener un **único comando** al CLI de notificaciones (`src/2-services/notifications/cli.ts`) con `--event-type` y `--stdin-json` o `--message` fijo según `docs/notifications.md`.

La notificación de **`PreToolUse` / `AskUserQuestion`** NO es una entrada UX separada: SHALL cubrirse por `pre-tool-use-hook-ux.ts` en la entrada lifecycle `PreToolUse` con `matcher: "*"`.

> **Nota sobre `TaskCreated` / `TaskCompleted`:** estos dos hooks nativos de Claude Code NO admiten campo `matcher` en `.claude/settings.json` (la documentación oficial indica que el campo es ignorado silenciosamente para estos eventos). Las entradas SHALL omitir el campo `matcher` para mantener la configuración limpia. En v1 se usa texto fijo `--message "<fijo>"`; no se aprovecha el payload vía `--stdin-json` (no aporta valor de UX diferenciado sobre el texto fijo en v1; podría aprovecharse en una iteración futura).

**Ninguna** de estas 5 entradas invoca `POST /hooks`: el `AuditHookEventHandler` solo procesa los 8 `eventName` del lifecycle definidos en el requirement de "Mapeo de eventos al correlador"; el resto cae en `default:` y se descarta. Enviar `POST /hooks` desde estos hooks sería ancho de banda desperdiciado.

**Trade-off explícito (override del user-level):** declarar estas claves en el proyecto sobrescribe las entradas equivalentes del user-level para la misma clave (regla de merge de Claude Code: project-level sobrescribe user-level por clave, ver Scenario "Las entradas del proyecto sobrescriben las del user-level"). Dentro de este repositorio, las notificaciones de UX pasan a ser responsabilidad del proyecto y no del user-level. El usuario asume este trade-off para que el ciclo de vida completo de una sesión quede cubierto desde el repo (sin depender del script externo `C:\AI\claude-code-notifications.ts`, deprecado con fecha de retirada 2026-09-01).

**Trade-off explícito (frecuencia de `TaskCreated` / `TaskCompleted`):** estos hooks disparan en cada invocación de la tool `TaskCreate` y en cada `TaskUpdate(status=completed)`. En sesiones con planificación activa (p. ej. `/openspec-new`, `/openspec-apply`, generación de listas de tareas), se generan múltiples toasts por turno. No existe mecanismo nativo de matcher/throttling para estos eventos. El usuario asume este trade-off a cambio de feedback explícito del avance de tareas. Si el ruido resulta excesivo en la práctica, la única mitigación nativa es retirar las entradas (no hay filtrado parcial sin implementar throttling/dedupe en el CLI de notificaciones — fuera del scope de este requirement).

**`--stdin-json` por entrada:**

| Entrada | Usa `--stdin-json` | Razón |
|---|---|---|
| `SessionStart` (matcher `startup|resume`) | No | El `eventName` viene del flag `--event-type`. El CLI exige `--message` cuando no se usa `--stdin-json` (contrato canónico en `desktop-notifications-service`), así que la entrada pasa un texto fijo `--message "Sesión iniciada"`. |
| `SessionEnd` | No | Igual que `SessionStart`; texto fijo `--message "Sesión finalizada"`. |
| `PermissionRequest` | Sí | El payload trae `tool_name` y `tool_input`, útiles para derivar el `message`. |
| `TaskCreated` | No | Texto fijo `--message "Tarea creada"`; los hooks `TaskCreated`/`TaskCompleted` no soportan matcher y el payload no se aprovecha en v1. |
| `TaskCompleted` | No | Texto fijo `--message "Tarea completada"`. |

#### Scenario: Notificación de `SessionStart` ejecutada al arranque

- **GIVEN** `.claude/settings.json` del proyecto contiene una entrada `SessionStart` con `matcher: "startup|resume"` y un único comando que invoca el entry point CLI del servicio de notificaciones migrado con `--event-type SessionStart --message "Sesión iniciada"`
- **WHEN** Claude Code arranca una sesión (evento `SessionStart`)
- **THEN** SHALL ejecutarse el comando del CLI con `--event-type SessionStart` y `--message "Sesión iniciada"`
- **AND** SHALL emitirse un toast nativo del SO con título `SessionStart` y mensaje `Sesión iniciada`

#### Scenario: `PreToolUse:AskUserQuestion` vía relay unificado (no segunda entrada UX)

- **GIVEN** `configs/hooks.json` declara un solo bloque `PreToolUse` con `matcher: "*"` y `pre-tool-use-hook-ux.ts`
- **WHEN** Claude Code dispara `PreToolUse` para `AskUserQuestion` con `tool_input.questions`
- **THEN** SHALL ejecutarse `POST /hooks`
- **AND** SHALL emitirse un toast con preview de la pregunta
- **WHEN** Claude Code dispara `PreToolUse` para otra tool sin `questions`
- **THEN** SHALL ejecutarse `POST /hooks` sin toast

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

#### Scenario: Las 5 entradas de UX no invocan `POST /hooks`

- **GIVEN** `.claude/settings.json` del proyecto contiene las 5 entradas de UX (`SessionStart`, `SessionEnd`, `PermissionRequest`, `TaskCreated`, `TaskCompleted`)
- **WHEN** Claude Code dispara cualquiera de esos eventos
- **THEN** NO SHALL llegar request al endpoint `/hooks` del proxy desde esas entradas
- **AND** SHALL ejecutarse únicamente el comando del CLI de notificaciones

---

### Requirement: Distribución de hooks de SCP en `~/.claude/settings.json` (user-level)

El sistema SHALL proporcionar un mecanismo de instalación de las **13 claves** de hooks de SCP (8 lifecycle + 5 UX) en `~/.claude/settings.json` (user-level) mediante el script `setup --hooks` o `setup:hooks`. La instalación SHALL ser **merge selectivo** que preserve configs ajenas a SCP en las mismas claves.

Las 13 claves gestionadas por SCP SHALL ser:

**Lifecycle (8):**
- `UserPromptSubmit` (1 comando: `gateway-hook-notify.ts`)
- `PreToolUse` matcher `*` (1 comando: `pre-tool-use-hook-ux.ts`)
- `PostToolUse` matcher `*` (1 comando: `post-hook-event.ts`)
- `PostToolUseFailure` (1 comando: `post-hook-event.ts`)
- `SubagentStart` (2 comandos: gateway + notificación fija)
- `SubagentStop` (2 comandos: gateway + notificación fija)
- `Stop` (1 comando: `stop-hook-ux.ts`)
- `StopFailure` (1 comando: `gateway-hook-notify.ts`)

**UX (5):**
- `SessionStart` matcher `startup|resume`
- `SessionEnd`
- `PermissionRequest`
- `TaskCreated`
- `TaskCompleted`

El merge selectivo SHALL seguir esta política para cada clave:

1. Si la clave NO existe en `~/.claude/settings.json` → crear con versión canónica de SCP.
2. Si la clave existe y TODOS sus comandos son de SCP → reemplazar con versión canónica.
3. Si la clave existe y tiene comandos MIXTOS (SCP + ajenos) → preservar los ajenos, agregar los comandos SCP faltantes.
4. Si la clave existe y TODOS sus comandos son ajenos → preservar intactos (SCP no toca, salvo `--force`).

Un comando se considera "de SCP" si su path normalizado (backslash→forward slash) contiene alguno de estos marcadores:
- `post-hook-event`
- `stop-hook-ux`
- `gateway-hook-notify`
- `pre-tool-use-hook-ux`
- `notifications/cli.ts`
- La ruta resolved de `SMART_CODE_PROXY_ROOT`

La plantilla canónica SHALl vivir en `configs/hooks.json` en el repo SCP y SHALl estar versionada. La instalación SHALL escribir `env.SMART_CODE_PROXY_ROOT` con la ruta absoluta del repo para que el gateway y los hooks la lean. Antes de modificar `settings.json`, SHALL crearse un backup en `~/.claude/settings-backup-<timestamp>.json`.

#### Scenario: Instalación en config vacía

- **GIVEN** `~/.claude/settings.json` no existe o tiene `hooks: {}`
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** las 13 claves de SCP SHALL crearse en `settings.hooks`
- **AND** `settings.env.SMART_CODE_PROXY_ROOT` SHALL establecerse con la ruta del repo

#### Scenario: Instalación con hooks ajenos existentes

- **GIVEN** `~/.claude/settings.json` tiene `hooks.github-copilot: [{ type: "command", command: "..." }]` (clave ajena a las 13 gestionadas)
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** `hooks.github-copilot` SHALL preservarse intacto
- **AND** las 13 claves de SCP SHALL crearse o actualizarse

#### Scenario: Instalación con clave mixta (SCP + ajenos)

- **GIVEN** `hooks.UserPromptSubmit` tiene un comando de SCP y un comando ajeno
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** el comando ajeno SHALL preservarse
- **AND** los comandos de SCP SHALl agregarse a la entrada (no reemplazar los ajenos)

#### Scenario: --dry-run muestra diff sin escribir

- **GIVEN** `~/.claude/settings.json` tiene config existente
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --dry-run`
- **THEN** el script SHALL mostrar los cambios que se aplicarían
- **AND** `settings.json` SHALL permanecer sin modificar

#### Scenario: Backup automático antes de escribir

- **GIVEN** `~/.claude/settings.json` tiene config existente
- **WHEN** el usuario ejecuta `npm run setup -- --hooks` (sin --dry-run)
- **THEN** un backup SHALl crearse en `~/.claude/settings-backup-<timestamp>.json`
- **AND** el archivo modificado SHALl escribirse después del backup

#### Scenario: Uninstall elimina solo comandos de SCP

- **GIVEN** `~/.claude/settings.json` tiene `hooks.UserPromptSubmit` con comandos SCP y ajenos mezclados
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --uninstall`
- **THEN** solo los comandos de SCP SHALl eliminarse
- **AND** los comandos ajenos SHALL preservarse
- **AND** si la entrada queda vacía tras eliminar comandos SCP, la entrada SHALL eliminarse

#### Scenario: Uninstall con clave solo de SCP elimina la entrada

- **GIVEN** `hooks.Stop` solo tiene comandos de SCP
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --uninstall`
- **THEN** la entrada `Stop` SHALL eliminarse completamente de `settings.hooks`

#### Scenario: --force sobrescribe hooks ajenos tras backup

- **GIVEN** `hooks.SubagentStart` tiene solo comandos ajenos
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --force`
- **THEN** backup SHALl crearse antes del cambio
- **AND** la entrada SHALl reemplazarse con la versión canónica de SCP (los ajenos se pierden)

---

---

### Requirement: Distribución de hooks de SCP en ~/.claude/settings.json

El sistema SHALL proporcionar un mecanismo de instalación de las **13 claves** de hooks de SCP (8 lifecycle + 5 UX) en `~/.claude/settings.json` (user-level) mediante el script `setup --hooks`. La instalación SHALL ser merge selectivo que preserve configs ajenas a SCP en las mismas claves.

Las 13 claves managed by SCP SHALL ser las mismas listadas en el requirement «Distribución de hooks de SCP en `~/.claude/settings.json` (user-level)».

Un comando se considera "de SCP" si su path normalizado contiene `post-hook-event`, `stop-hook-ux`, `gateway-hook-notify`, `pre-tool-use-hook-ux`, `notifications/cli.ts` o la ruta resolved de `SMART_CODE_PROXY_ROOT`.

La plantilla canónica SHALL vivir en `configs/hooks.json` en el repo SCP y SHALL estar versionada.

#### Scenario: Instalación en config vacía

- **GIVEN** `~/.claude/settings.json` no existe o tiene `hooks: {}`
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** las 13 claves de SCP SHALL crearse en `settings.hooks`
- **AND** `settings.env.SMART_CODE_PROXY_ROOT` SHALL establecerse con la ruta del repo

#### Scenario: Instalación con hooks ajenos existentes

- **GIVEN** `~/.claude/settings.json` tiene `hooks.github-copilot: [{ type: "command", command: "..." }]`
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** `hooks.github-copilot` SHALL preservarse intacto
- **AND** las 13 claves de SCP SHALL crearse o actualizarse

#### Scenario: Instalación con clave mixta (SCP + ajenos)

- **GIVEN** `hooks.UserPromptSubmit` tiene un comando de SCP y un comando ajeno
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** el comando ajeno SHALL preservarse
- **AND** los comandos de SCP SHALl agregarse a la entrada (no reemplazar los ajenos)

#### Scenario: --dry-run muestra diff sin escribir

- **GIVEN** `~/.claude/settings.json` tiene config existente
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --dry-run`
- **THEN** el script SHALL mostrar los cambios que se aplicarían
- **AND** `settings.json` SHALL permanecer sin modificar

#### Scenario: Backup automático antes de escribir

- **GIVEN** `~/.claude/settings.json` tiene config existente
- **WHEN** el usuario ejecuta `npm run setup -- --hooks` (sin --dry-run)
- **THEN** un backup SHALl crearse en `~/.claude/settings-backup-<timestamp>.json`
- **AND** el archivo modificado SHALl escribirse después del backup

#### Scenario: Uninstall elimina solo comandos de SCP

- **GIVEN** `~/.claude/settings.json` tiene `hooks.UserPromptSubmit` con comandos SCP y ajenos mezclados
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --uninstall`
- **THEN** solo los comandos de SCP SHALl eliminarse
- **AND** los comandos ajenos SHALL preservarse
- **AND** si la entrada queda vacía tras eliminar comandos SCP, la entrada SHALL eliminarse

#### Scenario: Uninstall con clave solo de SCP elimina la entrada

- **GIVEN** `hooks.Stop` solo tiene comandos de SCP
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --uninstall`
- **THEN** la entrada `Stop` SHALL eliminarse completamente de `settings.hooks`

#### Scenario: Repo movido: SMART_CODE_PROXY_ROOT se re-resuelve

- **GIVEN** los hooks están instalados con paths pointing a `D:\OldPath\Smart-Code-Proxy`
- **AND** el repo se movió a `D:\NewPath\Smart-Code-Proxy`
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --root D:\NewPath\Smart-Code-Proxy`
- **THEN** todos los paths de comandos SCP SHALl actualizarse a la nueva ruta

#### Scenario: --force sobrescribe hooks ajenos tras backup

- **GIVEN** `hooks.SubagentStart` tiene solo comandos ajenos
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --force`
- **THEN** backup SHALl crearse antes del cambio
- **AND** la entrada SHALl reemplazarse con la versión canónica de SCP (los ajenos se pierden)

> **Nota:** `--force` existe para el caso donde el usuario quiere que SCP tome control total de una clave. Requiere backup para permitir rollback.

---

### Requirement: Modelo de instalación user-level por defecto

Las entradas de hooks de SCP SHALL instalarse en `~/.claude/settings.json` (user-level) como modelo por defecto, no en el `.claude/settings.json` del proyecto. La configuración en el proyecto (`<proyecto>/.claude/settings.json`) es un override opcional que el usuario puede establecer manualmente.

**Justificación:** user-level permite que los hooks de SCP se hereden automáticamente en todos los proyectos del usuario sin duplicación de configuración.

#### Scenario: hooks se instalan en user-level por defecto

- **GIVEN** el usuario ejecuta `npm run setup -- --hooks`
- **WHEN** el script determina el destino de instalación
- **THEN** el destino SHAL ser `~/.claude/settings.json` (no el `.claude/` del proyecto)

