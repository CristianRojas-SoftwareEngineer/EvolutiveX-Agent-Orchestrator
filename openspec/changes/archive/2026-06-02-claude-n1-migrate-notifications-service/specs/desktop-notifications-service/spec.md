# Spec: desktop-notifications-service

## Purpose

Define el contrato del servicio de notificaciones de escritorio migrado al repositorio bajo `src/2-services/notifications/`: el puerto `INotificationService` (capa 1 PKA), el adaptador concreto `DesktopNotificationAdapter` (capa 2 PKA, que delega en `node-notifier`) y el entry point CLI cross-platform. La primera versión descarta intencionalmente la personalización (icono, AUMID, branding) y las dependencias Windows-specific para mantener una superficie mínima, testeable y portable.

---

## ADDED Requirements

### Requirement: Puerto `INotificationService`

El sistema SHALL exponer un puerto `INotificationService` en `src/2-services/notifications/INotificationService.ts` con un único método `notify(event: NotificationEvent): Promise<void> | void`. El puerto SHALL no depender de ninguna librería de infraestructura: NO SHALL importar `node-notifier`, ni `fs`, ni `os`, ni `path` (fuera del scope del puerto), ni acceder a `C:\AI\` desde el módulo que define el puerto.

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

---

### Requirement: Tipo `NotificationEvent` mínimo

El sistema SHALL definir el tipo `NotificationEvent` en `src/2-services/notifications/types.ts` con exactamente cuatro campos: `title: string` (requerido), `message: string` (requerido), `sound?: boolean` (opcional, default `false`), `silent?: boolean` (opcional, default `false`). El tipo SHALL NO exponer `icon`, `image`, `contentImage`, `appId`, `appIdPath`, `subtitle`, `category`, `urgency`, `timeout`, `wait`, `open`, `closeLabel`, `actions`, ni `heroImage`.

#### Scenario: `NotificationEvent` con `title` y `message` compila

- **GIVEN** un literal `{ title: 'Test', message: 'Hola' }`
- **WHEN** se le aplica el tipo `NotificationEvent`
- **THEN** SHALL compilar sin error

#### Scenario: `NotificationEvent` con `sound` y `silent` opcionales compila

- **GIVEN** un literal `{ title: 'Test', message: 'Hola', sound: true, silent: true }`
- **WHEN** se le aplica el tipo `NotificationEvent`
- **THEN** SHALL compilar sin error

#### Scenario: `NotificationEvent` rechaza campos de personalización

- **GIVEN** un literal `{ title: 'Test', message: 'Hola', icon: '/path.png' }`
- **WHEN** se le aplica el tipo `NotificationEvent`
- **THEN** SHALL fallar la compilación por exceso de propiedades (`icon` no existe en `NotificationEvent`)

---

### Requirement: `DesktopNotificationAdapter` delega en `node-notifier` sin personalización

El sistema SHALL exponer `DesktopNotificationAdapter` en `src/2-services/notifications/DesktopNotificationAdapter.ts` que implemente `INotificationService`. La implementación SHALL invocar `node-notifier.notify()` pasando como opciones únicamente los campos `title`, `message` y, cuando aplique, `sound` y `wait: false` (por defecto, para no bloquear el CLI). Cuando `silent: true` esté presente en el evento, el adaptador SHALL forzar `sound: false` en las opciones. El adaptador SHALL NO pasar `icon`, `contentImage`, `appId`, `appIdPath`, `subtitle`, `category`, `urgency`, `actions`, `open`, `closeLabel`, `timeout` personalizados, `heroImage`, `defaultIcon` ni `brandTitle` a `node-notifier`. El adaptador SHALL NO invocar `SnoreToast`, NO SHALL acceder a archivos `.lnk`, y NO SHALL registrar AUMID.

#### Scenario: `notify` con `title` y `message` → `node-notifier.notify` invocado sin `icon`

- **GIVEN** una instancia de `DesktopNotificationAdapter`
- **AND** `node-notifier.notify` está mockeado
- **WHEN** se invoca `adapter.notify({ title: 'Hola', message: 'Mundo' })`
- **THEN** SHALL llamarse `nodeNotifier.notify` con un objeto cuyas claves pertenezcan al subset `{ title, message, sound?, wait }`
- **AND** el objeto pasado a `nodeNotifier.notify` SHALL NO contener la clave `icon` (ni `contentImage`, ni `appId`)

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

#### Scenario: El adaptador no invoca `SnoreToast` ni accede a `.lnk`

- **GIVEN** una instancia de `DesktopNotificationAdapter`
- **WHEN** se invoca `adapter.notify({ title: 'Hola', message: 'Mundo' })`
- **THEN** SHALL NO haberse invocado `SnoreToast` desde el adaptador
- **AND** SHALL NO haberse accedido a archivos `.lnk` desde el adaptador
- **AND** SHALL NO haberse invocado `RegisterApplicationRestart` ni `RegisterApplication` con un AUMID

---

### Requirement: Exclusiones explícitas de v1 (inventario de archivos)

El servicio SHALL NO incluir en `src/2-services/notifications/`:
- `config.ts` ni carga de `JSON` externo
- `builders.ts` (sin lógica de construcción específica por tipo de evento)
- subdirectorio `sound/` ni perfiles de sonido OS-specific
- `windows-toast.ts` (sin registro de SnoreToast, AUMID, `.lnk`, `heroImage`)
- acceso a `C:\AI\` desde el servicio

El directorio SHALL contener EXACTAMENTE: `INotificationService.ts`, `DesktopNotificationAdapter.ts`, `types.ts`, `index.ts`, `cli.ts`.

#### Scenario: Inventario de archivos del directorio del servicio

- **GIVEN** el directorio `src/2-services/notifications/` del repositorio tras N1
- **WHEN** se enumeran sus archivos
- **THEN** SHALL existir exactamente: `INotificationService.ts`, `DesktopNotificationAdapter.ts`, `types.ts`, `index.ts`, `cli.ts`
- **AND** SHALL NO existir `config.ts`, `builders.ts`, ni subdirectorio `sound/`, ni `windows-toast.ts`
- **AND** SHALL NO existir ningún archivo `.lnk`, `.json` de configuración, ni script `.ps1`

---

### Requirement: Entry point CLI standalone

El sistema SHALL exponer un entry point CLI en `src/2-services/notifications/cli.ts` que parsee los argumentos `--event-type`, `--message`, `--title`, `--sound`, `--silent` y `--stdin-json` (vía `commander`), construya un `NotificationEvent` a partir de ellos y delegue en una instancia de `DesktopNotificationAdapter`. Cuando `--stdin-json` esté presente, el CLI SHALL leer `process.stdin` completo, parsearlo como JSON, y derivar `title` del campo `hook_event_name` del payload. El CLI SHALL escribir un mensaje de error en `stderr` y terminar con código de salida 1 si el payload es inválido, si `--stdin-json` se invoca sin payload parseable, o si faltan los flags requeridos.

#### Scenario: CLI con `--event-type` y `--message` → toast emitido y exit 0

- **GIVEN** el CLI entry point del repo
- **WHEN** se invoca con `node cli.ts --event-type UserPromptSubmit --message "Hola"`
- **THEN** SHALL invocarse `DesktopNotificationAdapter.notify({ title: 'UserPromptSubmit', message: 'Hola' })`
- **AND** SHALL terminar con código de salida 0

#### Scenario: CLI con `--stdin-json` y payload válido → toast emitido y exit 0

- **GIVEN** el CLI entry point del repo
- **AND** un payload `{ "hook_event_name": "Stop", "session_id": "abc" }` en `stdin`
- **WHEN** se invoca con `node cli.ts --stdin-json < payload.json`
- **THEN** SHALL invocarse `DesktopNotificationAdapter.notify({ title: 'Stop', message: <derivado del payload> })`
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

---

### Requirement: `package.json` declara `node-notifier` y `commander` como dependencias

El sistema SHALL listar `node-notifier` como `dependency` (nueva) y `commander` como `dependency` (promovida desde `devDependencies`, donde ya figuraba por su uso en `scripting/`) en `package.json`. La primera SHALL permitir que el adaptador (`DesktopNotificationAdapter`) invoque `node-notifier` en producción; la segunda SHALL permitir que el CLI (`cli.ts`) parsee los flags de `argv`.

#### Scenario: `node-notifier` y `commander` en `dependencies` de `package.json`

- **GIVEN** el `package.json` del repositorio tras N1
- **WHEN** se inspecciona la sección `dependencies`
- **THEN** SHALL existir la entrada `node-notifier` con una versión válida
- **AND** SHALL existir la entrada `commander` con una versión válida
- **AND** SHALL NO existir `commander` en `devDependencies` (fue promovida)
