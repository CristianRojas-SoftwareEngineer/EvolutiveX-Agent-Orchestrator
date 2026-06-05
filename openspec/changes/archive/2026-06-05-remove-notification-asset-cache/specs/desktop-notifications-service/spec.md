## REMOVED Requirements

### Requirement: Copia de PNGs por evento en `register --install`

**Reason**: La copia a LOCALAPPDATA fue justificada por la premisa de que las Windows Shell APIs fallan con rutas no-ASCII. Esa premisa es incorrecta (ver `docs/issues/cross-platform-analisys.md`): "Proyectos" no lleva acento, y los experimentos empíricos confirmaron que rutas con espacios funcionan correctamente para el flag `-p`, el registro de AUMID y el `IconLocation` del `.lnk`. El mecanismo de copia introduce complejidad sin aporte de valor, y crea una dependencia en LOCALAPPDATA que es igualmente frágil a largo plazo.

**Migration**: Los PNG de eventos pasan a resolverse directamente desde `assets/notifications/events/` en el repo. Ejecutar `register --install` de nuevo actualiza el registro y el `.lnk` para apuntar a las rutas del repo.

---

## MODIFIED Requirements

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

### Requirement: Helper de registro de AUMID

El sistema SHALL exponer un entry point `src/2-services/notifications/register.ts` que permita registrar, desregistrar y consultar el **AUMID** (Application User Model ID) de la app en Windows, para que las notificaciones firmadas por SnoreToast aparezcan con la marca "AI Assistant" en lugar de "SnoreToast". El helper SHALL ser invocable desde CLI con los subcomandos `--install`, `--uninstall` y `--status` (vía `commander`), SHALL ser **idempotente** (`--install` es no-op si el `.lnk` ya tiene el AUMID correcto; `--uninstall` es no-op si el `.lnk` no existe), y SHALL ser **no-op con mensaje informativo en macOS y Linux** (el AUMID es un concepto Windows-only; en Mac/Linux el branding se aplica vía `appName` en `node-notifier` y no requiere registro).

El `.lnk` SHALL crearse en `%APPDATA%\Microsoft\Windows\Start Menu\Programs\AI Assistant.lnk` con las propiedades `AppUserModelID: "AIAssistant.Proxy"`, `DisplayName: "AI Assistant"`, `IconLocation: <repo-icon-path>,1` donde `<repo-icon-path>` es la ruta absoluta a `assets/notifications/ai-assistant.ico` en el repo (frame 32×32; se usa la ruta del repo directamente, sin copia a LOCALAPPDATA). El helper SHALL orquestar tres módulos:

- **`lnk-format.ts`** (TypeScript puro, bounds-checked, sin subprocess): generador `buildShortcutBytes` y parsers `parseAppUserModelId` / `parseIconLocation` que operan sobre el formato [MS-SHLLINK](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-shllink/) (Shell Link Binary File Format), usando el bloque `APP_USER_MODEL_ID` (signature `0xA0000005`, introducido en Windows 7) en los `ExtraData` del archivo. Expone también `patchIconLocation(bytes, location)` para reescribir el bloque `IconLocation` de un `.lnk` ya creado. Las operaciones de `Buffer` son bounds-checked por Node.js (no hay riesgo de buffer overflow).
- **`snoretoast-shortcut.ts`** (orquestador de subprocess): encapsula el flujo `installSnoreToastShortcut(lnkFileName, targetExe, aumid, lnkPath)` que invoca `snoretoast-x64.exe -install` (binario vendor de `node-notifier`, localizado vía `getSnoreToastPath()`) para crear el `.lnk` con la metadata que Windows espera para AUMID custom (`IPropertyStore` con AUMID + `ToastActivatorCLSID`, registro del CLSID del activador en `HKCU`). Tras SnoreToast, parchea el `IconLocation` del `.lnk` con `patchIconLocation` para apuntar al `.ico` del repo (SnoreToast no asigna `IconLocation`, así que el header del toast heredaría el icono de `snoretoast.exe` sin este parche).
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
  - `ShortcutEngine` (REG_SZ) = `"snoretoast"` — marca que identifica qué motor creó el `.lnk`; la idempotencia del registro exige que el valor actual coincida con `SHORTCUT_ENGINE_SNORETOAST` para considerar la clave "OK".
- Implementación: el helper SHALL invocar `reg.exe` (binario built-in de Windows, NO PowerShell, NO un lenguaje de scripting) vía `child_process.execFile` (sin shell, args pasados directamente al binario). El módulo `registry.ts` SHALL encapsular las tres operaciones: `readRegistry(aumid)`, `writeRegistry(aumid, displayName, iconIcoPath, iconUriPath)`, `deleteRegistry(aumid)`. Las invocaciones SHALL ser idempotentes (`reg add ... /f`, `reg delete ... /f`).

`--install` SHALL ser idempotente: si el `.lnk` (verificable vía `parseAppUserModelId` **y** `parseIconLocation` contra `<repo-icon-path>,1`) y la clave de registro (`Icon` + `IconUri` apuntando a las rutas del repo) coinciden con los valores esperados, SHALL ser no-op. La verificación de idempotencia es **granular**: si solo el `IconLocation` es obsoleto, se reescribe el `.lnk` aunque el AUMID siga correcto; si uno de los dos sitios está mal, SHALL reparar solo el que esté mal. `--uninstall` SHALL borrar ambos sitios (no-op si ya no existen). `--status` SHALL reportar el estado de ambos sitios: `registered` (ambos OK), `partially registered` (uno falta o es incorrecto), o `not registered` (ninguno).

El AUMID SHALL validarse con la regex `/^[A-Za-z0-9.\-]{1,129}$/`; AUMID inválido SHALL rechazarse con exit 1 y mensaje en `stderr`.

El helper SHALL ser invocable vía el script npm `npm run notifications:register -- --install`. El CLI principal (`cli.ts`) NO SHALL invocar este helper automáticamente.

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
- **AND** el `.lnk` existe pero no es válido (bytes aleatorios, header corrupto, o sin bloque `APP_USER_MODEL_ID`)
- **WHEN** se ejecuta `register --install`
- **THEN** SHALL reescribirse el `.lnk` con `AppUserModelID = "AIAssistant.Proxy"` verificable vía `parseAppUserModelId`
- **AND** SHALL terminar con código de salida 0

#### Scenario: `register --install` repara el `.lnk` cuando `IconLocation` apunta a una ruta obsoleta (LOCALAPPDATA)

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
- **AND** SHALL terminar con código de salida 0

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
- **AND** se intenta usar un AUMID con caracteres no permitidos o longitud mayor a 129
- **WHEN** se ejecuta `register --install`
- **THEN** SHALL imprimirse un mensaje de error en `stderr` indicando el formato inválido
- **AND** SHALL terminar con código de salida 1
- **AND** SHALL NO crearse ni modificarse el `.lnk`

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

El CLI SHALL escribir un mensaje de error en `stderr` y terminar con código de salida 1 si el payload es inválido con `--stdin-json`, o si no puede derivarse un mensaje válido.

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

#### Scenario: CLI sin flags de branding aplica defaults

- **GIVEN** el CLI entry point del repo
- **AND** invocación sin `--app-id` ni `--icon`
- **AND** el archivo `assets/notifications/ai-assistant.png` existe en el repo
- **WHEN** se invoca el CLI con flags requeridos (`--event-type Stop --message "Test"`)
- **THEN** el evento pasado al adaptador SHALL contener `appId: 'AIAssistant.Proxy'`
- **AND** SHALL contener `icon: <ruta absoluta al .png del repo>` resuelta desde `import.meta.url`

#### Scenario: CLI con `--app-id` explícito override el default

- **GIVEN** el CLI entry point del repo
- **WHEN** se invoca con `--app-id "Custom.Id" --event-type Stop --message "Test"`
- **THEN** el evento pasado al adaptador SHALL contener `appId: 'Custom.Id'`

---

### Requirement: Exclusiones explícitas de v1 (inventario de archivos)

El servicio SHALL NO incluir en `src/2-services/notifications/`:

- `config.ts` ni carga de `JSON` externo (p. ej. `notifications-config.json`)
- **`builders.ts`** (nombre reservado al legacy externo `C:\AI\`; no reintroducir)
- subdirectorio `sound/` ni archivos `.wav` versionados
- `windows-toast.ts` (sin registro SnoreToast/AUMID desde el adaptador)
- acceso a `C:\AI\` desde el servicio
- **`asset-paths.ts`** (abstracción eliminada en este change; no reintroducir)

El servicio **SHALL** incluir `hook-payload-notification-message.ts` para derivar el **cuerpo** del toast desde el payload JSON de hooks cuando `--stdin-json` esté activo y exista formatter para el `eventKey` resuelto.

El directorio SHALL contener como mínimo los módulos obligatorios listados en el requirement homónimo de esta spec, **más** `hook-payload-notification-message.ts`.

El directorio **MAY** incluir además módulos opcionales de **mantenimiento de assets**: `toast-body-image-spec.ts`, `event-image-overlays.ts`, `event-notification-image.ts`.

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

#### Scenario: Assets de icono versionados fuera de `src/`

- **GIVEN** el repositorio tras el change
- **WHEN** se enumeran los assets de branding
- **THEN** SHALL existir `assets/notifications/ai-assistant.png` (PNG, 256×256, 32-bit RGBA)
- **AND** SHALL existir `assets/notifications/ai-assistant.ico` (ICO multi-resolución: 16/32/48/64/128/256)
- **AND** SHALL NO existir ningún asset de branding dentro de `src/`
