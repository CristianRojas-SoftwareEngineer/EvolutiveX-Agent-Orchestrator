# Proposal: add-task-in-progress-notification

## Why

Cuando yo marco una tarea con `TaskUpdate(status: "in_progress")` durante sesiones largas (típicamente bajo `openspec-apply` u `openspec-roadmap-manager`), el usuario no recibe ninguna señal visual hasta que la tarea pasa a `completed` o a `deleted`. Eso rompe el contrato de feedback que ya existe para `TaskCreated` y `TaskCompleted` en `~/.claude/settings.json`: la transición intermedia de "tarea iniciada" es invisible y deja al usuario adivinando si el modelo está trabajando o se ha quedado bloqueado.

El intento previo (cambios directos al código y a `settings.json` por un subagente, revertidos por el usuario) demostró tres cosas:

1. La notificación debe dispararse solo cuando `status` pasa a `in_progress` — no en cada invocación de `TaskUpdate` (que también cubre `completed`, `pending`, `deleted`).
2. No debe duplicarse el bloque `PostToolUse` en `settings.json`: ya existe uno con matcher `*` ejecutando `post-hook-event.ts`, y un duplicado ejecutaría dos scripts por evento.
3. `--event-type TaskInProgress` no es un nombre de evento nativo del contrato de hooks de Claude Code; el contrato nativo de Claude Code para la transición intermedia de tareas no existe como hook lifecycle estándar. El filtrado por `status` debe ocurrir en el script (no en el shell via `if`).

Este change añade la 14ª clave de hook de SCP (8 lifecycle + 6 UX, antes 5), un perfil de notificación, un formatter dinámico, y un script relay que filtra el `status` del payload.

## What Changes

- **Nuevo perfil `TaskInProgress` en el catálogo `EVENT_NOTIFICATION_PROFILES`** (`src/2-services/notifications/event-notification-profile.ts`): `message: "Tarea iniciada: <subject>"` (preview del `subject` truncado), `image: "task-in-progress.png"` (a crear — ver Impact), `level: "activity"`, `sound.win32: "IM"` (mismo nivel que `SubagentStart`).
- **Nuevo formatter `formatTaskInProgressMessage`** en `src/2-services/notifications/hook-payload-notification-message.ts`: lee `tool_input.subject` o `payload.subject` del payload, aplica `truncate(normalizeWhitespace(subject), MAX_TOOL_INPUT_PREVIEW_LEN)`, devuelve `null` si no hay subject → fallback al `message` del catálogo.
- **Nuevo script relay `scripting/task-in-progress-hook-ux.ts`**: lee stdin (UTF-8), parsea JSON, filtra `tool_input.status === "in_progress"` (descarta el evento silenciosamente si no coincide), e invoca el CLI de notificaciones con `--event-type TaskInProgress --stdin-json`. Sin I/O de red: NO SHALL invocar `POST /hooks` (el `AuditHookEventHandler` no procesa eventos `TaskUpdate`).
- **Nueva entrada `TaskInProgress` en `~/.claude/settings.json` (user-level) y plantilla canónica en `configs/hooks.json`**: bajo `hooks.PostToolUse` con `matcher: "TaskUpdate"`, **una sola** entrada con un único comando al relay. La plantilla canónica se distribuye vía el mecanismo existente de `setup --hooks` (ver `hooks-lifecycle-correlation`).
- **Documentación operativa en `docs/notifications.md`**: nueva fila en la tabla de entradas UX con `--stdin-json` + nota sobre el filtrado por `status`.

## Capabilities

### New Capabilities

- `task-in-progress-notification`: contrato del evento `TaskInProgress` (perfil + formatter + relay + filtrado por status + instalación en user-level). Cubre la 14ª clave de hook de SCP, el filtrado correcto por `tool_input.status`, y la decisión de NO invocar `POST /hooks`.

### Modified Capabilities

- `desktop-notifications-service`: el requirement «Catálogo de perfiles por evento de notificación» pasa de **11 a 12 claves**; se actualizan los escenarios que cuentan `NOTIFICATION_EVENT_KEYS` y se referencia el nuevo `task-in-progress.png` en el requirement de assets.
- `hooks-lifecycle-correlation`: el requirement «Notificaciones de UX no-lifecycle en `.claude/settings.json` del proyecto» pasa de **5 a 6 entradas UX**; se actualiza la tabla de `--stdin-json` por entrada y los escenarios de `TaskCreated`/`TaskCompleted` para referenciar también `TaskInProgress`; el requirement «Distribución de hooks de SCP en `~/.claude/settings.json` (user-level)» pasa de **13 a 14 claves** (8 lifecycle + 6 UX).

## Impact

- **Capas PKA afectadas:**
  - `src/2-services/notifications/` (perfil nuevo, formatter nuevo, sin cambios en CLI ni adapter).
  - `scripting/` (nuevo relay `task-in-progress-hook-ux.ts`).
- **Assets:** `assets/notifications/events/task-in-progress.png` (256×256, 32-bit RGBA, fondo transparente) — **REQUIERE CREAR**: el catálogo exige el PNG; el helper `register.ts --install` lo copiará a `%LOCALAPPDATA%\AIAssistant\events\`. Creación manual o vía `writeAllEventNotificationImages` (capa 2, módulo de mantenimiento). **Esto requiere aprobación explícita del usuario** (AGENTS.md §6 — no crear nuevos assets sin confirmar).
- **Configuración:** `configs/hooks.json` (plantilla canónica) y `~/.claude/settings.json` (instalación). La nueva entrada `PostToolUse[matcher=TaskUpdate]` coexiste con la existente `PostToolUse[matcher=*]` ejecutando `post-hook-event.ts` — son matchers disjuntos en Claude Code (cada tool produce ambos matches solo si los matchers son los mismos, lo cual NO es el caso).
- **Tests:** nuevo test unitario para `formatTaskInProgressMessage` (con y sin subject, mojibake, truncado) en `src/2-services/notifications/hook-payload-notification-message.test.ts`. Nuevo test de integración para el relay en `scripting/__tests__/task-in-progress-hook-ux.test.ts` (status=in_progress notifica, status=completed/pending/deleted no notifica).
- **Documentación:** `docs/notifications.md` (entrada UX) y `docs/gateway-architecture.md` (mención opcional del relay en el flujo de notificaciones de tareas).
- **Verificación:** `npm run test:quick` (lint + typecheck + unit), `npm run test` (integración), `npm run notifications:register -- --install` para copiar el nuevo PNG a `%LOCALAPPDATA%\AIAssistant\events\`.

## No objetivos

- **No** se modifica el contrato del `INotificationService` ni del `DesktopNotificationAdapter`.
- **No** se cambia el `--event-type` de las entradas existentes (`TaskCreated`, `TaskCompleted`).
- **No** se añade un nuevo hook lifecycle nativo de Claude Code (no existe para `TaskUpdate`; la señal se filtra desde `PostToolUse:TaskUpdate`).
- **No** se introduce throttling/dedupe de notificaciones de tareas (queda fuera del scope; ver trade-off explícito en `hooks-lifecycle-correlation`).
- **No** se commitea el PNG generado sin aprobación explícita del usuario (AGENTS.md §6).
