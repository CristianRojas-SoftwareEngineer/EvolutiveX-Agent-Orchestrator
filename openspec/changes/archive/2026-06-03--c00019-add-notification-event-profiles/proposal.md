## Why

Tras el change `add-notifications-branding`, todas las notificaciones de escritorio disparadas desde `.claude/settings.json` comparten la misma imagen de cuerpo (`ai-assistant.png`) y el mismo comportamiento de sonido (por defecto mudo salvo `--sound` explícito). Eso dificulta distinguir visual y auditivamente eventos de distinta importancia (`StopFailure` vs `Stop`, `PermissionRequest` vs `UserPromptSubmit`, etc.) sin tocar once comandos de hooks.

Los assets por evento (`assets/notifications/events/*.png`, 11 archivos) ya existen en el repositorio; falta enlazarlos de forma centralizada y predecible desde el CLI, con soporte de sonido por tipo de evento y rutas estables en Windows (mismo patrón ASCII-only que el branding de AUMID).

La **fuente de verdad auditiva** para eventos que existían en el diseño legacy es `C:\AI\claude-notifications-enhanced.ps1` (`$DefaultEventConfig`, tokens BurntToast: `Default`, `Reminder`, `IM`, `SMS`, `LoopingAlarm7`, etc.). El catálogo del repo **hereda esos sonidos en Windows** donde `node-notifier`/SnoreToast acepte el mismo token string. Los **tres eventos sin paridad directa** en el legacy (`SubagentStart`, `SubagentStop`, `TaskCreated`) reciben tokens propuestos en el diseño; `TaskCompleted` mantiene paridad con `ToolComplete` del legacy.

## What Changes

- Se introduce un **catálogo en código** (`event-notification-profile.ts`) que mapea cada `EventType` con notificación en settings (11 entradas) a un PNG de cuerpo y un perfil de sonido por plataforma (`win32` / `darwin` / `linux`), con **paridad semántica** entre SO: mismo evento → misma intención auditiva (neutral / atención / mensaje / alarma), respetando las capacidades de cada plataforma.
- Se añaden módulos de resolución: `event-image-paths.ts` (ruta absoluta al PNG por evento) y `resolve-notification-sound.ts` (traduce el perfil al valor que acepta `node-notifier` en cada SO: tokens BurntToast en Windows, nombres nativos en macOS, **`true`/`false` en Linux** dentro de lo que `notify-send`/el entorno de escritorio permitan).
- Se amplía `NotificationEvent.sound` de `boolean` a `boolean | string`: tokens BurntToast (`string`) en Windows, nombres nativos del sistema (`string`) en macOS, y `true`/`false` en Linux (best-effort).
- Se modifica `cli.ts` para resolver imagen y sonido según `--event-type` (o `hook_event_name` en stdin como respaldo), manteniendo overrides `--icon`, `--sound` y `--silent`.
- Se extiende `asset-paths.ts` con `STABLE_EVENTS_DIR` y `register.ts` para copiar `assets/notifications/events/*.png` a `%LOCALAPPDATA%\AIAssistant\events\` en `--install` (idempotente por hash, igual que el logo).
- Se actualiza el inventario de archivos del servicio y `docs/notifications.md` con la tabla evento → imagen → sonido, incluyendo columna de **paridad legacy** (token BurntToast / hook antiguo).

**Sin cambios incompatibles en hooks:** `.claude/settings.json` no se modifica. El puerto `INotificationService` no cambia de forma. El header de marca (`ai-assistant.ico` + registro AUMID) permanece fijo.

## Capabilities

### New Capabilities

- Ninguna. El change extiende el spec existente `desktop-notifications-service`.

### Modified Capabilities

- `desktop-notifications-service`: perfiles por evento (imagen de cuerpo + sonido); ampliación de `sound` en el tipo y adaptador; resolución en CLI; copia de assets `events/` en `register --install`; actualización del inventario de módulos y exclusiones (sin `builders.ts` ni JSON externo).

## No objetivos

- Reintroducir `builders.ts` con una función por evento (mensajes/títulos siguen en flags/stdin de settings).
- Cargar configuración desde `notifications-config.json` o `config.ts`.
- Subdirectorio `sound/` con archivos `.wav` custom (v1 usa tokens/nombres/booleanos del SO, no rutas a audio versionado).
- Paridad bit a bit con BurntToast fuera de Windows (p. ej. loop de `LoopingAlarm7`).
- Garantizar sonido en Linux en entornos sin audio de notificación (best-effort documentado).
- Campo `contentImage` separado de `icon` o `heroImage` en toasts Windows.
- Throttling o deduplicación de `TaskCreated` / `TaskCompleted`.
- Modificar `.claude/settings.json`.

## Impact

- **Capas PKA:** principalmente capa 2 (`src/2-services/notifications/`) y composition root CLI (`cli.ts`); tipos en capa 1 (`types.ts`). Sin cambios en `3-operations`, `4-api` ni `5-user-interfaces`.
- **Código:** nuevos `event-notification-profile.ts`, `event-image-paths.ts`, `resolve-notification-sound.ts`; modificados `cli.ts`, `types.ts`, `DesktopNotificationAdapter.ts`, `asset-paths.ts`, `register.ts`.
- **Assets:** `assets/notifications/events/` (11 PNG ya versionados); sin nuevos `.ico` por evento.
- **Tests:** `tests/2-services/notifications/` (cli, adaptador, register, nuevos módulos).
- **Documentación:** `docs/notifications.md`.
- **Referencias:** [`docs/notifications.md`](../../../docs/notifications.md) (branding, hooks, limitaciones por SO); legacy `C:\AI\claude-notifications-enhanced.ps1` (sonidos por `EventType` en `$DefaultEventConfig`, líneas 89–178).
