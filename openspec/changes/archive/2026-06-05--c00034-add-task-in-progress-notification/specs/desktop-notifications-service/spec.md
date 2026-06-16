## MODIFIED Requirements

### Requirement: Catálogo de perfiles por evento de notificación

El sistema SHALL definir un catálogo en código en `src/2-services/notifications/event-notification-profile.ts` que mapee cada clave de evento de notificación (alineada a `--event-type` del CLI y a los hooks con toast en `.claude/settings.json`) a:

- `message`: string — cuerpo del toast cuando no hay override `--message` ni mensaje dinámico desde stdin.
- `image`: nombre de archivo bajo `assets/notifications/events/` (PNG).
- `sound`: perfil `NotificationSoundProfile` con `win32`, `darwin`, `linux`.

El catálogo SHALL exportar `EVENT_NOTIFICATION_PROFILES` y `getProfileForEvent(eventKey: string)` con exactamente las **12 claves** existentes tras `add-task-in-progress-notification`: las 11 previas (UserPromptSubmit, PreToolUse, SubagentStart, SubagentStop, Stop, StopFailure, SessionStart, SessionEnd, PermissionRequest, TaskCreated, TaskCompleted) más `TaskInProgress`. Los campos `image` y `sound` SHALL conservar los valores acordados para las 11 claves previas; el campo `message` se añade sin alterar tokens BurntToast ni nombres de PNG. El título del toast **no** vive en el catálogo: lo resuelve el CLI desde el `eventKey` (ver requirement «Entry point CLI standalone»).

#### Scenario: Perfil conocido devuelve mensaje, imagen y sonido

- **GIVEN** `getProfileForEvent('StopFailure')`
- **WHEN** se lee el perfil
- **THEN** SHALL devolver `message` no vacío (fallback estático de error de API)
- **AND** SHALL devolver `image: 'stop-failure.png'`
- **AND** SHALL devolver `sound.win32: 'LoopingAlarm7'`

#### Scenario: Perfil Stop incluye copy de fin de turno

- **GIVEN** `getProfileForEvent('Stop')`
- **WHEN** se lee el mensaje estático
- **THEN** SHALL indicar que el asistente terminó el turno (texto en español, no el literal `hook_event_name`)

#### Scenario: Evento sin perfil devuelve undefined

- **GIVEN** `getProfileForEvent('PostToolUse')`
- **WHEN** se consulta el catálogo
- **THEN** SHALL devolver `undefined`

#### Scenario: `NOTIFICATION_EVENT_KEYS` contiene las 12 claves tras el change

- **GIVEN** el catálogo tras `add-task-in-progress-notification`
- **WHEN** se enumera `NOTIFICATION_EVENT_KEYS`
- **THEN** SHALL tener longitud 12
- **AND** SHALL incluir `TaskInProgress`

---

### Requirement: Formatters de mensaje desde payload de hook

El sistema SHALL exponer en `src/2-services/notifications/hook-payload-notification-message.ts`:

- Constantes `MAX_ASSISTANT_MESSAGE_LEN` (140) y `MAX_TOOL_INPUT_PREVIEW_LEN` (120).
- Función `resolveHookNotificationMessage(eventKey: string, payload: Record<string, unknown>): string | null`.
- Función `repairMojibake(text: string): string` que repara texto «UTF-8 mal decodificado como Latin-1/CP1252».
- Registro interno o exportado de formatters por `eventKey` para exactamente estos **seis** casos:

| `eventKey` | Campos del payload consumidos | Comportamiento mínimo |
|------------|------------------------------|------------------------|
| `StopFailure` | `error`, `last_assistant_message` | Mapa de códigos de error API a texto en español; segunda línea opcional con último mensaje del asistente truncado |
| `PermissionRequest` | `tool_name`, `tool_input` | «Permiso para: {tool}»; preview de input (`command`, `file_path`, o JSON compacto) truncado |
| `PreToolUse` | `tool_input.questions[]` | Conteo de preguntas; preview de `question` o `header` de la primera |
| `UserPromptSubmit` | `prompt` | Preview del prompt truncado y whitespace normalizado |
| `Stop` | `last_assistant_message` | Texto truncado; `null` si ausente → fallback catálogo |
| `TaskInProgress` | `tool_input.subject` (fallback `payload.subject`) | `«Tarea iniciada: »` + preview truncado; `null` si ausente → fallback catálogo |

Los formatters SHALL ser funciones puras sin I/O. SHALL aplicar normalización de espacios en previews y sufijo `…` al truncar.

**Reparación de mojibake del payload.** Algunos clientes de hooks (p. ej. Cursor) envían el payload doblemente codificado: los bytes UTF-8 del texto se reinterpretan como Latin-1/CP1252 y se reserializan como UTF-8, produciendo secuencias como `Â¿quÃ©` para «¿qué». `resolveHookNotificationMessage` SHALL aplicar `repairMojibake` al string que devuelve cualquier formatter antes de retornarlo.

`repairMojibake` SHALL:

- Detectar la firma de mojibake (byte líder UTF-8 `C2`–`DF` o `E0`–`EF` seguido de bytes de continuación `80`–`BF`, tal como aparecen al decodificar UTF-8 como Latin-1).
- Si hay firma, reinterpretar el string con `Buffer.from(text, 'latin1').toString('utf8')`.
- Devolver el texto **original sin cambios** si no hay firma de mojibake (caso Claude Code y ASCII puro) o si la reparación introduce el carácter de reemplazo `U+FFFD` (señal de que el origen no era mojibake recuperable).

#### Scenario: StopFailure con error desconocido

- **GIVEN** payload `{ "error": "custom_code" }`
- **WHEN** se invoca `resolveHookNotificationMessage('StopFailure', payload)`
- **THEN** SHALL devolver string que mencione el código de error

#### Scenario: PermissionRequest sin tool_input

- **GIVEN** payload `{ "tool_name": "Read" }`
- **WHEN** se invoca el formatter
- **THEN** SHALL devolver string con «Permiso para: Read» sin segunda línea

#### Scenario: PreToolUse sin questions

- **GIVEN** payload `{ "tool_input": {} }`
- **WHEN** se invoca el formatter
- **THEN** SHALL devolver `null`

#### Scenario: eventKey sin formatter registrado

- **GIVEN** `eventKey` `SessionStart`
- **WHEN** se invoca `resolveHookNotificationMessage`
- **THEN** SHALL devolver `null`

#### Scenario: UserPromptSubmit con prompt doblemente codificado (Cursor) → mensaje reparado

- **GIVEN** payload `{ "prompt": "Hola, Â¿quÃ© hace?" }` (mojibake emitido por Cursor)
- **WHEN** se invoca `resolveHookNotificationMessage('UserPromptSubmit', payload)`
- **THEN** SHALL devolver «Hola, ¿qué hace?» sin secuencias `Â`/`Ã`

#### Scenario: Prompt UTF-8 correcto (Claude Code) se mantiene intacto

- **GIVEN** payload `{ "prompt": "Hola, ¿qué hace? niño, sesión" }`
- **WHEN** se invoca `resolveHookNotificationMessage('UserPromptSubmit', payload)`
- **THEN** SHALL devolver el mismo texto sin alteraciones

#### Scenario: TaskInProgress con subject → mensaje con prefijo

- **GIVEN** payload `{ "tool_input": { "subject": "Refactor del parser", "status": "in_progress" } }`
- **WHEN** se invoca `resolveHookNotificationMessage('TaskInProgress', payload)`
- **THEN** SHALL devolver string que comienza con `"Tarea iniciada: "`
- **AND** SHALL contener `"Refactor del parser"`

#### Scenario: TaskInProgress sin subject → null (fallback catálogo)

- **GIVEN** payload `{ "tool_input": { "status": "in_progress" } }`
- **WHEN** se invoca `resolveHookNotificationMessage('TaskInProgress', payload)`
- **THEN** SHALL devolver `null`

---

### Requirement: Assets versionados de imágenes por evento

Los archivos `assets/notifications/events/*.png` referenciados por `EVENT_NOTIFICATION_PROFILES` SHALL ser PNG **256×256**, **32-bit RGBA** (fondo transparente permitido), curados manualmente o con herramientas externas al servicio.

El header del toast (AUMID, `.lnk`, registro) SHALL seguir usando únicamente los assets globales `ai-assistant.ico` / `ai-assistant.png`, no los PNG por evento.

#### Scenario: Cada imagen del catálogo existe en events/

- **GIVEN** las 12 claves de `NOTIFICATION_EVENT_KEYS`
- **WHEN** se resuelve `getProfileForEvent(key).image` para cada clave
- **THEN** SHALL existir el archivo bajo `assets/notifications/events/` con ese nombre
- **AND** SHALL existir `assets/notifications/events/task-in-progress.png` para la nueva clave `TaskInProgress`
