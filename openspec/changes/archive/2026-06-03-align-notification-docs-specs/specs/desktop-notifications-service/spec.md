## MODIFIED Requirements

### Requirement: Resolución de sonido por plataforma

El sistema SHALL exponer `resolveNotificationSound(profile, platform)` y `toWin32NotificationSound(token)` en `resolve-notification-sound.ts`.

- El catálogo (`event-notification-profile.ts`) SHALL seguir almacenando tokens BurntToast en `sound.win32` (`Default`, `IM`, `Reminder`, `SMS`, `LoopingAlarm7`, …).
- En `win32`, `resolveNotificationSound` SHALL traducir esos tokens a strings con prefijo `Notification.` antes de pasarlos a `node-notifier`/`SnoreToast`, porque `mapToWin8` sustituye cualquier string sin ese prefijo por `Notification.Default`.
- En `darwin`, SHALL devolver el nombre nativo del perfil o `false`.
- En `linux`, SHALL devolver solo `boolean` (nunca tokens BurntToast).

Mapeo mínimo catálogo → valor en `NotificationEvent.sound` (win32):

| Catálogo | Valor win32 |
|----------|-------------|
| `Default` | `Notification.Default` |
| `IM` | `Notification.IM` |
| `Reminder` | `Notification.Reminder` |
| `SMS` | `Notification.SMS` |
| `LoopingAlarm7` | `Notification.Looping.Alarm7` |

`toWin32NotificationSound` SHALL devolver el token sin alterar si ya empieza por `Notification.`.

La limitación de `LoopingAlarm7` en SnoreToast frente al loop BurntToast legacy SHALL permanecer documentada en `docs/notifications.md`.

#### Scenario: StopFailure en Windows usa sonido WinRT

- **GIVEN** `platform === 'win32'`
- **AND** perfil de `StopFailure` del catálogo
- **WHEN** se invoca `resolveNotificationSound`
- **THEN** SHALL devolver `'Notification.Looping.Alarm7'`

#### Scenario: PreToolUse en Windows usa Notification.SMS

- **GIVEN** `platform === 'win32'`
- **AND** perfil de `PreToolUse` del catálogo
- **WHEN** se invoca `resolveNotificationSound`
- **THEN** SHALL devolver `'Notification.SMS'`

#### Scenario: Token ya con prefijo Notification. se devuelve sin alterar

- **GIVEN** `platform === 'win32'`
- **WHEN** se invoca `toWin32NotificationSound('Notification.IM')`
- **THEN** SHALL devolver `'Notification.IM'`

#### Scenario: PermissionRequest en Linux solicita sonido best-effort

- **GIVEN** `platform === 'linux'`
- **AND** perfil de `PermissionRequest` del catálogo
- **WHEN** se invoca `resolveNotificationSound`
- **THEN** SHALL devolver `true`
- **AND** SHALL NOT devolver un string

---

### Requirement: Resolución de ruta de imagen por evento

El sistema SHALL exponer `resolveEventImagePath(filename)` y `syncEventImageFromRepoIfStale(filename)` en `event-image-paths.ts` con prioridad de ruta:

1. `%LOCALAPPDATA%\AIAssistant\events\<filename>` (`STABLE_EVENTS_DIR`) si existe tras sincronización.
2. `<repo-root>/assets/notifications/events/<filename>` si existe y no hay copia estable.
3. `undefined` si ninguna existe.

En `win32`, cuando exista el PNG en el repo, `resolveEventImagePath` SHALL invocar `syncEventImageFromRepoIfStale` antes de resolver: si el hash SHA-256 del repo difiere del cache estable, SHALL `copyFileSync` repo → cache.

#### Scenario: Prioridad cache ASCII-only en Windows

- **GIVEN** existen ambos archivos: estable y repo, con contenido idéntico (mismo hash)
- **WHEN** se invoca `resolveEventImagePath('stop.png')`
- **THEN** SHALL devolver la ruta bajo `%LOCALAPPDATA%\AIAssistant\events\stop.png`

#### Scenario: Repo y cache con hash distinto sincroniza al resolver

- **GIVEN** `process.platform === 'win32'`
- **AND** existe `assets/notifications/events/stop.png` en el repo
- **AND** existe `%LOCALAPPDATA%\AIAssistant\events\stop.png` con contenido distinto
- **WHEN** se invoca `resolveEventImagePath('stop.png')`
- **THEN** el contenido del cache estable SHALL igualar el del repo
- **AND** SHALL devolver la ruta bajo `%LOCALAPPDATA%\AIAssistant\events\stop.png`

#### Scenario: Solo existe en repo crea cache al sincronizar

- **GIVEN** `process.platform === 'win32'`
- **AND** existe el PNG en el repo
- **AND** NO existe en el cache estable
- **WHEN** se invoca `resolveEventImagePath` para ese archivo
- **THEN** SHALL crearse la copia en el cache estable
- **AND** SHALL devolver la ruta estable

---

### Requirement: Exclusiones explícitas de v1 (inventario de archivos)

El servicio SHALL NO incluir en `src/2-services/notifications/`:
- `config.ts` ni carga de `JSON` externo
- `builders.ts`
- subdirectorio `sound/` ni archivos `.wav` versionados
- `windows-toast.ts`
- acceso a `C:\AI\` desde el servicio

El directorio SHALL contener **como mínimo** estos módulos obligatorios: `INotificationService.ts`, `DesktopNotificationAdapter.ts`, `types.ts`, `index.ts`, `cli.ts`, `register.ts`, `snoretoast-shortcut.ts`, `lnk-format.ts`, `registry.ts`, `asset-paths.ts`, `event-notification-profile.ts`, `event-image-paths.ts`, `resolve-notification-sound.ts`.

El directorio **MAY** incluir además módulos opcionales de **mantenimiento de assets** (no invocados por `cli.ts` ni `register.ts` en runtime): `toast-body-image-spec.ts`, `event-image-overlays.ts`, `event-notification-image.ts`.

Los iconos de branding global SHALL vivir en `assets/notifications/ai-assistant.png` y `assets/notifications/ai-assistant.ico`. Las imágenes por evento SHALL vivir en `assets/notifications/events/*.png`.

#### Scenario: Inventario de archivos del directorio del servicio

- **GIVEN** el directorio `src/2-services/notifications/` del repositorio
- **WHEN** se enumeran sus archivos `.ts` en la raíz del directorio
- **THEN** SHALL existir los módulos obligatorios del inventario mínimo
- **AND** SHALL existir `toast-body-image-spec.ts`, `event-image-overlays.ts` y `event-notification-image.ts`
- **AND** SHALL NO existir `config.ts`, `builders.ts`, subdirectorio `sound/`, ni `windows-toast.ts`
- **AND** SHALL NO existir ningún archivo `.lnk` dentro de `src/`, ni `.json` de configuración, ni script `.ps1`

#### Scenario: Assets de icono versionados fuera de `src/`

- **GIVEN** el repositorio
- **WHEN** se enumeran los assets de branding
- **THEN** SHALL existir `assets/notifications/ai-assistant.png` (PNG, 256×256, 32-bit RGBA)
- **AND** SHALL existir `assets/notifications/ai-assistant.ico` (ICO multi-resolución: 16/32/48/64/128/256)
- **AND** SHALL NO existir ningún asset de branding dentro de `src/`

---

## ADDED Requirements

### Requirement: Assets versionados de imágenes por evento

Los archivos `assets/notifications/events/*.png` referenciados por `EVENT_NOTIFICATION_PROFILES` SHALL ser PNG **256×256**, **32-bit RGBA** (fondo transparente permitido), curados manualmente o con herramientas externas al servicio.

El header del toast (AUMID, `.lnk`, registro) SHALL seguir usando únicamente los assets globales `ai-assistant.ico` / `ai-assistant.png`, no los PNG por evento.

#### Scenario: Cada imagen del catálogo existe en events/

- **GIVEN** las 11 claves de `NOTIFICATION_EVENT_KEYS`
- **WHEN** se resuelve `getProfileForEvent(key).image` para cada clave
- **THEN** SHALL existir el archivo bajo `assets/notifications/events/` con ese nombre

---

### Requirement: Pipelines opcionales de post-procesado de imagen (mantenimiento)

El repositorio SHALL exponer en capa 2-services, sin cableado al CLI ni a `register.ts`, los módulos de post-procesado:

- `renderToastBodyImageFromSource` y `applyCircularToastFrame` en `toast-body-image-spec.ts` (salida **128×128**, fondo opaco `#fefefe`, constante `TOAST_BODY_IMAGE_WIDTH_PX === 128`)
- `writeAllEventNotificationImages` en `event-notification-image.ts` (compositor desde `ai-assistant.png` + overlays SVG en `event-image-overlays.ts`)
- `reframeAllEventNotificationImages` (reframe circular de cada `events/*.png`)

La documentación SHALL advertir que ejecutar compositor o reframe **sobrescribe** los PNG versionados en `assets/notifications/events/`.

PNG con alpha usados directamente en runtime es comportamiento aceptado si el resultado visual en SnoreToast es válido; los pipelines opacos son remedio opcional para letterboxing o fondos heterogéneos.

#### Scenario: Constante de ancho del spec de toast es 128

- **GIVEN** el módulo `toast-body-image-spec.ts`
- **WHEN** se lee `TOAST_BODY_IMAGE_WIDTH_PX`
- **THEN** SHALL ser `128`
