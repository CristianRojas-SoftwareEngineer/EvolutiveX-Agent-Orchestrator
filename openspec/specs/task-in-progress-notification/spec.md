## Requirements

### Requirement: Perfil de notificación `TaskInProgress`

El sistema SHALL definir un perfil `TaskInProgress` en el catálogo `EVENT_NOTIFICATION_PROFILES` (`src/2-services/notifications/event-notification-profile.ts`) con los siguientes campos:

- `message`: string fijo `"Tarea iniciada"` (fallback estático cuando el formatter no produce texto o el payload no trae `subject`).
- `image`: `"task-in-progress.png"` (PNG 256×256, 32-bit RGBA, ubicado bajo `assets/notifications/events/`).
- `level`: `"activity"` (paridad semántica con `SubagentStart` — señala que el modelo está trabajando).
- `sound.win32`: `"IM"`, `sound.darwin`: `"Ping"`, `sound.linux`: `true` (paridad exacta con `SubagentStart` y `Stop`).

`NOTIFICATION_EVENT_KEYS` SHALL contener `TaskInProgress` (total: 12 claves).

#### Scenario: `getProfileForEvent('TaskInProgress')` devuelve el perfil correcto

- **GIVEN** el catálogo `EVENT_NOTIFICATION_PROFILES`
- **WHEN** se invoca `getProfileForEvent('TaskInProgress')`
- **THEN** SHALL devolver un objeto con `message: 'Tarea iniciada'`
- **AND** SHALL devolver `image: 'task-in-progress.png'`
- **AND** SHALL devolver `level: 'activity'`
- **AND** SHALL devolver `sound.win32: 'IM'`, `sound.darwin: 'Ping'`, `sound.linux: true`

#### Scenario: El asset `task-in-progress.png` existe en disco

- **GIVEN** el repositorio
- **WHEN** se inspecciona `assets/notifications/events/task-in-progress.png`
- **THEN** SHALL existir el archivo
- **AND** SHALL ser un PNG válido de 256×256, 32-bit RGBA

---

### Requirement: Formatter dinámico `formatTaskInProgressMessage`

El sistema SHALL exponer `formatTaskInProgressMessage(payload: Record<string, unknown>): string | null` en `src/2-services/notifications/hook-payload-notification-message.ts` y registrarlo en `HOOK_PAYLOAD_MESSAGE_FORMATTERS['TaskInProgress']`.

El formatter SHALL:

1. Leer `subject` de `payload.tool_input` primero, luego de `payload` directamente (fallback). Usar `readStringField` para validación (string no vacío tras `trim`).
2. Si no hay `subject` válido → devolver `null` (caller usará `profile.message` del catálogo como fallback).
3. Si hay `subject` válido → aplicar `normalizeWhitespace(subject)` y luego `truncate(result, MAX_TOOL_INPUT_PREVIEW_LEN)`, anteponiendo el prefijo `"Tarea iniciada: "`.
4. El resultado SHALL pasar por `repairMojibake` antes de retornarse (aplicado por `resolveHookNotificationMessage`).

#### Scenario: Payload con `subject` no vacío devuelve mensaje con prefijo

- **GIVEN** payload `{ "tool_input": { "subject": "Refactor del parser", "status": "in_progress" } }`
- **WHEN** se invoca `resolveHookNotificationMessage('TaskInProgress', payload)`
- **THEN** SHALL devolver string que comienza con `"Tarea iniciada: "`
- **AND** SHALL contener `"Refactor del parser"`

#### Scenario: Payload sin `subject` devuelve `null` (fallback al catálogo)

- **GIVEN** payload `{ "tool_input": { "status": "in_progress" } }` (sin campo `subject`)
- **WHEN** se invoca `resolveHookNotificationMessage('TaskInProgress', payload)`
- **THEN** SHALL devolver `null`
- **AND** el caller (gateway) SHALL usar `profile.message: 'Tarea iniciada'` del catálogo

#### Scenario: `subject` largo se trunca a `MAX_TOOL_INPUT_PREVIEW_LEN`

- **GIVEN** payload con `tool_input.subject` de longitud > 120 chars
- **WHEN** se invoca `resolveHookNotificationMessage('TaskInProgress', payload)`
- **THEN** el fragmento tras `"Tarea iniciada: "` SHALL tener longitud ≤ 121 chars (120 chars de subject + sufijo `…`; paridad con `truncate` utility)
- **AND** SHALL terminar con sufijo `…` si fue truncado

#### Scenario: `subject` con mojibake se repara (paridad con UserPromptSubmit)

- **GIVEN** payload `{ "tool_input": { "subject": "ConfiguraciÃ³n regional" } }` (mojibake)
- **WHEN** se invoca `resolveHookNotificationMessage('TaskInProgress', payload)`
- **THEN** SHALL devolver string con `"Configuración regional"` correctamente decodificado

#### Scenario: `eventKey` no registrado en formatters devuelve `null`

- **GIVEN** formatter registrado solo para 6 claves (incluida `TaskInProgress`)
- **WHEN** se invoca `resolveHookNotificationMessage('SessionStart', payload)`
- **THEN** SHALL devolver `null` (mantiene contrato)

---

### Requirement: Filtrado en el gateway (sin relay externo)

Tras la consolidación de hooks en el gateway (change `consolidate-hooks-in-gateway`), el filtrado de `TaskUpdate+in_progress` ya no se hace en un script relay externo. El gateway (`AuditHookEventHandler.handlePostToolUse`) evalúa el filtro directamente sobre el `ClaudeHookEvent` parseado y emite el toast con `formatTaskInProgressMessage`.

El relay externo `scripting/task-in-progress-hook-ux.ts` se eliminó; el filtro de `tool_input.status === "in_progress"` migró al handler del gateway. La entrada canónica `PostToolUse[matcher=*]` envía todos los eventos al gateway vía `post-hook-event.ts`; el gateway aplica el filtro condicionalmente.

#### Scenario: `TaskUpdate(in_progress)` → gateway emite toast

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PostToolUse'`, `toolName: 'TaskUpdate'`, `toolInput.status: 'in_progress'`, `toolInput.subject: 'X'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** SHALL detectarse el `status === "in_progress"` (filtro satisfecho)
- **AND** SHALL emitirse un toast con `message: "Tarea iniciada: X"`

#### Scenario: `TaskUpdate(completed)` → no se emite notificación

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PostToolUse'`, `toolName: 'TaskUpdate'`, `toolInput.status: 'completed'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** SHALL detectarse el `status !== "in_progress"`
- **AND** NO SHALL emitirse notificación

#### Scenario: `TaskUpdate(deleted)` → no se emite notificación

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PostToolUse'`, `toolName: 'TaskUpdate'`, `toolInput.status: 'deleted'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** NO SHALL emitirse notificación

#### Scenario: `TaskUpdate` sin `status` → no se emite notificación (defensa)

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PostToolUse'`, `toolName: 'TaskUpdate'`, `toolInput: {}` (sin `status`)
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** NO SHALL emitirse notificación (defensa contra payloads malformados)

#### Scenario: `PostToolUse` con `toolName` distinto a `TaskUpdate` → no se evalúa el filtro

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PostToolUse'`, `toolName: 'Bash'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** NO SHALL evaluarse el filtro de `status` (solo aplica a `TaskUpdate`)

---

### Requirement: Entrada canónica unificada en plantilla de hooks

La plantilla canónica `configs/hooks.json` SHALL contener una única entrada bajo `hooks.PostToolUse` con `matcher: "*"` apuntando a `scripting/post-hook-event.ts`. Ya NO SHALL existir la entrada separada con `matcher: "TaskUpdate"` y `scripting/task-in-progress-hook-ux.ts`: el filtrado por `toolName === 'TaskUpdate' && toolInput.status === 'in_progress'` lo hace el gateway sobre el payload parseado.

```json
{
  "matcher": "*",
  "hooks": [
    {
      "type": "command",
      "command": "npx --prefix \"${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}\" tsx \"${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}/scripting/post-hook-event.ts\""
    }
  ]
}
```

`${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}` SHALL resolverse en install-time por el instalador universal (`setup --hooks`) sustituyendo la variable de entorno con la ruta absoluta del repo.

#### Scenario: PostToolUse tiene una única entrada con matcher "*"

- **GIVEN** `configs/hooks.json`
- **WHEN** se inspecciona `hooks.PostToolUse`
- **THEN** SHALL existir exactamente una entrada con `matcher: "*"`
- **AND** SHALL no existir una segunda entrada separada para el matcher `TaskUpdate`

#### Scenario: La entrada se distribuye en user-level tras `setup --hooks`

- **GIVEN** el usuario ejecuta `npm run setup -- --hooks` en una config limpia
- **WHEN** el instalador escribe `~/.claude/settings.json`
- **THEN** SHALL existir `hooks.PostToolUse[matcher="*"]` con un único comando apuntando a `post-hook-event.ts`
- **AND** SHALL NO existir `hooks.PostToolUse[matcher="TaskUpdate"]`
