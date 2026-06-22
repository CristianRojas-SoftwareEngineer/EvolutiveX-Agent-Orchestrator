## ADDED Requirements

### Requirement: Perfil de notificación `TaskInProgress`

El sistema SHALL definir un perfil `TaskInProgress` en el catálogo `EVENT_NOTIFICATION_PROFILES` (`src/2-services/notifications/event-notification-profile.ts`) con los siguientes campos:

- `message`: string fijo `"Tarea iniciada"` (fallback estático cuando el formatter no produce texto o el payload no trae `subject`).
- `image`: `"task-in-progress.png"` (PNG 256×256, 32-bit RGBA, ubicado bajo `assets/notifications/events/`).
- `level`: `"activity"` (paridad semántica con `SubagentStart` — señala que el modelo está trabajando).
- `sound.win32`: `"IM"`, `sound.darwin`: `"Ping"`, `sound.linux`: `true` (paridad exacta con `SubagentStart` y `Stop`).

`NOTIFICATION_EVENT_KEYS` SHALL contener `TaskInProgress` tras este change (total: 12 claves).

#### Scenario: `getProfileForEvent('TaskInProgress')` devuelve el perfil correcto

- **GIVEN** el catálogo `EVENT_NOTIFICATION_PROFILES` tras el change
- **WHEN** se invoca `getProfileForEvent('TaskInProgress')`
- **THEN** SHALL devolver un objeto con `message: 'Tarea iniciada'`
- **AND** SHALL devolver `image: 'task-in-progress.png'`
- **AND** SHALL devolver `level: 'activity'`
- **AND** SHALL devolver `sound.win32: 'IM'`, `sound.darwin: 'Ping'`, `sound.linux: true`

#### Scenario: El asset `task-in-progress.png` existe en disco

- **GIVEN** el repositorio tras el change
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
- **AND** el caller (CLI) SHALL usar `profile.message: 'Tarea iniciada'` del catálogo

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

### Requirement: Relay `task-in-progress-hook-ux` con filtrado por `status`

El sistema SHALL exponer un módulo `scripting/task-in-progress-hook-ux.ts` (entry point del hook `TaskInProgress`) que:

1. Lea stdin completo como `Buffer` UTF-8 (`readStdinBuffer` + `toString('utf-8')`), igual que `post-hook-event.ts` y `pre-tool-use-hook-ux.ts`.
2. Haga `JSON.parse` del cuerpo; si el parse falla → escribir diagnóstico a `stderr` y terminar con código 0 (no propagar error al caller para no romper la sesión del cliente).
3. Filtre el evento: extraiga `tool_input.status` del payload y descarte silenciosamente (exit 0) si el valor NO es exactamente la cadena `"in_progress"`. Esto cubre los casos donde Claude Code invoca `TaskUpdate` con `status: "completed"`, `"pending"` o `"deleted"`, y donde un agente externo invoca el script sin intención de notificar.
4. Si el filtro pasa → invoque el CLI de notificaciones vía `npx --prefix "$EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT" tsx "$EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT/src/2-services/notifications/cli.ts" --event-type TaskInProgress --stdin-json`, reenviando el payload crudo por stdin al subproceso.
5. El relay NO SHALL invocar `POST /hooks` del proxy: `AuditHookEventHandler` no procesa eventos `TaskUpdate` (ver spec `hooks-lifecycle-correlation` § 3.2), por lo que enviar el payload al gateway sería ancho de banda desperdiciado.

El `EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT` SHALL resolverse desde la ubicación del script (`import.meta.url`), no desde `CLAUDE_PROJECT_DIR` ni de variables de runtime de Claude Code (paridad con `stop-hook-ux.ts`).

#### Scenario: `TaskUpdate(in_progress)` → CLI invocado con `--stdin-json`

- **GIVEN** payload stdin con `tool_input.status: "in_progress"` y `tool_input.subject: "X"`
- **WHEN** se ejecuta `scripting/task-in-progress-hook-ux.ts`
- **THEN** SHALL filtrarse correctamente (status coincide)
- **AND** SHALL invocarse el CLI con `--event-type TaskInProgress --stdin-json`
- **AND** SHALL emitirse un toast con `message: "Tarea iniciada: X"`

#### Scenario: `TaskUpdate(completed)` → no se invoca el CLI

- **GIVEN** payload stdin con `tool_input.status: "completed"`
- **WHEN** se ejecuta `scripting/task-in-progress-hook-ux.ts`
- **THEN** SHALL detectarse el status ≠ `"in_progress"`
- **AND** NO SHALL invocarse el CLI
- **AND** SHALL terminar con exit 0 (no rompe el flujo del cliente)

#### Scenario: `TaskUpdate(deleted)` → no se invoca el CLI

- **GIVEN** payload stdin con `tool_input.status: "deleted"`
- **WHEN** se ejecuta el relay
- **THEN** NO SHALL invocarse el CLI
- **AND** SHALL terminar con exit 0

#### Scenario: `TaskUpdate` sin `status` → no se invoca el CLI (defensa)

- **GIVEN** payload stdin con `tool_input: {}` (sin `status`)
- **WHEN** se ejecuta el relay
- **THEN** NO SHALL invocarse el CLI (defensa contra payloads malformados)
- **AND** SHALL terminar con exit 0

#### Scenario: stdin con JSON inválido → exit 0 con diagnóstico en stderr

- **GIVEN** stdin contiene `{ "tool_input":` (truncado, no parseable)
- **WHEN** se ejecuta el relay
- **THEN** SHALL escribirse un mensaje diagnóstico a `stderr` (sin propagar error al cliente)
- **AND** SHALL terminar con exit 0

#### Scenario: El relay NO invoca `POST /hooks`

- **GIVEN** cualquier payload válido de `TaskUpdate`
- **WHEN** se ejecuta el relay
- **THEN** SHALL NO observarse ninguna request HTTP saliente hacia el proxy

---

### Requirement: Entrada canónica `TaskInProgress` en plantilla de hooks

La plantilla canónica `configs/hooks.json` SHALL contener una entrada bajo `hooks.PostToolUse` con `matcher: "TaskUpdate"` y un array `hooks` con **exactamente un** comando:

```json
{
  "matcher": "TaskUpdate",
  "hooks": [
    {
      "type": "command",
      "command": "npx --prefix \"${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}\" tsx \"${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}/scripting/task-in-progress-hook-ux.ts\""
    }
  ]
}
```

`${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}` SHALL resolverse en install-time por el instalador universal (`setup --hooks`) sustituyendo la variable de entorno con la ruta absoluta del repo. La entrada SHALL poder coexistir con la entrada `PostToolUse[matcher="*"]` ya existente (los matchers son disjuntos en Claude Code).

#### Scenario: La entrada canónica tiene un único comando al relay

- **GIVEN** `configs/hooks.json` tras el change
- **WHEN** se inspecciona `hooks.PostToolUse[matcher="TaskUpdate"]`
- **THEN** SHALL existir exactamente esa entrada
- **AND** SHALL contener un array `hooks` con longitud 1
- **AND** SHALL apuntar a `scripting/task-in-progress-hook-ux.ts` con la variable `${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}`

#### Scenario: La entrada se distribuye en user-level tras `setup --hooks`

- **GIVEN** el usuario ejecuta `npm run setup -- --hooks` en una config limpia
- **WHEN** el instalador escribe `~/.claude/settings.json`
- **THEN** SHALL existir `hooks.PostToolUse[matcher="TaskUpdate"]` con un único comando
- **AND** el comando SHALL apuntar a la ruta absoluta del repo (variable resuelta)
- **AND** la entrada existente `hooks.PostToolUse[matcher="*"]` SHALL preservarse intacta (matchers disjuntos)
