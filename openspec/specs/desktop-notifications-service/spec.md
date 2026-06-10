# Spec: desktop-notifications-service

## Purpose

Define el contrato del servicio de notificaciones de escritorio bajo `src/2-services/notifications/`: puerto `INotificationService`, adaptador `DesktopNotificationAdapter`, CLI cross-platform, branding global (AUMID + icono de marca) y perfiles por evento (imagen de cuerpo + sonido multiplataforma desde catálogo tipado).

---

## Requirements

### Requirement: Puerto `INotificationService`

El sistema SHALL exponer un puerto `INotificationService` en `src/2-services/notifications/INotificationService.ts` con un único método `notify(event: NotificationEvent): Promise<void> | void`. El puerto SHALL no depender de ninguna librería de infraestructura: NO SHALL importar `node-notifier`, ni `fs`, ni `os`, ni `path` (fuera del scope del puerto), ni acceder a `C:\AI\` desde el módulo que define el puerto.

El branding (campos `appId` e `icon` del evento) NO es parte del contrato del puerto: la inyección de los valores por defecto se realiza por configuración de la CLI o del composition root, no por el puerto. Esto preserva la pureza del dominio y evita que el branding sea una preocupación cross-layer.

#### Scenario: El puerto no importa `node-notifier` ni `fs`

- **GIVEN** el archivo `src/2-services/notifications/INotificationService.ts` del repositorio
- **WHEN** se inspeccionan sus imports
- **THEN** SHALL no existir ningún import desde `node-notifier`
- **AND** SHALL no existir ningún import desde `fs`, `os` o `path`

#### Scenario: El puerto expone un único método público `notify`

- **GIVEN** el tipo `INotificationService`
- **WHEN** se enumeran sus miembros
- **THEN** SHALL existir exactamente un método: `notify(event: NotificationEvent)`
- **AND** SHALL no existir ningún otro método público

#### Scenario: El puerto no expone campos de branding en su signature

- **GIVEN** el tipo `INotificationService`
- **WHEN** se inspecciona la signature de `notify`
- **THEN** SHALL NO existir ningún parámetro ni opción relacionada con `appId` o `icon` en el puerto
- **AND** el branding SHALL inyectarse vía `NotificationEvent` o vía el constructor del adaptador, nunca vía el puerto

---

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

### Requirement: Resolución de ruta de imagen por evento

El sistema SHALL exponer `resolveEventImagePath(filename)` en `event-image-paths.ts`.

La función SHALL devolver `<repo-root>/assets/notifications/events/<filename>` si el archivo existe, o `undefined` si no existe.

`syncEventImageFromRepoIfStale` SHALL eliminarse del módulo. No existe mecanismo de cache ni copia entre repo y LOCALAPPDATA: el repo es la fuente directa en runtime.

#### Scenario: Devuelve la ruta del repo cuando el PNG existe

- **GIVEN** existe `assets/notifications/events/stop.png` en el repo
- **WHEN** se invoca `resolveEventImagePath('stop.png')`
- **THEN** SHALL devolver la ruta absoluta a `assets/notifications/events/stop.png`

#### Scenario: Devuelve `undefined` cuando el PNG no existe

- **GIVEN** no existe ningún archivo `missing.png` en `assets/notifications/events/`
- **WHEN** se invoca `resolveEventImagePath('missing.png')`
- **THEN** SHALL devolver `undefined`

#### Scenario: El comportamiento es idéntico en todas las plataformas

- **GIVEN** `process.platform === 'win32'` o `'darwin'` o `'linux'`
- **WHEN** se invoca `resolveEventImagePath('stop.png')`
- **THEN** SHALL devolver la misma ruta del repo independientemente de la plataforma

---

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

### Requirement: Assets versionados de imágenes por evento

Los archivos `assets/notifications/events/*.png` referenciados por `EVENT_NOTIFICATION_PROFILES` SHALL ser PNG **256×256**, **32-bit RGBA** (fondo transparente permitido), curados manualmente o con herramientas externas al servicio.

El header del toast (AUMID, `.lnk`, registro) SHALL seguir usando únicamente los assets globales `ai-assistant.ico` / `ai-assistant.png`, no los PNG por evento.

#### Scenario: Cada imagen del catálogo existe en events/

- **GIVEN** las 12 claves de `NOTIFICATION_EVENT_KEYS`
- **WHEN** se resuelve `getProfileForEvent(key).image` para cada clave
- **THEN** SHALL existir el archivo bajo `assets/notifications/events/` con ese nombre
- **AND** SHALL existir `assets/notifications/events/task-in-progress.png` para la nueva clave `TaskInProgress`

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

---

### Requirement: Tipo `NotificationEvent` mínimo

El sistema SHALL definir el tipo `NotificationEvent` en `src/2-services/notifications/types.ts` con exactamente cuatro campos requeridos/opcionales base (`title: string` requerido, `message: string` requerido, `sound?: boolean | string` opcional con default efectivo `false` cuando no se inyecta sonido, `silent?: boolean` opcional con default `false`) más dos campos opcionales de branding: `appId?: string` (identificador de aplicación, AUMID en Windows) e `icon?: string` (ruta a un asset de imagen usado como imagen del cuerpo del toast en Windows vía SnoreToast `-p`). El campo `sound` como `string` SHALL representar el valor que recibe `node-notifier` (en win32, strings `Notification.*` tras `resolveNotificationSound`; en macOS, nombres nativos del sistema). En Linux el CLI SHALL inyectar `sound: boolean`. El resto de campos de personalización SHALL seguir excluido (`image`, `contentImage`, `appIdPath`, `subtitle`, `category`, `urgency`, `timeout`, `wait`, `open`, `closeLabel`, `actions`, `heroImage`).

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
- **THEN** SHALL compilar sin error (backward compatibility preservada)

#### Scenario: `NotificationEvent` con `sound` string compila

- **GIVEN** un literal `{ title: 'Test', message: 'Hola', sound: 'SMS' }`
- **WHEN** se le aplica el tipo `NotificationEvent`
- **THEN** SHALL compilar sin error

#### Scenario: `NotificationEvent` rechaza campos de personalización excluidos

- **GIVEN** un literal `{ title: 'Test', message: 'Hola', contentImage: 'x' }`
- **WHEN** se le aplica el tipo `NotificationEvent`
- **THEN** SHALL fallar la compilación por exceso de propiedades (`contentImage` no existe en `NotificationEvent`)

---

### Requirement: `DesktopNotificationAdapter` delega en `node-notifier`

El sistema SHALL exponer `DesktopNotificationAdapter` en `src/2-services/notifications/DesktopNotificationAdapter.ts` que implemente `INotificationService`. La implementación SHALL invocar `node-notifier.notify()` pasando como opciones los campos `title`, `message`, `sound?` (tipo `boolean | string`, reenviado tal cual salvo `silent: true`), `wait: false` (por defecto, para no bloquear el CLI), y **únicamente cuando estén presentes en el evento** los campos `appID` (con mayúsculas, que es la clave que `node-notifier` v10 reconoce en `allowedToasterFlags` para reenviar a SnoreToast como `-appID`) e `icon`. La traducción desde `appId` (camelCase, dominio) a `appID` (mayúsculas, nomenclatura de `node-notifier`) SHALL ocurrir dentro del adaptador para preservar la API pública idiomática sin acoplar el dominio al quirk de nomenclatura. Cuando `silent: true` esté presente en el evento, el adaptador SHALL forzar `sound: false` en las opciones. El resto de campos de personalización SHALL seguir excluido: el adaptador NO SHALL pasar `contentImage`, `appIdPath`, `subtitle`, `category`, `urgency`, `actions`, `open`, `closeLabel`, `timeout` personalizados, `heroImage`, `defaultIcon` ni `brandTitle` a `node-notifier`. El adaptador en sí SHALL NO acceder a archivos `.lnk` ni invocar `SnoreToast` directamente; el helper de AUMID (`register.ts`, ver Requirement `Helper de registro de AUMID`) es el único responsable de esas operaciones y solo se ejecuta bajo invocación explícita del usuario, nunca en el flujo de `notify`.

#### Scenario: `notify` con `title` y `message` (sin `appId` ni `icon`) → `node-notifier.notify` invocado sin branding

- **GIVEN** una instancia de `DesktopNotificationAdapter`
- **AND** `node-notifier.notify` está mockeado
- **WHEN** se invoca `adapter.notify({ title: 'Hola', message: 'Mundo' })` (sin `appId` ni `icon`)
- **THEN** SHALL llamarse `nodeNotifier.notify` con un objeto cuyas claves pertenezcan al subset `{ title, message, sound?, wait }`
- **AND** el objeto pasado a `nodeNotifier.notify` SHALL NO contener la clave `appID`
- **AND** el objeto pasado a `nodeNotifier.notify` SHALL NO contener la clave `icon`
- **AND** el objeto pasado a `nodeNotifier.notify` SHALL NO contener la clave `contentImage`

#### Scenario: `notify` con `appId` y `icon` → `node-notifier.notify` recibe `appID` (mayúsculas) e `icon`

- **GIVEN** una instancia de `DesktopNotificationAdapter`
- **AND** `node-notifier.notify` está mockeado
- **WHEN** se invoca `adapter.notify({ title: 'Hola', message: 'Mundo', appId: 'AIAssistant.Proxy', icon: '/ruta/icon.png' })`
- **THEN** SHALL llamarse `nodeNotifier.notify` con un objeto que contiene `appID: 'AIAssistant.Proxy'` (clave con mayúsculas que `node-notifier` reenvía a SnoreToast como `-appID`)
- **AND** el objeto SHALL NO contener la clave `appId` (camelCase, del dominio)
- **AND** SHALL llamarse `nodeNotifier.notify` con un objeto que contiene `icon: '/ruta/icon.png'`
- **AND** el objeto SHALL seguir conteniendo `title: 'Hola'`, `message: 'Mundo'`, `sound` y `wait: false`

#### Scenario: `notify` con `sound: true` → `node-notifier.notify` invocado con `sound: true`

- **GIVEN** una instancia de `DesktopNotificationAdapter`
- **AND** `node-notifier.notify` está mockeado
- **WHEN** se invoca `adapter.notify({ title: 'Hola', message: 'Mundo', sound: true })`
- **THEN** SHALL llamarse `nodeNotifier.notify` con `sound: true` en sus opciones

#### Scenario: `notify` con `sound: 'SMS'` → `node-notifier.notify` recibe `sound: 'SMS'`

- **GIVEN** una instancia de `DesktopNotificationAdapter`
- **AND** `node-notifier.notify` está mockeado
- **WHEN** se invoca `adapter.notify({ title: 'Hola', message: 'Mundo', sound: 'SMS' })`
- **THEN** SHALL llamarse `nodeNotifier.notify` con un objeto que contiene `sound: 'SMS'`

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
- **AND** SHALL NO haberse invocado `RegisterApplicationRestart` ni `RegisterApplication` con un AUMID desde el adaptador
- **AND** las únicas llamadas externas SHALL ser `node-notifier.notify` y, eventualmente, `path.resolve`/`fs.existsSync` cuando se resuelva el icono por defecto en el composition root (no en el adaptador)

---

### Requirement: Exclusiones explícitas de v1 (inventario de archivos)

El servicio SHALL NO incluir en `src/2-services/notifications/`:

- `config.ts` ni carga de `JSON` externo (p. ej. `notifications-config.json`)
- **`builders.ts`** (nombre reservado al legacy externo `C:\AI\`; no reintroducir)
- subdirectorio `sound/` ni archivos `.wav` versionados
- `windows-toast.ts` (sin registro SnoreToast/AUMID desde el adaptador)
- acceso a `C:\AI\` desde el servicio
- **`asset-paths.ts`** (abstracción eliminada en este change; no reintroducir)

El servicio **SHALL** incluir `hook-payload-notification-message.ts` para derivar el **cuerpo** del toast desde el payload JSON de hooks cuando `--stdin-json` esté activo y exista formatter para el `eventKey` resuelto. Ese módulo sustituye la función de mensaje dinámico que cumplía `builders.ts` en el stack externo; **no** sustituye el catálogo para título, imagen ni sonido.

El directorio SHALL contener como mínimo los módulos obligatorios listados en el requirement homónimo de esta spec, **más** `hook-payload-notification-message.ts`.

El directorio **MAY** incluir además módulos opcionales de **mantenimiento de assets** (no invocados por `cli.ts` ni `register.ts` en runtime): `toast-body-image-spec.ts`, `event-image-overlays.ts`, `event-notification-image.ts`.

Los iconos de branding global SHALL vivir en `assets/notifications/ai-assistant.png` y `assets/notifications/ai-assistant.ico`. Las imágenes por evento SHALL vivir en `assets/notifications/events/*.png`.

#### Scenario: Inventario incluye formatters de payload, excluye builders.ts y asset-paths.ts

- **GIVEN** el directorio `src/2-services/notifications/`
- **WHEN** se enumeran archivos `.ts` en la raíz
- **THEN** SHALL existir `hook-payload-notification-message.ts`
- **AND** SHALL existir `toast-body-image-spec.ts`, `event-image-overlays.ts` y `event-notification-image.ts`
- **AND** SHALL NOT existir `builders.ts`
- **AND** SHALL NOT existir `config.ts`
- **AND** SHALL NOT existir `asset-paths.ts`
- **AND** SHALL NO existir subdirectorio `sound/`, ni `windows-toast.ts`
- **AND** SHALL NO existir ningún archivo `.lnk` dentro de `src/`, ni `.json` de configuración, ni script `.ps1`

#### Scenario: Assets de icono versionados fuera de `src/`

- **GIVEN** el repositorio tras el change
- **WHEN** se enumeran los assets de branding
- **THEN** SHALL existir `assets/notifications/ai-assistant.png` (PNG, 256×256, 32-bit RGBA)
- **AND** SHALL existir `assets/notifications/ai-assistant.ico` (ICO multi-resolución: 16/32/48/64/128/256)
- **AND** SHALL NO existir ningún asset de branding dentro de `src/`

---

### Requirement: Entry point CLI standalone

El sistema SHALL exponer un entry point CLI en `src/2-services/notifications/cli.ts` que parsee los argumentos `--event-type`, `--message`, `--title`, `--sound`, `--silent`, `--stdin-json`, `--app-id <id>` e `--icon <path>` (vía `commander`), construya un `NotificationEvent` y delegue en `DesktopNotificationAdapter`.

Cuando `--stdin-json` esté presente, el CLI SHALL leer `process.stdin` completo, parsearlo como JSON objeto, y usar el payload junto con el `eventKey` resuelto para copy dinámico.

**Resolución de `eventKey` para perfiles y formatters:** `options.eventType` si está presente; si no, `stdinPayload.hook_event_name` cuando `--stdin-json` esté activo.

**Resolución de `title` en `buildEvent`:**

1. Si `--title` está presente en CLI → usar ese valor.
2. Si no → el `eventKey` resuelto (`options.eventType` o `stdinPayload.hook_event_name`).
3. Si no hay `eventKey` → degradación a `'AI Assistant'` (`NOTIFICATION_BRAND_TITLE`).
4. La marca «AI Assistant» en el header del toast proviene del AUMID; el título del cuerpo SHALL NOT repetirla por defecto.

**Resolución de `message` en `buildEvent`:**

1. Si `--message` está presente en CLI → usar ese valor.
2. Si no y `--stdin-json` con payload válido → invocar `resolveHookNotificationMessage(eventKey, payload)`; si devuelve string no vacío, usarlo.
3. Si no → `profile.message` del catálogo para el `eventKey` resuelto.
4. El CLI SHALL NOT concatenar `hook_event_name` y `session_id` como mensaje por defecto.

Branding (`appId`, `icon`) y sonido SHALL seguir las reglas existentes (`resolveBranding`, `resolveEventSound`, overrides `--silent` / `--sound`). Cuando `--app-id` no se proporcione, el CLI SHALL aplicar el default `AIAssistant.Proxy`. Cuando `--icon` no se proporcione, el CLI SHALL resolver la imagen del catálogo para la clave de evento (vía `resolveEventImagePath`); si no hay perfil o el archivo no existe, SHALL aplicar el fallback `ai-assistant.png` desde el repo; si tampoco existe, SHALL omitir `icon` (degradación con gracia).

El CLI SHALL escribir un mensaje de error en `stderr` y terminar con código de salida 1 si el payload es inválido con `--stdin-json`, o si no puede derivarse un mensaje válido (sin `--message`, sin formatter aplicable y sin `profile.message`).

#### Scenario: CLI con `--event-type` y `--message` override → usa mensaje explícito

- **GIVEN** el CLI con perfil `Stop` en catálogo
- **WHEN** se invoca con `--event-type Stop --message "Prueba manual"`
- **THEN** el evento SHALL tener `message: 'Prueba manual'`
- **AND** `title` SHALL ser `'Stop'` salvo `--title` explícito

#### Scenario: CLI StopFailure con stdin y error rate_limit → mensaje dinámico

- **GIVEN** payload stdin `{ "hook_event_name": "StopFailure", "error": "rate_limit", "last_assistant_message": "Texto del asistente" }`
- **WHEN** se invoca con `--event-type StopFailure --stdin-json`
- **THEN** el evento SHALL tener `title: 'StopFailure'`
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

---

### Requirement: Relay `Stop` desde scripting (toast único con mensaje de continuidad)

En el proyecto Smart Code Proxy, el flujo UX del hook `Stop` SHALL delegarse en `scripting/stop-hook-ux.ts`, que importa `buildEvent` y `DesktopNotificationAdapter` desde `src/2-services/notifications/` (mismo contrato de `NotificationEvent` que el CLI).

El relay SHALL emitir **un único toast** por ejecución:

| Título | Cuerpo | Sonido |
| --- | --- | --- |
| `"Stop"` (`eventKey` sin override) | Preview truncado (≤ 250 chars) del mensaje de continuidad; si no hay mensaje generado: fallback al texto fuente truncado; si no hay texto fuente: copy del catálogo para `Stop` | Según catálogo `Stop` |

La lógica de generación del mensaje de continuidad SHALL vivir en `scripting/stop-work-summary-notification.ts` (función `runContinuityNotification`). La función `notifyStopTurnFinished()` SHALL ser eliminada. El orquestador `scripting/stop-hook-ux.ts` SHALL invocar `POST /hooks` antes del toast (ver `hooks-lifecycle-correlation`).

El texto completo del mensaje de continuidad SHALL persistirse en `sessions/.last-continuity-message.txt` antes de emitir el toast. Ver spec `stop-hook-continuity-message` para el contrato completo de generación y persistencia.

Este requirement NO modifica el contrato del CLI standalone: instalaciones globales (`install:notifications`) y otros hooks del lifecycle siguen usando `cli.ts` directamente.

#### Scenario: Toast único usa mensaje de continuidad generado

- **GIVEN** `runContinuityNotification` genera un mensaje de continuidad no vacío
- **WHEN** se construye el evento del toast vía `buildEvent({ eventType: 'Stop', message: preview, stdinJson: false })`
- **THEN** `title` SHALL ser `'Stop'`
- **AND** `message` SHALL ser el preview truncado (≤ 250 chars) del mensaje de continuidad
- **AND** el branding (`appId`, icono de perfil `Stop`) SHALL aplicarse vía `buildEvent` con `eventType: 'Stop'`

#### Scenario: Sin texto generado → fallback al texto fuente

- **GIVEN** que `generateContinuityMessage` devuelve `undefined` (sin API key o fallo)
- **AND** existe texto fuente (`last_assistant_message` o transcript)
- **WHEN** se construye el evento del toast
- **THEN** `message` SHALL ser `fallbackSummary(assistantText)` (texto normalizado truncado)
- **AND** `title` SHALL ser `'Stop'`

#### Scenario: Sin texto fuente → copy del catálogo

- **GIVEN** que no hay texto fuente disponible (stdin vacío, sin `last_assistant_message`, sin transcript legible)
- **WHEN** se construye el evento del toast
- **THEN** `message` SHALL ser el copy del catálogo para `Stop` («Tu turno — El asistente terminó. Escribe tu siguiente mensaje.»)
- **AND** `title` SHALL ser `'Stop'`

#### Scenario: CLI con payload inválido → error en stderr y exit 1

- **GIVEN** `no-json` en stdin con `--stdin-json`
- **WHEN** se invoca el CLI
- **THEN** SHALL escribirse un mensaje de error en `stderr`
- **AND** SHALL terminar con código de salida 1

#### Scenario: CLI sin flags de branding aplica defaults

- **GIVEN** el CLI entry point del repo
- **AND** invocación sin `--app-id` ni `--icon`
- **AND** el archivo `assets/notifications/ai-assistant.png` existe en disco
- **WHEN** se invoca el CLI con flags requeridos (`--event-type Stop --message "Test"`)
- **THEN** el evento pasado al adaptador SHALL contener `appId: 'AIAssistant.Proxy'`
- **AND** SHALL contener `icon: <ruta absoluta al .png>` resuelta con `path.resolve` desde `import.meta.url`

#### Scenario: CLI con `--app-id` explícito override el default

- **GIVEN** el CLI entry point del repo
- **WHEN** se invoca con `--app-id "Custom.Id" --event-type Stop --message "Test"`
- **THEN** el evento pasado al adaptador SHALL contener `appId: 'Custom.Id'`

---

### Requirement: Lectura de stdin UTF-8 en el CLI de notificaciones

Cuando el entry point `src/2-services/notifications/cli.ts` lee el payload del hook con `--stdin-json`, SHALL acumular stdin como `Buffer` y decodificarlo con `toString('utf-8')` antes de `JSON.parse` y `normalizeStdinJsonText`.

#### Scenario: Payload con tildes en `prompt` se parsea correctamente

- **GIVEN** stdin contiene JSON UTF-8 válido con `prompt` que incluye «sesión» y «configuración»
- **WHEN** se invoca `cli.ts --event-type UserPromptSubmit --stdin-json`
- **THEN** `resolveNotificationMessage` SHALL devolver esas cadenas sin mojibake (`Ã`, `â€`)

---

### Requirement: Relays scripting que delegan en el mismo contrato que el CLI

El repositorio SHALL exponer **un único** relay en `scripting/` que reenvía el payload al gateway:

| Módulo | Eventos | Secuencia |
|--------|---------|-----------|
| `post-hook-event.ts` | Los **13** eventos gestionados por SCP (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `Stop`, `StopFailure`, `SessionStart`, `SessionEnd`, `PermissionRequest`, `TaskCreated`, `TaskCompleted`) | stdin → `POST /hooks` (el gateway decide todos los efectos: toast, TTS, audit) |

Los relays antiguos `gateway-hook-notify.ts` y `pre-tool-use-hook-ux.ts` se eliminaron en el change `consolidate-hooks-in-gateway`. Sus lógicas de formateo y filtrado migraron al gateway, que ahora es el único punto que decide qué toast emitir y qué voz sintetizar.

Este relay SHALL leer stdin con el mismo criterio UTF-8 que `post-hook-event.ts` (`readStdinBuffer` + `utf-8`).

#### Scenario: Caracteres españoles en formatter PreToolUse

- **GIVEN** payload con `tool_input.questions[0].question` = «¿Usamos configuración regional?»
- **WHEN** el gateway procesa el evento `PreToolUse` con `toolName: 'AskUserQuestion'` y construye el mensaje vía `formatPreToolUseAskMessage`
- **THEN** el resultado SHALL contener «configuración» correctamente

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

### Requirement: Helper de registro de AUMID

El sistema SHALL exponer un entry point `src/2-services/notifications/register.ts` que permita registrar, desregistrar y consultar el **AUMID** (Application User Model ID) de la app en Windows, para que las notificaciones firmadas por SnoreToast aparezcan con la marca "AI Assistant" en lugar de "SnoreToast". El helper SHALL ser invocable desde CLI con los subcomandos `--install`, `--uninstall` y `--status` (vía `commander`), SHALL ser **idempotente** (`--install` es no-op si el `.lnk` ya tiene el AUMID correcto; `--uninstall` es no-op si el `.lnk` no existe), y SHALL ser **no-op con mensaje informativo en macOS y Linux** (el AUMID es un concepto Windows-only; en Mac/Linux el branding se aplica vía `appName` en `node-notifier` y no requiere registro).

El `.lnk` SHALL crearse en `%APPDATA%\Microsoft\Windows\Start Menu\Programs\AI Assistant.lnk` con las propiedades `AppUserModelID: "AIAssistant.Proxy"`, `DisplayName: "AI Assistant"`, `IconLocation: <repo-icon-path>,1` donde `<repo-icon-path>` es la ruta absoluta a `assets/notifications/ai-assistant.ico` en el repo (frame 32×32; se usa la ruta del repo directamente, sin copia a LOCALAPPDATA). El helper SHALL orquestar tres módulos:

- **`lnk-format.ts`** (TypeScript puro, bounds-checked, sin subprocess): generador `buildShortcutBytes` y parsers `parseAppUserModelId` / `parseIconLocation` que operan sobre el formato [MS-SHLLINK](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-shllink/) (Shell Link Binary File Format), usando el bloque `APP_USER_MODEL_ID` (signature `0xA0000005`, introducido en Windows 7) en los `ExtraData` del archivo. Expone también `patchIconLocation(bytes, location)` para reescribir el bloque `IconLocation` de un `.lnk` ya creado. Las operaciones de `Buffer` son bounds-checked por Node.js (no hay riesgo de buffer overflow).
- **`snoretoast-shortcut.ts`** (orquestador de subprocess): encapsula el flujo `installSnoreToastShortcut(lnkFileName, targetExe, aumid, lnkPath, iconLocation)` que invoca `snoretoast-x64.exe -install` (binario vendor de `node-notifier`, localizado vía `getSnoreToastPath()`) para crear el `.lnk` con la metadata que Windows espera para AUMID custom (`IPropertyStore` con AUMID + `ToastActivatorCLSID`, registro del CLSID del activador en `HKCU`). Tras SnoreToast, parchea el `IconLocation` del `.lnk` con `patchIconLocation` para apuntar al `.ico` del repo (SnoreToast no asigna `IconLocation`, así que el header del toast heredaría el icono de `snoretoast.exe` sin este parche).
- **`registry.ts`** (wrapper de `reg.exe`): expone `readRegistry(aumid)`, `writeRegistry(aumid, displayName, iconIcoPath, iconUriPath)` y `deleteRegistry(aumid)`. `reg.exe` es un binario built-in de Windows, NO PowerShell ni un lenguaje de scripting. Se invoca vía `child_process.execFile` (sin shell, args pasados directamente al binario). Las operaciones son idempotentes (`reg add ... /f`, `reg delete ... /f`).

El target del `.lnk` es la propia ruta de `snoretoast-x64.exe` (mismo criterio que el README de SnoreToast: lo que importa para Windows es que el AUMID esté registrado y haya un target resoluble; el target no se ejecuta).

Adicionalmente, el helper SHALL registrar el AUMID en el registro de Windows para garantizar efecto inmediato (sin esperar a que el shell indexe el `.lnk` en el Start Menu cache):

- Clave: `HKCU\Software\Classes\AppUserModelId\AIAssistant.Proxy`
- Valores:
  - `DisplayName` (REG_SZ) = `"AI Assistant"`
  - `Icon` (REG_EXPAND_SZ) = ruta al `.ico` del repo (ruta directa al repo sin copia a LOCALAPPDATA)
  - `IconUri` (REG_SZ) = ruta al `.png` del repo (logo del header del toast en WinRT)
  - `IconBackgroundColor` (REG_SZ) = `0`
  - `ShowInSettings` (REG_DWORD) = `0`
  - `ShortcutEngine` (REG_SZ) = `"snoretoast"` — marca que identifica qué motor creó el `.lnk`; la idempotencia del registro exige que el valor actual coincida con `SHORTCUT_ENGINE_SNORETOAST` para considerar la clave "OK" y evitar falsos positivos al migrar de un motor de `.lnk` distinto.
- Implementación: el helper SHALL invocar `reg.exe` (binario built-in de Windows, NO PowerShell, NO un lenguaje de scripting) vía `child_process.execFile` (sin shell, args pasados directamente al binario). El módulo `registry.ts` SHALL encapsular las tres operaciones: `readRegistry(aumid)`, `writeRegistry(aumid, displayName, iconIcoPath, iconUriPath)`, `deleteRegistry(aumid)`. Las invocaciones SHALL ser idempotentes (`reg add ... /f`, `reg delete ... /f`).

`--install` SHALL ser idempotente: si el `.lnk` (verificable vía `parseAppUserModelId` **y** `parseIconLocation` contra `<repo-icon-path>,1`) y la clave de registro (`Icon` + `IconUri` apuntando a las rutas del repo) coinciden con los valores esperados, SHALL ser no-op. La verificación de idempotencia es **granular**: si solo el `IconLocation` es obsoleto (p. ej. el `.lnk` apunta a la ruta de LOCALAPPDATA en vez de la del repo), se reescribe el `.lnk` aunque el AUMID siga correcto; si uno de los dos sitios está mal, SHALL reparar solo el que esté mal. `--uninstall` SHALL borrar ambos sitios (no-op si ya no existen). `--status` SHALL reportar el estado de ambos sitios: `registered` (ambos OK), `partially registered` (uno de los dos falta o es incorrecto), o `not registered` (ninguno).

El AUMID SHALL validarse con la regex `/^[A-Za-z0-9.\-]{1,129}$/` (longitud máxima Windows y caracteres permitidos); AUMID inválido SHALL rechazarse con exit 1 y mensaje en `stderr`.

El helper SHALL ser invocable vía el script npm `npm run notifications:register -- --install` (y análogamente para `--uninstall` y `--status`). El CLI principal (`cli.ts`) NO SHALL invocar este helper automáticamente: el registro es opt-in por decisión del usuario.

#### Scenario: `register --install` en Windows crea el `.lnk` con el AUMID correcto

- **GIVEN** `process.platform === 'win32'`
- **AND** el archivo `%APPDATA%\Microsoft\Windows\Start Menu\Programs\AI Assistant.lnk` no existe
- **WHEN** se ejecuta `register --install`
- **THEN** SHALL crearse el `.lnk` en `%APPDATA%\Microsoft\Windows\Start Menu\Programs\AI Assistant.lnk`
- **AND** SHALL tener `AppUserModelID = "AIAssistant.Proxy"`
- **AND** SHALL tener `DisplayName = "AI Assistant"`
- **AND** SHALL tener `IconLocation = <repo-icon-path>,1` (ruta absoluta a `assets/notifications/ai-assistant.ico` en el repo)
- **AND** SHALL terminar con código de salida 0

#### Scenario: `register --install` es idempotente cuando el `.lnk` ya tiene el AUMID y el IconLocation correctos

- **GIVEN** `process.platform === 'win32'`
- **AND** el `.lnk` ya existe con `AppUserModelID = "AIAssistant.Proxy"` y `IconLocation = <repo-icon-path>,1`
- **WHEN** se ejecuta `register --install` (2ª vez)
- **THEN** SHALL NO reescribirse el `.lnk`
- **AND** SHALL imprimirse un mensaje informativo indicando que ya está registrado
- **AND** SHALL terminar con código de salida 0

#### Scenario: `register --install` reemplaza el `.lnk` cuando el AUMID es distinto

- **GIVEN** `process.platform === 'win32'`
- **AND** el `.lnk` existe con `AppUserModelID = "Otro.App"`
- **WHEN** se ejecuta `register --install`
- **THEN** SHALL reemplazarse el `.lnk` con `AppUserModelID = "AIAssistant.Proxy"`
- **AND** SHALL terminar con código de salida 0

#### Scenario: `register --install` repara (self-heals) un `.lnk` corrupto

- **GIVEN** `process.platform === 'win32'`
- **AND** el `.lnk` existe pero no es un archivo `.lnk` válido (bytes aleatorios, o un header corrupto, o sin bloque `APP_USER_MODEL_ID`)
- **WHEN** se ejecuta `register --install`
- **THEN** SHALL reescribirse el `.lnk` con un contenido válido cuyo `AppUserModelID = "AIAssistant.Proxy"` (verificable vía `parseAppUserModelId`)
- **AND** SHALL terminar con código de salida 0
- **AND** SHALL NO fallar silenciosamente: el archivo siempre termina en estado válido y consistente

#### Scenario: `register --install` repara el `.lnk` cuando el `IconLocation` apunta a una ruta obsoleta (LOCALAPPDATA)

- **GIVEN** `process.platform === 'win32'`
- **AND** el `.lnk` existe con `AppUserModelID = "AIAssistant.Proxy"` correcto
- **AND** su `IconLocation` apunta a `%LOCALAPPDATA%\AIAssistant\ai-assistant.ico,1` (ruta obsoleta de cache)
- **WHEN** se ejecuta `register --install`
- **THEN** SHALL reescribirse el `.lnk` con `IconLocation = <repo-icon-path>,1`
- **AND** SHALL terminar con código de salida 0

#### Scenario: `register --uninstall` borra el `.lnk`

- **GIVEN** `process.platform === 'win32'`
- **AND** el `.lnk` existe
- **WHEN** se ejecuta `register --uninstall`
- **THEN** SHALL eliminarse el `.lnk` con `fs.unlink`
- **AND** SHALL terminar con código de salida 0

#### Scenario: `register --uninstall` es idempotente cuando el `.lnk` no existe

- **GIVEN** `process.platform === 'win32'`
- **AND** el `.lnk` no existe
- **WHEN** se ejecuta `register --uninstall` (2ª vez)
- **THEN** SHALL NO lanzarse error
- **AND** SHALL terminar con código de salida 0 (la operación se considera ya completada)

#### Scenario: `register --status` reporta AUMID registrado

- **GIVEN** `process.platform === 'win32'`
- **AND** el `.lnk` existe con `AppUserModelID = "AIAssistant.Proxy"`
- **WHEN** se ejecuta `register --status`
- **THEN** SHALL imprimirse un mensaje indicando estado "registered" con el AUMID y el `DisplayName`
- **AND** SHALL terminar con código de salida 0

#### Scenario: `register --status` reporta no registrado

- **GIVEN** `process.platform === 'win32'`
- **AND** el `.lnk` no existe
- **WHEN** se ejecuta `register --status`
- **THEN** SHALL imprimirse el mensaje "not registered. Ejecuta `npm run notifications:register -- --install` para habilitar el branding en Windows"
- **AND** SHALL terminar con código de salida 0

#### Scenario: `register` en macOS/Linux es no-op con mensaje informativo

- **GIVEN** `process.platform !== 'win32'`
- **WHEN** se ejecuta cualquier subcomando (`--install`, `--uninstall` o `--status`)
- **THEN** SHALL imprimirse el mensaje "AUMID setup is Windows-only. En macOS/Linux el branding se aplica via `appName` en node-notifier (sin registro)."
- **AND** SHALL terminar con código de salida 0
- **AND** SHALL NO accederse a `%APPDATA%` ni crearse archivos `.lnk`

#### Scenario: `register` rechaza AUMID con formato inválido

- **GIVEN** `process.platform === 'win32'`
- **AND** se intenta usar un AUMID con caracteres no permitidos o longitud mayor a 129 (p. ej. mediante variable de entorno `AI_ASSISTANT_AUMID` o flag explícito)
- **WHEN** se ejecuta `register --install`
- **THEN** SHALL imprimirse un mensaje de error en `stderr` indicando el formato inválido
- **AND** SHALL terminar con código de salida 1
- **AND** SHALL NO crearse ni modificarse el `.lnk`

---

### Requirement: `package.json` declara `node-notifier` y `commander` como dependencias

El sistema SHALL listar `node-notifier` como `dependency` (nueva) y `commander` como `dependency` (promovida desde `devDependencies`, donde ya figuraba por su uso en `scripting/`) en `package.json`. La primera SHALL permitir que el adaptador (`DesktopNotificationAdapter`) invoque `node-notifier` en producción; la segunda SHALL permitir que el CLI (`cli.ts`) parsee los flags de `argv`.

#### Scenario: `node-notifier` y `commander` en `dependencies` de `package.json`

- **GIVEN** el `package.json` del repositorio tras N1
- **WHEN** se inspecciona la sección `dependencies`
- **THEN** SHALL existir la entrada `node-notifier` con una versión válida
- **AND** SHALL existir la entrada `commander` con una versión válida
- **AND** SHALL NO existir `commander` en `devDependencies` (fue promovida)
