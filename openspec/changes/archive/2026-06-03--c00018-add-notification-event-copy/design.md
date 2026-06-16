## Contexto

El servicio `desktop-notifications-service` resuelve hoy **imagen + sonido** por `eventKey` desde `event-notification-profile.ts`. El CLI ensambla `NotificationEvent` y delega en `DesktopNotificationAdapter`.

Los hooks del proyecto pasan `--event-type` y, en cinco casos, `--stdin-json` con el payload wire de Claude Code (snake_case). La documentación operativa promete aprovechar campos como `error`, `tool_name`, `tool_input`, `prompt` y `last_assistant_message`; el legacy en `C:\AI\src\notifications\builders.ts` implementa esa lógica para tres tipos y este change la completa para los cinco stdin.

## Objetivos

- **Copy estático** en el mismo catálogo que imagen/sonido (`title`, `message`).
- **Copy dinámico** en un módulo dedicado con formatters registrados por `eventKey`.
- **Precedencia única** en `buildEvent()` (composition root).
- **Título** nunca derivado de `hook_event_name` por defecto.

## No objetivos

Ver `proposal.md`. Sin JSON externo, sin `builders.ts`, sin cambios al puerto `INotificationService`.

## Modelo de dos capas

```
┌─────────────────────────────────────────────────────────────┐
│ event-notification-profile.ts                               │
│   title, message  (estático)  +  image, sound  (existente) │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│ hook-payload-notification-message.ts                        │
│   resolveHookNotificationMessage(eventKey, payload)         │
│   → string | null  (solo cuerpo; null = usar profile.message)│
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│ cli.ts :: buildEvent()                                      │
└─────────────────────────────────────────────────────────────┘
```

## Decisiones

### D1. Título solo desde catálogo (salvo `--title`)

- **Regla:** `title = options.title ?? profile.title` cuando existe perfil; si no hay perfil, degradación a `'AI Assistant'` o al `--event-type` (solo si no hay entrada en catálogo — no debería ocurrir para los 11 hooks).
- **Rechazado:** usar `hook_event_name` como título con `--stdin-json` (comportamiento actual confuso: toast titulado `StopFailure`).

### D2. Mensaje: precedencia explícita

Orden estricto:

1. `--message` en CLI (override manual / smoke tests).
2. Si `--stdin-json`: `resolveHookNotificationMessage(eventKey, payload)` cuando devuelve string no vacío.
3. `profile.message` del catálogo.
4. **No** usar `deriveMessageFromPayload` (eliminar).

Si `--stdin-json` con payload vacío o JSON inválido: el CLI ya falla con exit 1 en parseo; si el objeto es válido pero el formatter devuelve `null`, caer a `profile.message` (equivalente al legacy: WARN + default del evento, sin log obligatorio en v1).

### D3. Módulo `hook-payload-notification-message.ts` (no `builders.ts`)

- Funciones puras exportadas y un registro `HOOK_PAYLOAD_MESSAGE_FORMATTERS: Partial<Record<string, FormatterFn>>`.
- Constantes públicas para tests: `MAX_ASSISTANT_MESSAGE_LEN = 140`, `MAX_TOOL_INPUT_PREVIEW_LEN = 120` (paridad legacy).
- **Paridad directa** con `C:\AI\src\notifications\builders.ts`:
  - `StopFailure` → mapa `STOP_FAILURE_ERROR_MAP` + `last_assistant_message`.
  - `PermissionRequest` → `tool_name` + preview de `tool_input` (`command`, `file_path`, JSON compress).
  - `PreToolUse` → misma lógica que `buildAskUserQuestionBody` (matcher AskUserQuestion en settings; `eventKey` es `PreToolUse`).
- **Extensiones** (no estaban en STDIN del entry `C:\AI\claude-code-notifications.ts` pero sí en settings del repo):
  - `UserPromptSubmit` → campo `prompt` (string), truncado y whitespace normalizado.
  - `Stop` → `last_assistant_message` truncado; si ausente, `null` → catálogo.

### D4. Catálogo: textos estáticos

`brandTitle` único: **`AI Assistant`** en todos los `profile.title` (paridad `getBrandTitle()` del legacy).

Mensajes estáticos (`profile.message`) — herencia semántica de `C:\AI\src\notifications\defaults.ts` y mensajes actuales en hooks:

| `eventKey` | `message` (estático) |
|------------|----------------------|
| `SessionStart` | Sesión iniciada |
| `SessionEnd` | Sesión finalizada |
| `UserPromptSubmit` | Procesando tu solicitud... |
| `SubagentStart` | Subagente iniciado |
| `SubagentStop` | Subagente terminado |
| `Stop` | Tu turno — El asistente terminó. Escribe tu siguiente mensaje. |
| `StopFailure` | Error de API — No se completó la respuesta. |
| `PermissionRequest` | Permiso requerido — Confirma la herramienta en el cliente. |
| `PreToolUse` | Pregunta pendiente — Responde en la ventana del cliente. |
| `TaskCreated` | Tarea creada |
| `TaskCompleted` | Tarea completada |

### D5. `eventKey` para formatters

`resolveEventKey` existente **no cambia**: `options.eventType` primero, luego `hook_event_name`. Los formatters se indexan por esa clave (`PreToolUse`, no alias `AskUserQuestion`).

### D6. Hooks en `.claude/settings.json`

Simplificar a:

```text
node …/cli.ts --event-type <Event> [--stdin-json]
```

Quitar `--message "…"` donde el catálogo ya define el cuerpo estático. Mantener `--stdin-json` en: `UserPromptSubmit`, `PreToolUse` (matcher AskUserQuestion), `Stop`, `StopFailure`, `PermissionRequest`.

Alinear la nota en `docs/notifications.md` que hoy dice `Stop` sin stdin (incorrecta respecto al repo).

### D7. Spec e inventario v1

- **MODIFICAR** requirement «Exclusiones explícitas de v1»: sustituir la prohibición genérica de lógica por tipo con: «SHALL NOT existir `builders.ts` ni `config.ts`»; **SHALL** existir `hook-payload-notification-message.ts` para mensajes dinámicos desde stdin.
- **MODIFICAR** requirement «Catálogo de perfiles»: incluir `title` y `message`.
- **MODIFICAR** requirement «Entry point CLI»: precedencia de copy y escenarios por evento con payload.

### D8. Privacidad (documentar, no bloquear)

Los formatters completos pueden exponer comandos, rutas y preguntas en el Action Center. Se documenta en `docs/notifications.md` como trade-off aceptado (paridad legacy). Sin redacción automática de secretos en v1.

## Alternativas rechazadas

| Alternativa | Motivo |
|-------------|--------|
| Reintroducir `builders.ts` | Conflicto nominal con spec v1 y carpeta legacy `C:\AI`. |
| Título dinámico desde formatter | El usuario fijó título en catálogo. |
| Fase 2 solo para `UserPromptSubmit` / `Stop` | El usuario pidió todo en el primer change. |
| Reutilizar `parseHookEvent` del dominio dentro del formatter | Opcional; el formatter puede leer snake_case directo para no acoplar capa 2 a tipos del gateway en v1. **Decisión:** leer `Record<string, unknown>` en el módulo de notificaciones (mismo contrato wire que hooks), sin importar `3-operations`. |

## Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Payload de hooks cambia en futuras versiones de Claude Code | Tests con fixtures JSON; comentario en módulo con enlace a doc oficial. |
| `docs/notifications.md` y change `align-notification-docs-specs` solapan | Este change actualiza la sección de copy; no tocar WinRT/assets salvo una línea de inventario. |
| Toast de dos líneas mal renderizado en algún SO | Aceptado (legacy ya usaba `\n`); smoke manual Windows. |

## Archivos afectados (implementación)

| Archivo | Acción |
|---------|--------|
| `event-notification-profile.ts` | Añadir `title`, `message` a interfaz y 11 entradas |
| `hook-payload-notification-message.ts` | **Nuevo** |
| `cli.ts` | `buildEvent` + eliminar `deriveMessageFromPayload` |
| `tests/.../hook-payload-notification-message.test.ts` | **Nuevo** |
| `tests/.../cli.test.ts` | Escenarios precedencia + stdin |
| `tests/.../event-notification-profile.test.ts` | Assert title/message |
| `docs/notifications.md` | Modelo dos capas, formatters, tabla stdin |
| `.claude/settings.json` | Quitar `--message` redundantes |
| `openspec/specs/desktop-notifications-service/spec.md` | Tras archive/sync del delta |
