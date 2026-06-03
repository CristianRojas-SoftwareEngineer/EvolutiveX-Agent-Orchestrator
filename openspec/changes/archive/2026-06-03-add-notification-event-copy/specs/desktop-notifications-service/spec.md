## MODIFIED Requirements

### Requirement: Catálogo de perfiles por evento de notificación

El sistema SHALL definir un catálogo en código en `src/2-services/notifications/event-notification-profile.ts` que mapee cada clave de evento de notificación (alineada a `--event-type` del CLI y a los hooks con toast en `.claude/settings.json`) a:

- `title`: string — título del toast mostrado por defecto (marca «AI Assistant» para las 11 claves).
- `message`: string — cuerpo del toast cuando no hay override `--message` ni mensaje dinámico desde stdin.
- `image`: nombre de archivo bajo `assets/notifications/events/` (PNG).
- `sound`: perfil `NotificationSoundProfile` con `win32`, `darwin`, `linux`.

El catálogo SHALL exportar `EVENT_NOTIFICATION_PROFILES` y `getProfileForEvent(eventKey: string)` con exactamente las **11 claves** existentes tras `add-notification-event-profiles`. Los campos `image` y `sound` SHALL conservar los valores acordados en ese change; este change solo **añade** `title` y `message` sin alterar tokens BurntToast ni nombres de PNG.

#### Scenario: Perfil conocido devuelve título, mensaje, imagen y sonido

- **GIVEN** `getProfileForEvent('StopFailure')`
- **WHEN** se lee el perfil
- **THEN** SHALL devolver `title` no vacío (marca «AI Assistant»)
- **AND** SHALL devolver `message` no vacío (fallback estático de error de API)
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

---

### Requirement: Exclusiones explícitas de v1 (inventario de archivos)

El servicio SHALL NO incluir en `src/2-services/notifications/`:

- `config.ts` ni carga de `JSON` externo (p. ej. `notifications-config.json`)
- **`builders.ts`** (nombre reservado al legacy externo `C:\AI\`; no reintroducir)
- subdirectorio `sound/` ni archivos `.wav` versionados
- `windows-toast.ts` (sin registro SnoreToast/AUMID desde el adaptador)
- acceso a `C:\AI\` desde el servicio

El servicio **SHALL** incluir `hook-payload-notification-message.ts` para derivar el **cuerpo** del toast desde el payload JSON de hooks cuando `--stdin-json` esté activo y exista formatter para el `eventKey` resuelto. Ese módulo sustituye la función de mensaje dinámico que cumplía `builders.ts` en el stack externo; **no** sustituye el catálogo para título, imagen ni sonido.

El directorio SHALL contener como mínimo los módulos obligatorios listados en el requirement homónimo de la spec principal, **más** `hook-payload-notification-message.ts`.

#### Scenario: Inventario incluye formatters de payload y excluye builders.ts

- **GIVEN** el directorio `src/2-services/notifications/`
- **WHEN** se enumeran archivos `.ts` en la raíz
- **THEN** SHALL existir `hook-payload-notification-message.ts`
- **AND** SHALL NOT existir `builders.ts`
- **AND** SHALL NOT existir `config.ts`

---

### Requirement: Entry point CLI standalone

El sistema SHALL exponer un entry point CLI en `src/2-services/notifications/cli.ts` que parsee los argumentos `--event-type`, `--message`, `--title`, `--sound`, `--silent`, `--stdin-json`, `--app-id <id>` e `--icon <path>` (vía `commander`), construya un `NotificationEvent` y delegue en `DesktopNotificationAdapter`.

Cuando `--stdin-json` esté presente, el CLI SHALL leer `process.stdin` completo, parsearlo como JSON objeto, y usar el payload junto con el `eventKey` resuelto para copy dinámico.

**Resolución de `eventKey` para perfiles y formatters** (sin cambio): `options.eventType` si está presente; si no, `stdinPayload.hook_event_name` cuando `--stdin-json` esté activo.

**Resolución de `title` en `buildEvent`:**

1. Si `--title` está presente en CLI → usar ese valor.
2. Si no → `profile.title` del catálogo para el `eventKey` resuelto.
3. El CLI SHALL NOT usar `hook_event_name` como título por defecto.

**Resolución de `message` en `buildEvent`:**

1. Si `--message` está presente en CLI → usar ese valor.
2. Si no y `--stdin-json` con payload válido → invocar `resolveHookNotificationMessage(eventKey, payload)`; si devuelve string no vacío, usarlo.
3. Si no → `profile.message` del catálogo para el `eventKey` resuelto.
4. El CLI SHALL NOT concatenar `hook_event_name` y `session_id` como mensaje por defecto (`deriveMessageFromPayload` eliminado).

Branding (`appId`, `icon`) y sonido SHALL seguir las reglas existentes (`resolveBranding`, `resolveEventSound`, overrides `--silent` / `--sound`).

#### Scenario: CLI con `--event-type` y `--message` override → usa mensaje explícito

- **GIVEN** el CLI con perfil `Stop` en catálogo
- **WHEN** se invoca con `--event-type Stop --message "Prueba manual"`
- **THEN** el evento SHALL tener `message: 'Prueba manual'`
- **AND** `title` SHALL ser el del catálogo salvo `--title` explícito

#### Scenario: CLI StopFailure con stdin y error rate_limit → mensaje dinámico

- **GIVEN** payload stdin `{ "hook_event_name": "StopFailure", "error": "rate_limit", "last_assistant_message": "Texto del asistente" }`
- **WHEN** se invoca con `--event-type StopFailure --stdin-json`
- **THEN** el evento SHALL tener `title` del catálogo (no `StopFailure` como título salvo override)
- **AND** `message` SHALL contener una línea legible equivalente a límite de tasa (API)
- **AND** `message` SHALL contener un fragmento del `last_assistant_message` truncado

#### Scenario: CLI PermissionRequest con stdin y tool_name → mensaje dinámico

- **GIVEN** payload stdin con `tool_name: "Bash"` y `tool_input` con campo `command`
- **WHEN** se invoca con `--event-type PermissionRequest --stdin-json`
- **THEN** `message` SHALL contener el nombre de herramienta
- **AND** SHALL contener preview del input truncado

#### Scenario: CLI PreToolUse con stdin AskUserQuestion → mensaje dinámico

- **GIVEN** payload stdin con `tool_input.questions` de longitud ≥ 1
- **WHEN** se invoca con `--event-type PreToolUse --stdin-json`
- **THEN** `message` SHALL indicar el número de preguntas pendientes
- **AND** SHALL incluir preview de la primera pregunta o header cuando exista

#### Scenario: CLI UserPromptSubmit con stdin y prompt → mensaje dinámico

- **GIVEN** payload stdin con `prompt` string no vacío
- **WHEN** se invoca con `--event-type UserPromptSubmit --stdin-json`
- **THEN** `message` SHALL ser un preview truncado del prompt (no solo `session_id`)

#### Scenario: CLI Stop con stdin y last_assistant_message → mensaje dinámico

- **GIVEN** payload stdin con `last_assistant_message` string no vacío
- **WHEN** se invoca con `--event-type Stop --stdin-json`
- **THEN** `message` SHALL ser el texto truncado de `last_assistant_message`

#### Scenario: Formatter devuelve null y catálogo aplica fallback

- **GIVEN** payload stdin válido sin campos que alimenten el formatter (p. ej. `Stop` sin `last_assistant_message`)
- **WHEN** se invoca con `--event-type Stop --stdin-json`
- **THEN** `message` SHALL ser `profile.message` del catálogo para `Stop`

#### Scenario: CLI con payload inválido → error en stderr y exit 1

- **GIVEN** `no-json` en stdin con `--stdin-json`
- **WHEN** se invoca el CLI
- **THEN** SHALL escribirse un mensaje de error en `stderr`
- **AND** SHALL terminar con código de salida 1

---

## ADDED Requirements

### Requirement: Formatters de mensaje desde payload de hook

El sistema SHALL exponer en `src/2-services/notifications/hook-payload-notification-message.ts`:

- Constantes `MAX_ASSISTANT_MESSAGE_LEN` (140) y `MAX_TOOL_INPUT_PREVIEW_LEN` (120).
- Función `resolveHookNotificationMessage(eventKey: string, payload: Record<string, unknown>): string | null`.
- Registro interno o exportado de formatters por `eventKey` para exactamente estos cinco casos:

| `eventKey` | Campos del payload consumidos | Comportamiento mínimo |
|------------|------------------------------|------------------------|
| `StopFailure` | `error`, `last_assistant_message` | Mapa de códigos de error API a texto en español; segunda línea opcional con último mensaje del asistente truncado |
| `PermissionRequest` | `tool_name`, `tool_input` | «Permiso para: {tool}»; preview de input (`command`, `file_path`, o JSON compacto) truncado |
| `PreToolUse` | `tool_input.questions[]` | Conteo de preguntas; preview de `question` o `header` de la primera |
| `UserPromptSubmit` | `prompt` | Preview del prompt truncado y whitespace normalizado |
| `Stop` | `last_assistant_message` | Texto truncado; `null` si ausente → fallback catálogo |

Los formatters SHALL ser funciones puras sin I/O. SHALL aplicar normalización de espacios en previews y sufijo `…` al truncar.

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
