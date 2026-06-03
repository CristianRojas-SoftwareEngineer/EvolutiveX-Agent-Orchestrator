## ADDED Requirements

### Requirement: Catálogo de perfiles por evento de notificación

El sistema SHALL definir un catálogo en código en `src/2-services/notifications/event-notification-profile.ts` que mapee cada clave de evento de notificación (alineada a `--event-type` del CLI y a los hooks con toast en `.claude/settings.json`) a:

- `image`: nombre de archivo bajo `assets/notifications/events/` (PNG 256×256).
- `sound`: perfil `NotificationSoundProfile` con campos opcionales `win32`, `darwin` y `linux`.

El catálogo SHALL exportar `EVENT_NOTIFICATION_PROFILES` y `getProfileForEvent(eventKey: string)`.

El catálogo SHALL incluir exactamente las 11 claves que disparan notificación en settings del proyecto (todas pasan `--event-type` en `.claude/settings.json`). Los sonidos `win32` SHALL heredar los tokens BurntToast del legacy `claude-notifications-enhanced.ps1` (`$DefaultEventConfig`, líneas 89–178) según la tabla. Los eventos sin entrada legacy (`SubagentStart`, `SubagentStop`, `TaskCreated`) SHALL usar los tokens de la columna `win32` de la tabla (derivados del diseño, ver `design.md`).

Cada fila SHALL incluir un nivel semántico de sonido (`neutral`, `message`, `activity`, `attention`, `alarm`) para garantizar **consistencia multiplataforma**: el mismo evento tiene la misma intención auditiva en Windows, macOS y Linux; solo cambia la representación técnica (`win32` string / `darwin` string / `linux` boolean).

| Clave `eventKey` | Nivel | Imagen (`events/`) | Legacy `EventType` | win32 | darwin | linux |
|------------------|-------|-------------------|--------------------|-------|--------|-------|
| `UserPromptSubmit` | message | `user-prompt-submit.png` | `UserPrompt` | `Reminder` | `Submarine` | `true` |
| `PreToolUse` | attention | `pre-tool-use-ask.png` | `AskUserQuestion` | `SMS` | `Hero` | `true` |
| `SubagentStart` | activity | `subagent-start.png` | — | `IM` | `Ping` | `true` |
| `SubagentStop` | neutral | `subagent-stop.png` | — | `Default` | `Tink` | `true` |
| `Stop` | activity | `stop.png` | `TurnIdle` | `IM` | `Ping` | `true` |
| `StopFailure` | alarm | `stop-failure.png` | `StopFailure` | `LoopingAlarm7` | `Basso` | `true` |
| `SessionStart` | neutral | `session-start.png` | `SessionStart` | `Default` | `Tink` | `true` |
| `SessionEnd` | neutral | `session-end.png` | `SessionEnd` | `Default` | `Tink` | `true` |
| `PermissionRequest` | attention | `permission-request.png` | `PermissionRequest` | `SMS` | `Hero` | `true` |
| `TaskCreated` | message | `task-created.png` | — | `Reminder` | `Submarine` | `true` |
| `TaskCompleted` | neutral | `task-completed.png` | `ToolComplete` | `Default` | `Tink` | `true` |

#### Scenario: Perfil conocido devuelve imagen y sonido

- **GIVEN** `getProfileForEvent('StopFailure')`
- **WHEN** se lee el perfil
- **THEN** SHALL devolver `image: 'stop-failure.png'`
- **AND** SHALL devolver `sound.win32: 'LoopingAlarm7'` (paridad legacy)
- **AND** SHALL devolver `sound.darwin: 'Basso'`
- **AND** SHALL devolver `sound.linux: true`

#### Scenario: Los once PNG del catálogo existen en el repositorio

- **GIVEN** el repositorio tras el change
- **WHEN** se listan los archivos bajo `assets/notifications/events/`
- **THEN** SHALL existir: `user-prompt-submit.png`, `pre-tool-use-ask.png`, `subagent-start.png`, `subagent-stop.png`, `stop.png`, `stop-failure.png`, `session-start.png`, `session-end.png`, `permission-request.png`, `task-created.png`, `task-completed.png`

#### Scenario: Evento sin perfil devuelve undefined

- **GIVEN** `getProfileForEvent('PostToolUse')` (hook sin toast en settings)
- **WHEN** se consulta el catálogo
- **THEN** SHALL devolver `undefined`

---

### Requirement: Resolución de ruta de imagen por evento

El sistema SHALL exponer `resolveEventImagePath(filename: string)` en `src/2-services/notifications/event-image-paths.ts` que resuelva la ruta absoluta al PNG con prioridad:

1. `%LOCALAPPDATA%\AIAssistant\events\<filename>` (`STABLE_EVENTS_DIR` en `asset-paths.ts`) si el archivo existe.
2. `<repo-root>/assets/notifications/events/<filename>` si existe.
3. Si ninguna existe, SHALL devolver `undefined`.

#### Scenario: Prioridad cache ASCII-only en Windows

- **GIVEN** existen ambos archivos: estable y repo, con contenido distinto
- **WHEN** se invoca `resolveEventImagePath('stop.png')`
- **THEN** SHALL devolver la ruta bajo `%LOCALAPPDATA%\AIAssistant\events\stop.png`

---

### Requirement: Resolución de sonido por plataforma

El sistema SHALL exponer `resolveNotificationSound(profile: NotificationSoundProfile | undefined, platform: NodeJS.Platform)` en `src/2-services/notifications/resolve-notification-sound.ts`.

- En `win32`, SHALL devolver el string del token BurntToast del perfil (p. ej. `'SMS'`, `'LoopingAlarm7'`) o `false` si el campo ausente o `false`.
- En `darwin`, SHALL devolver el nombre de sonido del sistema del perfil (p. ej. `'Ping'`, `'Basso'`) o `false`.
- En `linux`, SHALL devolver **únicamente** `boolean` (`true` o `false`) según `profile.linux`. SHALL NOT devolver tokens BurntToast ni nombres macOS en Linux. Cuando `profile.linux === true`, el adaptador SHALL pasar `sound: true` a `node-notifier` (mejor esfuerzo vía `notify-send`/DE). Cuando `profile.linux === false` o el perfil es `undefined`, SHALL devolver `false`.

El catálogo SHALL definir `sound.linux: true` para los 11 eventos con intención audible (tabla del Requirement «Catálogo de perfiles»), alineado con el legacy (`Silent = $false` en todos los eventos de `$DefaultEventConfig`).

#### Scenario: StopFailure en Windows usa token legacy

- **GIVEN** `platform === 'win32'`
- **AND** perfil de `StopFailure` del catálogo
- **WHEN** se invoca `resolveNotificationSound`
- **THEN** SHALL devolver `'LoopingAlarm7'`

#### Scenario: SubagentStart en macOS usa equivalente a IM

- **GIVEN** `platform === 'darwin'`
- **AND** perfil de `SubagentStart`
- **WHEN** se invoca `resolveNotificationSound`
- **THEN** SHALL devolver `'Ping'`

#### Scenario: PermissionRequest en Linux solicita sonido best-effort

- **GIVEN** `platform === 'linux'`
- **AND** perfil de `PermissionRequest` del catálogo
- **WHEN** se invoca `resolveNotificationSound`
- **THEN** SHALL devolver `true`
- **AND** SHALL NOT devolver un string (p. ej. `'SMS'`)

#### Scenario: StopFailure en Linux solicita sonido best-effort sin token BurntToast

- **GIVEN** `platform === 'linux'`
- **AND** perfil de `StopFailure`
- **WHEN** se invoca `resolveNotificationSound`
- **THEN** SHALL devolver `true`
- **AND** SHALL NOT devolver `'LoopingAlarm7'`

---

### Requirement: Copia de PNGs por evento en `register --install`

Además de copiar `ai-assistant.ico` y `ai-assistant.png` a `%LOCALAPPDATA%\AIAssistant\`, el helper `register.ts` SHALL copiar cada `*.png` de `assets/notifications/events/` a `%LOCALAPPDATA%\AIAssistant\events\` (`STABLE_EVENTS_DIR`) durante `--install`, usando la misma estrategia idempotente por hash SHA-256 que los assets globales. El header del toast (registro `Icon` / `IconUri` / `IconLocation` del `.lnk`) SHALL seguir apuntando solo a los assets globales de marca, no a los PNG por evento.

La verificación de idempotencia de `--install` SHALL incluir los hashes de los PNG en `events/`: si el contenido en repo difiere del cache estable, SHALL recopiarse.

#### Scenario: `--install` copia PNGs de events al cache estable

- **GIVEN** `process.platform === 'win32'`
- **AND** existen `assets/notifications/events/stop.png` y `user-prompt-submit.png` en el repo
- **WHEN** se ejecuta `register --install`
- **THEN** SHALL existir `%LOCALAPPDATA%\AIAssistant\events\stop.png`
- **AND** SHALL existir `%LOCALAPPDATA%\AIAssistant\events\user-prompt-submit.png`

---

## MODIFIED Requirements

### Requirement: Tipo `NotificationEvent` mínimo

El sistema SHALL definir el tipo `NotificationEvent` en `src/2-services/notifications/types.ts` con exactamente cuatro campos requeridos/opcionales base (`title: string` requerido, `message: string` requerido, `sound?: boolean | string` opcional con default efectivo `false` cuando no se inyecta sonido, `silent?: boolean` opcional con default `false`) más dos campos opcionales de branding: `appId?: string` (identificador de aplicación, AUMID en Windows) e `icon?: string` (ruta a un asset de imagen usado como imagen del cuerpo del toast en Windows vía SnoreToast `-p`). El campo `sound` como `string` SHALL representar un token de sonido del SO (BurntToast en Windows, nombre nativo en macOS). En Linux el CLI SHALL inyectar `sound: boolean` (`true`/`false`), no strings BurntToast. El resto de campos de personalización SHALL seguir excluido (`image`, `contentImage`, `appIdPath`, `subtitle`, `category`, `urgency`, `timeout`, `wait`, `open`, `closeLabel`, `actions`, `heroImage`).

#### Scenario: `NotificationEvent` con `title` y `message` compila

- **GIVEN** un literal `{ title: 'Test', message: 'Hola' }`
- **WHEN** se le aplica el tipo `NotificationEvent`
- **THEN** SHALL compilar sin error

#### Scenario: `NotificationEvent` con `sound` y `silent` opcionales compila

- **GIVEN** un literal `{ title: 'Test', message: 'Hola', sound: true, silent: true }`
- **WHEN** se le aplica el tipo `NotificationEvent`
- **THEN** SHALL compilar sin error

#### Scenario: `NotificationEvent` con `appId` e `icon` opcionales compila

- **GIVEN** un literal `{ title: 'Test', message: 'Hola', appId: 'AIAssistant.Proxy', icon: '/path/to/icon.png' }`
- **WHEN** se le aplica el tipo `NotificationEvent`
- **THEN** SHALL compilar sin error

#### Scenario: `NotificationEvent` con `title` y `message` (sin `appId` ni `icon`) sigue compilando

- **GIVEN** un literal `{ title: 'Test', message: 'Hola' }` (sin campos de branding)
- **WHEN** se le aplica el tipo `NotificationEvent`
- **THEN** SHALL compilar sin error (compatibilidad hacia atrás preservada)

#### Scenario: `NotificationEvent` con `sound` string compila

- **GIVEN** un literal `{ title: 'Test', message: 'Hola', sound: 'SMS' }`
- **WHEN** se le aplica el tipo `NotificationEvent`
- **THEN** SHALL compilar sin error

#### Scenario: `NotificationEvent` con `sound` boolean compila

- **GIVEN** un literal `{ title: 'Test', message: 'Hola', sound: true }`
- **WHEN** se le aplica el tipo `NotificationEvent`
- **THEN** SHALL compilar sin error

#### Scenario: `NotificationEvent` rechaza campos de personalización excluidos

- **GIVEN** un literal `{ title: 'Test', message: 'Hola', contentImage: 'x' }`
- **WHEN** se le aplica el tipo `NotificationEvent`
- **THEN** SHALL fallar la compilación por exceso de propiedades (`contentImage` no existe en `NotificationEvent`)

---

### Requirement: `DesktopNotificationAdapter` delega en `node-notifier`

El sistema SHALL exponer `DesktopNotificationAdapter` en `src/2-services/notifications/DesktopNotificationAdapter.ts` que implemente `INotificationService`. La implementación SHALL invocar `node-notifier.notify()` pasando como opciones los campos `title`, `message`, `sound?` (tipo `boolean | string`, reenviado tal cual salvo `silent: true`), `wait: false` (por defecto, para no bloquear el CLI), y **únicamente cuando estén presentes en el evento** los campos `appID` (con mayúsculas, clave que `node-notifier` v10 reconoce para SnoreToast `-appID`) e `icon`. La traducción `appId` → `appID` SHALL ocurrir dentro del adaptador. Cuando `silent: true` esté presente en el evento, el adaptador SHALL forzar `sound: false`. El resto de campos de personalización SHALL seguir excluido: el adaptador NO SHALL pasar `contentImage`, `appIdPath`, `subtitle`, `category`, `urgency`, `actions`, `open`, `closeLabel`, `timeout` personalizados, `heroImage`, `defaultIcon` ni `brandTitle`. El adaptador SHALL NO acceder a archivos `.lnk` ni invocar `SnoreToast` directamente durante `notify`.

#### Scenario: `notify` con `title` y `message` (sin `appId` ni `icon`) → sin branding

- **GIVEN** una instancia de `DesktopNotificationAdapter`
- **AND** `node-notifier.notify` está mockeado
- **WHEN** se invoca `adapter.notify({ title: 'Hola', message: 'Mundo' })`
- **THEN** SHALL llamarse `nodeNotifier.notify` con un objeto cuyas claves pertenezcan al subset `{ title, message, sound?, wait }`
- **AND** el objeto SHALL NO contener la clave `appID`
- **AND** el objeto SHALL NO contener la clave `icon`
- **AND** el objeto SHALL NO contener la clave `contentImage`

#### Scenario: `notify` con `sound: 'SMS'` → `node-notifier.notify` recibe `sound: 'SMS'`

- **GIVEN** una instancia de `DesktopNotificationAdapter`
- **AND** `node-notifier.notify` está mockeado
- **WHEN** se invoca `adapter.notify({ title: 'Hola', message: 'Mundo', sound: 'SMS' })`
- **THEN** SHALL llamarse `nodeNotifier.notify` con un objeto que contiene `sound: 'SMS'`

#### Scenario: `notify` con `appId` e `icon` → `node-notifier.notify` recibe `appID` (mayúsculas) e `icon`

- **GIVEN** una instancia de `DesktopNotificationAdapter`
- **AND** `node-notifier.notify` está mockeado
- **WHEN** se invoca `adapter.notify({ title: 'Hola', message: 'Mundo', appId: 'AIAssistant.Proxy', icon: '/ruta/icon.png' })`
- **THEN** SHALL llamarse `nodeNotifier.notify` con un objeto que contiene `appID: 'AIAssistant.Proxy'`
- **AND** SHALL llamarse `nodeNotifier.notify` con un objeto que contiene `icon: '/ruta/icon.png'`
- **AND** el objeto SHALL seguir conteniendo `title: 'Hola'`, `message: 'Mundo'`, `sound` y `wait: false`

#### Scenario: `notify` con `sound: true` → `node-notifier.notify` invocado con `sound: true`

- **GIVEN** una instancia de `DesktopNotificationAdapter`
- **AND** `node-notifier.notify` está mockeado
- **WHEN** se invoca `adapter.notify({ title: 'Hola', message: 'Mundo', sound: true })`
- **THEN** SHALL llamarse `nodeNotifier.notify` con `sound: true` en sus opciones

#### Scenario: `notify` con `silent: true` → `node-notifier.notify` invocado con `sound: false`

- **GIVEN** una instancia de `DesktopNotificationAdapter`
- **AND** `node-notifier.notify` está mockeado
- **WHEN** se invoca `adapter.notify({ title: 'Hola', message: 'Mundo', silent: true })`
- **THEN** SHALL llamarse `nodeNotifier.notify` con `sound: false` en sus opciones
- **AND** SHALL NO llamarse a `nodeNotifier.notify` con `sound: true`

#### Scenario: El adaptador no accede a `.lnk` ni invoca `SnoreToast` durante `notify`

- **GIVEN** una instancia de `DesktopNotificationAdapter`
- **AND** `node-notifier.notify` está mockeado
- **WHEN** se invoca `adapter.notify({ title: 'Hola', message: 'Mundo', appId: 'AIAssistant.Proxy', icon: '/ruta/icon.png' })`
- **THEN** SHALL NO haberse invocado `SnoreToast` desde el adaptador
- **AND** SHALL NO haberse accedido a archivos `.lnk` desde el adaptador

---

### Requirement: Exclusiones explícitas de v1 (inventario de archivos)

El servicio SHALL NO incluir en `src/2-services/notifications/`:
- `config.ts` ni carga de `JSON` externo
- `builders.ts` (sin funciones builder separadas por tipo de evento; el catálogo tipado sustituye ese patrón)
- subdirectorio `sound/` ni archivos `.wav` versionados (los perfiles de sonido viven en `event-notification-profile.ts`, no en un módulo `sound/` OS-specific)
- `windows-toast.ts` (sin registro de SnoreToast, AUMID, `.lnk`, `heroImage` desde el adaptador)
- acceso a `C:\AI\` desde el servicio

El directorio SHALL contener EXACTAMENTE: `INotificationService.ts`, `DesktopNotificationAdapter.ts`, `types.ts`, `index.ts`, `cli.ts`, `register.ts`, `snoretoast-shortcut.ts`, `lnk-format.ts`, `registry.ts`, `asset-paths.ts`, `event-notification-profile.ts`, `event-image-paths.ts`, `resolve-notification-sound.ts`.

Los iconos de branding global SHALL vivir en `assets/notifications/ai-assistant.png` y `assets/notifications/ai-assistant.ico`. Las imágenes por evento SHALL vivir en `assets/notifications/events/*.png`.

#### Scenario: Inventario de archivos del directorio del servicio

- **GIVEN** el directorio `src/2-services/notifications/` del repositorio tras el change
- **WHEN** se enumeran sus archivos
- **THEN** SHALL existir `event-notification-profile.ts`, `event-image-paths.ts` y `resolve-notification-sound.ts`
- **AND** SHALL NO existir `builders.ts`, `config.ts`, ni subdirectorio `sound/`

#### Scenario: Assets por evento versionados fuera de `src/`

- **GIVEN** el repositorio tras el change
- **WHEN** se enumeran los PNG bajo `assets/notifications/events/`
- **THEN** SHALL existir los 11 archivos del catálogo (`user-prompt-submit.png` … `task-completed.png`)

---

### Requirement: Entry point CLI standalone

El sistema SHALL exponer un entry point CLI en `src/2-services/notifications/cli.ts` que parsee los argumentos `--event-type`, `--message`, `--title`, `--sound`, `--silent`, `--stdin-json`, `--app-id <id>` e `--icon <path>` (vía `commander`), construya un `NotificationEvent` a partir de ellos y delegue en una instancia de `DesktopNotificationAdapter`. Cuando `--stdin-json` esté presente, el CLI SHALL leer `process.stdin` completo, parsearlo como JSON, y derivar `title` del campo `hook_event_name` del payload. El CLI SHALL escribir un mensaje de error en `stderr` y terminar con código de salida 1 si el payload es inválido, si `--stdin-json` se invoca sin payload parseable, o si faltan los flags requeridos.

La clave de evento para perfiles SHALL resolverse como `options.eventType` si está presente; si no, `stdinPayload.hook_event_name` cuando `--stdin-json` esté activo.

Cuando `--app-id` no se proporcione, el CLI SHALL aplicar el default `AIAssistant.Proxy`. Cuando `--icon` no se proporcione, el CLI SHALL resolver la imagen del catálogo para la clave de evento (vía `resolveEventImagePath`); si no hay perfil o el archivo no existe, SHALL aplicar el fallback `ai-assistant.png` (estable o repo); si tampoco existe, SHALL omitir `icon` (degradación con gracia). Cuando `--silent` no esté presente y `--sound` no esté presente, el CLI SHALL aplicar el sonido del catálogo (vía `resolveNotificationSound`). Cuando `--silent` esté presente, SHALL forzar `sound: false`. Cuando `--sound` esté presente sin `--silent`, SHALL aplicar `sound: true` (override booleano del flag).

#### Scenario: CLI con `--event-type` y `--message` → toast emitido y exit 0

- **GIVEN** el CLI entry point del repo
- **AND** existen `assets/notifications/events/user-prompt-submit.png` y perfil `UserPromptSubmit`
- **WHEN** se invoca con `node cli.ts --event-type UserPromptSubmit --message "Hola"`
- **THEN** SHALL invocarse `DesktopNotificationAdapter.notify` con un evento que contiene `title: 'UserPromptSubmit'`, `message: 'Hola'`, `appId: 'AIAssistant.Proxy'` e `icon` resuelto a la ruta absoluta de `user-prompt-submit.png`
- **AND** SHALL terminar con código de salida 0

#### Scenario: CLI con `--stdin-json` y payload válido → toast emitido y exit 0

- **GIVEN** el CLI entry point del repo
- **AND** un payload `{ "hook_event_name": "Stop", "session_id": "abc" }` en `stdin`
- **AND** `--event-type Stop` en argv
- **WHEN** se invoca con `node cli.ts --stdin-json --event-type Stop`
- **THEN** SHALL invocarse `DesktopNotificationAdapter.notify` con un evento cuyo `title` se deriva de `hook_event_name` (`'Stop'`)
- **AND** el evento SHALL contener `appId: 'AIAssistant.Proxy'`
- **AND** el evento SHALL contener `icon` resuelto a `stop.png` cuando el archivo existe
- **AND** SHALL terminar con código de salida 0

#### Scenario: CLI con payload inválido → error en `stderr` y exit 1

- **GIVEN** el CLI entry point del repo
- **AND** `no-json` en `stdin` con `--stdin-json`
- **WHEN** se invoca el CLI
- **THEN** SHALL escribirse un mensaje de error en `stderr`
- **AND** SHALL terminar con código de salida 1

#### Scenario: CLI sin flags requeridos → error en `stderr` y exit 1

- **GIVEN** el CLI entry point del repo
- **WHEN** se invoca sin `--event-type` ni `--message` ni `--stdin-json`
- **THEN** SHALL escribirse un mensaje de error en `stderr`
- **AND** SHALL terminar con código de salida 1

#### Scenario: CLI con `--app-id` explícito override el default

- **GIVEN** el CLI entry point del repo
- **WHEN** se invoca con `--app-id "Custom.Id" --event-type Stop --message "Test"`
- **THEN** el evento pasado al adaptador SHALL contener `appId: 'Custom.Id'`
- **AND** SHALL NO contener `appId: 'AIAssistant.Proxy'`

#### Scenario: CLI degrada con gracia si el PNG del perfil y el fallback global no existen

- **GIVEN** el CLI entry point del repo
- **AND** no existe `assets/notifications/events/stop.png` ni `ai-assistant.png`
- **WHEN** se invoca sin `--icon` con `--event-type Stop --message "Test"`
- **THEN** el evento SHALL contener `appId: 'AIAssistant.Proxy'`
- **AND** SHALL NO contener la clave `icon`
- **AND** SHALL terminarse con código de salida 0

#### Scenario: CLI con `--event-type Stop` aplica imagen y sonido del perfil

- **GIVEN** el CLI entry point del repo
- **AND** existen `assets/notifications/events/stop.png` y perfil `Stop` en el catálogo
- **AND** invocación sin `--icon`, `--sound` ni `--silent`
- **WHEN** se invoca con `--event-type Stop --message "Test"`
- **THEN** el evento pasado al adaptador SHALL contener `icon` resuelto a la ruta absoluta de `stop.png`
- **AND** en `win32` SHALL contener `sound: 'IM'` (paridad legacy `TurnIdle`)
- **AND** en `linux` SHALL contener `sound: true` (mejor esfuerzo; no el string `'IM'`)

#### Scenario: CLI con `--icon` explícito override la imagen del perfil

- **GIVEN** el CLI entry point del repo
- **WHEN** se invoca con `--icon /tmp/custom.png --event-type Stop --message "Test"`
- **THEN** el evento SHALL contener `icon: '/tmp/custom.png'`
- **AND** SHALL NO usar la ruta del perfil `stop.png`

#### Scenario: CLI con `--silent` ignora sonido del perfil

- **GIVEN** el CLI entry point del repo
- **WHEN** se invoca con `--event-type StopFailure --message "Test" --silent`
- **THEN** el evento SHALL contener `sound: false`

#### Scenario: CLI con `--sound` fuerza sonido genérico y no el token del perfil

- **GIVEN** el CLI entry point del repo
- **WHEN** se invoca con `--event-type StopFailure --message "Test" --sound`
- **THEN** el evento SHALL contener `sound: true`
- **AND** SHALL NOT contener `sound: 'LoopingAlarm7'`
