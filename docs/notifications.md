# Servicio de notificaciones de escritorio

> Servicio migrado al repositorio en la fase N1 del roadmap
> `claude-code-hooks-implementation`. Reemplaza — funcionalmente — al
> script externo `C:\AI\claude-code-notifications.ts`, que queda intacto
> durante N1 como fallback y será marcado `@deprecated` en N2. La
> cobertura actual de `.claude/settings.json` (14 entradas) usa este
> servicio para todas las notificaciones de UX desde el repositorio.

## Propósito

Permitir que un hook de Claude Code (u otro llamante del repo) emita un
toast nativo del sistema operativo (Windows, macOS, Linux) con un título y
un mensaje, opcionalmente con sonido. La primera versión (`v1`) es
deliberadamente mínima: no admite personalización visual, no carga
configuración externa, y no introduce dependencias Windows-specific.

**Contrato normativo:** [openspec/specs/desktop-notifications-service/spec.md](../openspec/specs/desktop-notifications-service/spec.md) (requisitos SHALL/MUST). Esta guía describe operación y convenciones del repo.

## Componentes

| Archivo (en `src/2-services/notifications/`) | Capa PKA | Rol |
|---|---|---|
| `types.ts` | 1 (tipos puros) | `NotificationEvent`, `EventType` |
| `INotificationService.ts` | 1 (puerto) | Interfaz del servicio (un único método `notify`) |
| `DesktopNotificationAdapter.ts` | 2 (adaptador concreto) | Implementa el puerto delegando en `node-notifier.notify()` |
| `index.ts` | 2 (exports) | Re-exports públicos del paquete |
| `cli.ts` | 4 (composition root standalone) | Entry point CLI invocable desde hooks de Claude Code |
| `register.ts` | 4 (composition root standalone) | Helper de AUMID Windows (opt-in, idempotente) — orquesta `.lnk` + registro + copia de assets |
| `snoretoast-shortcut.ts` | 4 (helper de orquestación) | Invoca `snoretoast-x64.exe -install` para crear el `.lnk` con la metadata AUMID que Windows espera, y luego parchea el `IconLocation` con `patchIconLocation` de `lnk-format.ts` |
| `lnk-format.ts` | 2 (helper) | Generador/parser del formato MS-SHLLINK (escritura binaria pura del `.lnk`) |
| `registry.ts` | 2 (helper) | Wrapper de `reg.exe` para escribir/leer/borrar `HKCU\Software\Classes\AppUserModelId\{AUMID}` |
| `asset-paths.ts` | 2 (helper) | Constantes de las rutas ASCII-only (`%LOCALAPPDATA%\AIAssistant\`, `events/`) |
| `event-notification-profile.ts` | 2 (catálogo) | Perfiles por `--event-type`: mensaje estático, PNG de cuerpo + sonido por SO |
| `hook-payload-notification-message.ts` | 2 (helper) | **Runtime:** `resolveHookNotificationMessage` — mensaje dinámico desde payload stdin |
| `event-image-paths.ts` | 2 (helper) | **Runtime:** `resolveEventImagePath`, `syncEventImageFromRepoIfStale` (cache estable → repo) |
| `resolve-notification-sound.ts` | 2 (helper) | **Runtime:** `resolveNotificationSound` → `Notification.*` en win32 |
| `toast-body-image-spec.ts` | 2 (helper) | **Mantenimiento:** `applyCircularToastFrame`, `renderToastBodyImageFromSource` (salida 128×128, `#fefefe`) |
| `event-image-overlays.ts` | 2 (helper) | **Mantenimiento:** SVG de overlays (compositor sharp) |
| `event-notification-image.ts` | 2 (helper) | **Mantenimiento:** `writeAllEventNotificationImages()`, `reframeAllEventNotificationImages()` |

## Puerto: `INotificationService`

```ts
interface INotificationService {
  notify(event: NotificationEvent): Promise<void> | void;
}

interface NotificationEvent {
  title: string;
  message: string;
  sound?: boolean | string;  // default efectivo: false; string = token BurntToast (win) o nombre macOS
  silent?: boolean;   // default: false; si true, fuerza sound=false
  appId?: string;     // branding: AUMID Windows, inyectado por la CLI
  icon?: string;      // branding: ruta a asset de imagen, inyectado por la CLI
}
```

El puerto no expone `icon`, `image`, `appId`, `subtitle`, `category`,
`urgency`, `timeout`, `wait`, `open`, `closeLabel`, `actions`, ni
`heroImage`. **Excepción para branding:** el tipo `NotificationEvent`
admite `appId?` e `icon?` como campos opcionales, pero la inyección de
los valores por defecto se realiza en el composition root de la CLI
(`cli.ts`) — no en el adaptador ni en el dominio. Esto preserva la
pureza del puerto: ningún llamante de la capa 1 PKA necesita conocer
la marca.

## Adaptador: `DesktopNotificationAdapter`

Delegación en `node-notifier.notify()` con el siguiente subset exacto de
opciones:

```ts
nodeNotifier.notify({
  title: event.title,
  message: event.message,
  sound: event.silent === true ? false : event.sound ?? false,
  wait: false,
  // appId e icon solo se reenvían si están presentes en el evento
  // (la CLI los aplica como defaults; ver "Branding (icon + appId)" abajo).
  ...(event.appId !== undefined ? { appId: event.appId } : {}),
  ...(event.icon !== undefined ? { icon: event.icon } : {}),
});
```

El adaptador **NO** pasa `contentImage`, `appIdPath`, `subtitle`,
`category`, `urgency`, `actions`, `open`, `closeLabel`, `timeout`
personalizados, `heroImage`, `defaultIcon`, ni `brandTitle`. Tampoco
invoca `SnoreToast`, no accede a archivos `.lnk` y no registra AUMID
(esas responsabilidades son del helper `register.ts`, ver abajo).

## Entry point CLI

El CLI (`src/2-services/notifications/cli.ts`) acepta los siguientes
flags (vía `commander`):

| Flag | Descripción |
|---|---|
| `--event-type <type>` | Tipo de evento del lifecycle (`UserPromptSubmit`, `PreToolUse`, …) |
| `--message <msg>` | Override del cuerpo del toast |
| `--title <title>` | Override del título del toast (por defecto: nombre del hook / `--event-type`) |
| `--sound` | Fuerza `sound: true` genérico (no el token del perfil del evento) |
| `--silent` | Silenciar el toast (contradice `--sound`; ignora el sonido del catálogo) |
| `--stdin-json` | Leer payload JSON de `stdin`; derivar mensaje dinámico si hay formatter |
| `--app-id <id>` | Identificador de aplicación (AUMID Windows); default `AIAssistant.Proxy` |
| `--icon <path>` | Override de imagen de cuerpo; default = PNG del perfil del evento o `ai-assistant.png` |

### Ejemplos

```bash
# Toast con copy del catálogo (solo --event-type)
node src/2-services/notifications/cli.ts --event-type SessionStart

# Override manual del cuerpo
node src/2-services/notifications/cli.ts --event-type Stop --message "Listo"

# StopFailure: mensaje dinámico desde stdin (error + último texto del asistente)
echo '{"hook_event_name":"StopFailure","error":"rate_limit","last_assistant_message":"Detalle"}' \
  | node src/2-services/notifications/cli.ts --event-type StopFailure --stdin-json

# Toast silencioso
node src/2-services/notifications/cli.ts --event-type UserPromptSubmit --silent
```

### Códigos de salida

| Código | Significado |
|---|---|
| `0` | Toast emitido correctamente |
| `1` | Error: payload stdin inválido, falta `--event-type` (sin `--stdin-json`), mensaje no resoluble (sin perfil ni formatter), fallo de `node-notifier`, etc. |

Los errores se imprimen en `stderr`.

## Exclusiones explícitas de v1

La primera versión **NO** incluye ninguno de los siguientes elementos del
sistema externo `C:\AI\claude-code-notifications.ts` (decisión tomada en
exploración previa al L1 y formalizada en la spec
`desktop-notifications-service`):

- **`config.ts`** ni carga de `JSON` externo (p. ej.
  `notifications-config.json`). La configuración es por código.
- **`builders.ts`** (nombre del legacy en `C:\AI\`; en el repo se usa
  `hook-payload-notification-message.ts` en su lugar).
- **Subdirectorio `sound/`** ni perfiles de sonido OS-specific
  (`resolve.ts`, `token-to-profile.ts`, `windows.ts`, `darwin.ts`,
  `linux.ts`).
- **`windows-toast.ts`** (sin registro de SnoreToast desde el adaptador,
  sin AUMID en el flujo de `notify`, sin `heroImage`).
- **Personalización visual más allá de `appId` + `icon`**: sin
  `defaultIcon`, sin `brandTitle`, sin `subtitle`, sin `contentImage`.
- **Acceso a `C:\AI/`** desde el servicio.

> **Nota:** el helper `register.ts` (ver "Branding (icon + appId)" abajo)
> **sí** accede a `%APPDATA%` y crea archivos `.lnk`, pero solo se
> ejecuta bajo invocación explícita del usuario (`npm run
> notifications:register`) y nunca dentro del flujo de `notify`.

Si en el futuro se necesita alguna de estas capacidades, se introducirá
en un change posterior sin romper el contrato actual del puerto.

## Branding (icon + appId)

A partir del change `add-notifications-branding`, el servicio aplica
por defecto la marca "AI Assistant" en los toasts:

- **`appId` default = `AIAssistant.Proxy`** (AUMID Windows; convención
  `[Compañía].[App]`, sin espacios, ≤ 129 caracteres). Lo inyecta la CLI
  en `buildEvent()` si el usuario no pasa `--app-id`. El adaptador lo
  reenvía a `node-notifier` solo si está presente.
- **`icon` por evento** (change `add-notification-event-profiles`): el CLI
  resuelve un PNG distinto por `--event-type` desde el catálogo en
  `event-notification-profile.ts`. Prioridad: `--icon` explícito →
  `%LOCALAPPDATA%\AIAssistant\events\<archivo>.png` (tras `--install`) →
  `<repo>/assets/notifications/events/<archivo>.png` → fallback global
  `ai-assistant.png` (misma prioridad estable/repo que antes). Si ningún
  archivo existe, se omite `icon` (degradación con gracia).

### Copy del toast (catálogo + formatters stdin)

Dos capas en el composition root (`buildEvent`):

1. **Estático** — `message` en `event-notification-profile.ts` (cuerpo por defecto).
2. **Dinámico** — con `--stdin-json`, `resolveHookNotificationMessage(eventKey, payload)` puede sustituir solo el **cuerpo** (paridad `C:\AI\src\notifications\builders.ts`).

**Precedencia del título:** `--title` → `eventKey` resuelto (`--event-type` o `hook_event_name` en stdin). La marca «AI Assistant» solo aparece en el **header** del toast (AUMID), no se repite en el título del cuerpo.

**Precedencia del mensaje:** `--message` → formatter stdin → `profile.message`.

**Privacidad:** los formatters pueden incluir previews de comandos, rutas o preguntas en el Centro de actividades de Windows (mismo trade-off que el legacy). No hay redacción automática de secretos.

| `eventKey` | Formatter stdin (campos principales) |
|------------|--------------------------------------|
| `StopFailure` | `error`, `last_assistant_message` |
| `PermissionRequest` | `tool_name`, `tool_input` |
| `PreToolUse` | `tool_input.questions[]` |
| `UserPromptSubmit` | `prompt` |
| `Stop` | `last_assistant_message` |

### Perfiles por evento (copy + imagen + sonido)

Los 11 hooks con toast en `.claude/settings.json` comparten el mismo
`--event-type` que las claves del catálogo. No hace falta duplicar rutas
ni `--message` en settings: el CLI aplica título (= nombre del hook), mensaje, imagen y sonido.

| `--event-type` | Mensaje estático (catálogo) | Imagen (`events/`) | win32 | darwin | linux |
|----------------|---------------------------|-------------------|-------|--------|-------|
| `UserPromptSubmit` | Procesando tu solicitud... | `user-prompt-submit.png` | `Reminder` | `Submarine` | `true` |
| `PreToolUse` | Pregunta pendiente — Responde en la ventana del cliente. | `pre-tool-use-ask.png` | `SMS` | `Hero` | `true` |
| `SubagentStart` | Subagente iniciado | `subagent-start.png` | `IM` | `Ping` | `true` |
| `SubagentStop` | Subagente terminado | `subagent-stop.png` | `Default` | `Tink` | `true` |
| `Stop` | Tu turno — El asistente terminó. Escribe tu siguiente mensaje. | `stop.png` | `IM` | `Ping` | `true` |
| `StopFailure` | Error de API — No se completó la respuesta. | `stop-failure.png` | `LoopingAlarm7` | `Basso` | `true` |
| `SessionStart` | Sesión iniciada | `session-start.png` | `Default` | `Tink` | `true` |
| `SessionEnd` | Sesión finalizada | `session-end.png` | `Default` | `Tink` | `true` |
| `PermissionRequest` | Permiso requerido — Confirma la herramienta en el cliente. | `permission-request.png` | `SMS` | `Hero` | `true` |
| `TaskCreated` | Tarea creada | `task-created.png` | `Reminder` | `Submarine` | `true` |
| `TaskCompleted` | Tarea completada | `task-completed.png` | `Default` | `Tink` | `true` |

Con `--stdin-json`, los cinco eventos con formatter (`StopFailure`, `PermissionRequest`, `PreToolUse`, `UserPromptSubmit`, `Stop`) pueden sustituir el cuerpo; el resto usa siempre el mensaje estático de la tabla.

**Paridad legacy:** los tokens del catálogo (`Default`, `IM`, `SMS`, …) heredan
`claude-notifications-enhanced.ps1` (BurntToast). El resolvedor los traduce a
`Notification.*` porque `node-notifier`/`SnoreToast` ignoran tokens sin ese
prefijo y usan siempre `Notification.Default`.

| Catálogo (BurntToast) | Valor enviado a SnoreToast (`-s`) |
|----------------------|-----------------------------------|
| `Default` | `Notification.Default` |
| `IM` | `Notification.IM` |
| `Reminder` | `Notification.Reminder` |
| `SMS` | `Notification.SMS` |
| `LoopingAlarm7` | `Notification.Looping.Alarm7` |

**Orden de sonido en el CLI:** `--silent` → `sound: false`; `--sound` →
`sound: true` genérico; si no hay flags → sonido del catálogo vía
`resolveNotificationSound`; sin perfil → mudo.

**Multiplataforma:** Windows y macOS usan strings (`SMS`, `Ping`, …).
Linux solo admite `sound: true` / `false` (best-effort vía
`notify-send`/DE; no distingue timbres por evento).

**Limitaciones:**

- `LoopingAlarm7` en SnoreToast puede no replicar el loop corto del
  script BurntToast legacy; tras smoke test documentar si hace falta
  fallback `sound: true` solo para `StopFailure`.
- En Linux, `sound: true` depende del entorno de escritorio y la
  configuración del usuario; no garantiza audio audible.

### Imagen de cuerpo del toast (`-p` / SnoreToast)

En Windows, `node-notifier` pasa `icon` a SnoreToast como **`-p`**. SnoreToast no
usa `ToastGeneric` ni `appLogoOverride` (48×48): usa la plantilla legacy
**`ToastImageAndText02`** — imagen **cuadrada a la izquierda** del bloque de
título y mensaje (ver `KDE/snoretoast`, `displayToast()`).

| Concepto | Tamaño en shell / doc externa | Uso en este repo |
|----------|------------------------------|------------------|
| App logo override (`ToastGeneric`) | 48×48 | No aplica a `-p` (header usa AUMID + `.ico`) |
| Hero image (`ToastGeneric`) | 364×180 | No usamos hero |
| Hueco `ToastImageAndText02` | ~128×128 px (orientación) | SnoreToast escala el PNG que recibe |

#### Assets versionados (estado actual del repo)

Los PNG en `assets/notifications/events/*.png` y `assets/notifications/ai-assistant.png` son la **fuente de verdad** versionada:

- **256×256**, **32-bit RGBA** (fondo transparente y borde claro permitidos).
- Curación **manual** o con herramientas externas; el CLI los usa tal cual vía `resolveEventImagePath`.
- SnoreToast puede escalar 256→hueco del toast; si el resultado visual es correcto, no hace falta redimensionar (validado en smoke test de los 11 eventos).

**Cabecera vs cuerpo:** el icono redondo «AI Assistant» del header viene de `ai-assistant.ico` / registro AUMID, no del PNG del evento. Si actualizas solo `ai-assistant.png`, regenera también el `.ico` (ver nota «Regeneración de assets» más abajo) para mantener paridad.

**Transparencia:** SnoreToast no mezcla bien el alpha; PNG transparentes pueden mostrar letterboxing. Es aceptable si el resultado te convence; los pipelines opcionales (siguiente subsección) ofrecen salida opaca 128×128 como remedio.

#### Sincronización de caché (runtime)

Tras editar PNGs en el repo, en Windows:

```bash
npm run notifications:register -- --install
```

Esto recopia `assets/notifications/events/*.png` (y assets globales) a
`%LOCALAPPDATA%\AIAssistant\events\` (idempotente por hash SHA-256).

Además, en cada notificación el CLI llama `resolveEventImagePath`, que ejecuta
`syncEventImageFromRepoIfStale`: si el hash del repo difiere del cache, recopia
al cache **antes** de notificar (aunque no hayas vuelto a ejecutar `register`).

Orden efectivo: comprobar repo → sync si hace falta → devolver ruta estable si existe.

#### Pipelines opcionales de mantenimiento (salida 128×128, `#fefefe`)

> **Advertencia:** `writeAllEventNotificationImages` y `reframeAllEventNotificationImages`
> **sobrescriben** los PNG en `assets/notifications/events/`. No ejecutarlos tras
> curación manual salvo que sea intencional.

Herramientas en `toast-body-image-spec.ts` / `event-notification-image.ts` (no cableadas al CLI):

| Pipeline | Efecto | Comando |
|----------|--------|---------|
| **Compositor** (`writeAllEventNotificationImages`) | Regenera los 11 iconos desde `ai-assistant.png` + overlay SVG | `node --import tsx -e "import { writeAllEventNotificationImages } from './src/2-services/notifications/event-notification-image.ts'; await writeAllEventNotificationImages();"` |
| **Reframe** (`reframeAllEventNotificationImages`) | Conserva el arte de cada PNG; disco circular + fondo `#fefefe` (`contain`) | `node --import tsx -e "import { reframeAllEventNotificationImages } from './src/2-services/notifications/event-notification-image.ts'; await reframeAllEventNotificationImages();"` |

Salida de ambos pipelines: **128×128**, fondo opaco **`#fefefe`** (sin alpha). Tras ejecutar cualquiera:

```bash
npm run notifications:register -- --install
```

### ¿Qué es AUMID y por qué Windows lo necesita?

Windows agrupa las notificaciones en el Action Center por **App User
Model ID (AUMID)**. Si no se registra un AUMID, las notificaciones
firmadas por SnoreToast (el binario por defecto de `node-notifier`)
aparecen con la fuente "SnoreToast" en lugar de "AI Assistant". El AUMID
se registra en DOS sitios para que el branding sea consistente:

1. **Registro de Windows** (`HKCU\Software\Classes\AppUserModelId\{AUMID}`):
   UWP/SnoreToast lee esta clave directamente. **Efecto inmediato**, sin
   caché. Es la fuente de verdad "rápida".
2. **Menú Inicio** (`.lnk` creado con **SnoreToast `--install`**):
   SnoreToast registra el acceso directo vía COM (`IPropertyStore` +
   `ToastActivatorCLSID`). Sin este paso, `shell:AppsFolder\<AUMID>` falla,
   SnoreToast entra en "fallback mode" y el **icono del header** del toast
   queda como placeholder (cubos blancos).

Por eso el helper escribe AMBOS: registro (`Icon`, `IconUri`, …) y `.lnk`
SnoreToast.

### Helper de AUMID (`npm run notifications:register`)

`src/2-services/notifications/register.ts` es un entry point CLI
independiente con tres subcomandos (vía `commander`):

```bash
# Crear/actualizar el .lnk y la clave de registro del AUMID (idempotente).
npm run notifications:register -- --install

# Consultar el estado actual (muestra ambos: registro + .lnk).
npm run notifications:register -- --status

# Eliminar el .lnk y la clave de registro (rollback).
npm run notifications:register -- --uninstall
```

El helper es:

- **Idempotente:** `--install` es no-op si tanto el registro como el
  `.lnk` ya tienen el AUMID, el `Icon` del registro en la ruta estable
  (`%LOCALAPPDATA%\AIAssistant\ai-assistant.ico`) y el `IconLocation`
  del `.lnk` apuntando al `.ico` estable (`,1` = frame 32×32). Si el
  `.lnk` quedó con
  una ruta obsoleta del repo (p. ej. con "ó" en `Proyectos`), `--install`
  lo reescribe aunque el AUMID siga siendo correcto.
- **Self-healing:** si cualquiera de los dos está corrupto o falta,
  `--install` lo repara (no falla silenciosamente).
- **Granular:** el `--status` distingue "registered" (ambos OK),
  "partially registered" (uno de los dos falta) y "not registered"
  (ninguno).
- **No-op con mensaje informativo en macOS y Linux:** el AUMID es un
  concepto Windows-only. En Mac/Linux el branding se aplica vía
  `appName` en `node-notifier` (sin registro).
- **Opt-in:** el CLI principal (`cli.ts`) **no** invoca este helper
  automáticamente. El usuario decide cuándo correrlo.
- **TypeScript puro, sin COM, sin PowerShell, sin librería nativa:**
  - El `.lnk` se crea invocando `snoretoast-x64.exe -install` (módulo
    `snoretoast-shortcut.ts`). `lnk-format.ts` se conserva para tests del
    formato MS-SHLLINK, no para el install en producción.
  - La clave de registro se escribe vía `reg.exe` (módulo `registry.ts`,
    función `readRegistry`/`writeRegistry`/`deleteRegistry`). `reg.exe`
    es un binario built-in de Windows, **no es PowerShell** ni un
    lenguaje de scripting — es invocación de CLI con `child_process.execFile`
    (sin shell, args pasados directamente al binario). Cada `--install`/
    `--uninstall` invoca `reg.exe` 1-4 veces (idempotente con `/f`).
- **AUMID configurable:** la variable de entorno `AI_ASSISTANT_AUMID`
  permite override (validado contra `/^[A-Za-z0-9.\-]{1,129}$/`).
  AUMID inválido → exit 1 con mensaje en `stderr`.

### Comportamiento por SO

| SO | Fuente del toast | Icono | Setup adicional |
|---|---|---|---|
| **Windows** | "SnoreToast" sin `--install`; "AI Assistant" con `--install` | AI Assistant (cosmético vía `icon` en `node-notifier`) | `npm run notifications:register -- --install` (opt-in) |
| **macOS** | "node" (limitación: sin bundle `.app`; documentada) | AI Assistant (cosmético vía `icon` en `node-notifier`) | Ninguno |
| **Linux** | "AI Assistant" (vía `appName` en `notify-send`) | AI Assistant (cosmético vía `icon` en `node-notifier`) | Ninguno |

> **Limitación macOS:** el icono sí se muestra vía `node-notifier`, pero
> la fuente sigue siendo "node" porque el change no aborda el bundle
> `.app` (fuera de scope). Resolverlo requiere empaquetar la app como
> `.app`, lo que se considera iteración futura.

> **Regeneración de assets:** los archivos
> `assets/notifications/ai-assistant.png` y `assets/notifications/ai-assistant.ico`
> se generan desde `assets/AI Assistant Logo.png` (asset personal del
> usuario, no versionado) usando las devDeps `sharp` (PNG) y `to-ico`
> (ICO multi-resolución 16/32/48/64/128/256). Para regenerarlos,
> instalar las devDeps y ejecutar la transformación. Los binarios
> generados son los que se versionan bajo `assets/notifications/`.

### Depurar el icono del header (esquina del toast)

En Windows hay **dos imágenes distintas** en un toast:

| Elemento | Quién lo controla | Cómo se configura en este repo |
|---|---|---|
| **Imagen del cuerpo** (logo grande en el toast) | SnoreToast flag `-p` | `icon` en la CLI → `ai-assistant.png` estable (`%LOCALAPPDATA%\AIAssistant\`) |
| **Icono del header** (cuadrado junto a “AI Assistant”) | WinRT / Action Center vía AUMID | Registro `Icon` + **`IconUri`** + `IconLocation` del `.lnk` → `ai-assistant.ico` estable |

Si el cuerpo se ve bien pero el header sigue “roto” (p. ej. tres cubos blancos), el fallo está en la fila del header, no en `-p`.

**Checklist de diagnóstico (en orden):**

1. **Estado del registro**

   ```bash
   npm run notifications:register -- --status
   ```

   Debe decir `registered`. Si falta `IconUri` o apunta mal, `--status` puede mostrar `partially registered`.

2. **Valores en registro** (sustituir `AIAssistant.Proxy` si usas `AI_ASSISTANT_AUMID`):

   ```bat
   reg query "HKCU\Software\Classes\AppUserModelId\AIAssistant.Proxy"
   ```

   Esperado:

   - `DisplayName` = `AI Assistant`
   - `Icon` = `C:\Users\<tu-usuario>\AppData\Local\AIAssistant\ai-assistant.ico` (ruta **ASCII-only**, sin `Proyectos` ni `ó`)
   - `IconUri` = ruta al **`.png` estable** (WinRT usa `IconUri` para el header; `Icon` apunta al `.ico` para el shell)

3. **Acceso directo del Menú Inicio**

   ```bat
   reg query "HKCU\Software\Classes\AppUserModelId\AIAssistant.Proxy" /v Icon
   ```

   Y comprobar el `.lnk`:

   ```text
   %APPDATA%\Microsoft\Windows\Start Menu\Programs\AI Assistant.lnk
   ```

   `IconLocation` debe ser `%LOCALAPPDATA%\AIAssistant\ai-assistant.ico,1` (frame 32×32), no la ruta del repo.

4. **Assets en disco**

   ```bat
   dir "%LOCALAPPDATA%\AIAssistant"
   ```

   Tras regenerar en `assets/notifications/`, ejecutar:

   ```bash
   npm run notifications:register -- --install
   ```

   (copia por hash y refresca registro + `.lnk` si cambió el contenido).

5. **Caché del shell** (si el registro ya es correcto pero el header no cambia):

   ```bat
   taskkill /F /IM explorer.exe
   ie4uinit.exe -ClearIconCache
   start explorer
   ```

6. **Toast de prueba sin confundir capas**

   ```bash
   node --import tsx/esm src/2-services/notifications/cli.ts --event-type Stop --message "Test header icon"
   ```

   - Cuerpo correcto + header roto → seguir con pasos 2–5 (`IconUri`, `.lnk`, caché).
   - Ambos rotos → revisar también `-p` (ruta del PNG estable).

7. **Comportamiento esperado en Win32** (no es bug del repo): Microsoft aplica un **backplate** (marco con color de acento) al icono del header en apps de escritorio clásicas; el logo queda más pequeño dentro del marco. Eso es distinto del placeholder de tres cubos (recurso no cargado).

Referencias: [Enable desktop toast with AppUserModelID](https://learn.microsoft.com/en-us/windows/win32/shell/enable-desktop-toast-with-appusermodelid), registros de ejemplo con `IconUri` en [BurntToast #236](https://github.com/Windos/BurntToast/issues/236).

## Estado del script externo

`C:\AI\claude-code-notifications.ts` está marcado como **`@deprecated`**
con fecha de retirada prevista **2026-09-01**. A partir de la fase N2
del roadmap `claude-code-hooks-implementation`, los hooks con doble
comando en `.claude/settings.json` han dejado de invocarlo: el 2º
comando de los **5 hooks de lifecycle con notificación**
(`UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `Stop`,
`StopFailure`) apunta al entry point CLI del servicio migrado al
repositorio, no al script externo. Las notificaciones de UX restantes
(`SessionStart`, `SessionEnd`, `PermissionRequest`,
`PreToolUse:AskUserQuestion`, `TaskCreated`, `TaskCompleted`) también
apuntan al servicio migrado (ver "Notificaciones de UX no-lifecycle"
más abajo).

**Ruta final del CLI** (relativa a la raíz del proyecto):

```text
./node_modules/tsx/dist/cli.mjs ./src/2-services/notifications/cli.ts
```

**Comando canónico por hook (14 entradas: 8 del lifecycle + 6 de UX):**

| Hook | Matcher | Comando(s) |
|---|---|---|
| `UserPromptSubmit` | — | `POST /hooks` + `node "./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts" --event-type UserPromptSubmit --stdin-json` |
| `PreToolUse` | `*` | `POST /hooks` (sin notificación; ver justificación abajo) |
| `PreToolUse` | `AskUserQuestion` | `node "./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts" --event-type PreToolUse --stdin-json` |
| `PostToolUse` | `*` | `POST /hooks` (sin notificación; ver justificación abajo) |
| `PostToolUseFailure` | — | `POST /hooks` |
| `SubagentStart` | — | `POST /hooks` + `node "./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts" --event-type SubagentStart` |
| `SubagentStop` | — | `POST /hooks` + `node "./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts" --event-type SubagentStop` |
| `Stop` | — | `POST /hooks` + `node "./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts" --event-type Stop --stdin-json` |
| `StopFailure` | — | `POST /hooks` + `node "./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts" --event-type StopFailure --stdin-json` |
| `SessionStart` | `startup|resume` | `node "./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts" --event-type SessionStart` |
| `SessionEnd` | — | `node "./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts" --event-type SessionEnd` |
| `PermissionRequest` | — | `node "./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts" --event-type PermissionRequest --stdin-json` |
| `TaskCreated` | — | `node "./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts" --event-type TaskCreated` |
| `TaskCompleted` | — | `node "./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts" --event-type TaskCompleted` |

**Justificación de `PreToolUse` / `PostToolUse` sin notificación:** los
eventos de tool tienen frecuencia alta (5–50 invocaciones por turno en
sesiones largas). El gateway necesita `matcher: "*"` para correlacionar
todas las tools, pero un toast por cada invocación es ruido de UX, no
señal. La notificación se mantiene en las claves de lifecycle
(`UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `Stop`,
`StopFailure`), donde un único toast por evento aporta valor (inicio
del turno, spawn de subagente, cierre de subagente, cierre del turno,
error de cierre). Para una notificación restringida a `PreToolUse:AskUserQuestion`
se declara una **segunda entrada** bajo la misma clave `PreToolUse` con
matcher específico (mecanismo nativo de Claude Code: una misma clave
admite múltiples entradas con matchers distintos).

### Notificaciones de UX no-lifecycle

Las 6 entradas `SessionStart`, `SessionEnd`, `PermissionRequest`,
`PreToolUse:AskUserQuestion`, `TaskCreated` y `TaskCompleted` **no
invocan** `POST /hooks`: el `AuditHookEventHandler` solo procesa los 8
`eventName` del lifecycle (`UserPromptSubmit`, `PreToolUse`,
`PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`,
`Stop`, `StopFailure`); el resto cae en `default:` y se descarta.
Enviar `POST /hooks` desde estas claves sería ancho de banda
desperdiciado.

> **Nota sobre `TaskCreated` / `TaskCompleted`:** son hooks nativos de
> Claude Code confirmados en
> [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks)
> (parte del catálogo de eventos del lifecycle). El `AuditHookEventHandler`
> del gateway no los procesa (su `switch` solo cubre los 8 del lifecycle
> de correlación), por lo que son puramente UX, ortogonales al gateway.
> Estos hooks no admiten campo `matcher` (la documentación oficial indica
> que se ignora silenciosamente para estos eventos); las entradas omiten
> el campo. El copy estático viene del catálogo (sin `--message` en settings). En sesiones con
> planificación activa (p. ej. `/openspec-new`, `/openspec-apply`),
> `TaskCreate` y `TaskUpdate(status=completed)` disparan múltiples toasts
> por turno; el usuario asume este trade-off a cambio de feedback
> explícito del avance de tareas. Si el ruido resulta excesivo, la única
> mitigación nativa es retirar las entradas (no hay filtrado parcial sin
> throttling/dedupe en el CLI).

### Uso de `--stdin-json` por entrada

| Entrada | `--stdin-json` | Justificación |
|---|---|---|
| `UserPromptSubmit` | Sí | Formatter: preview de `prompt`. |
| `SubagentStart` | No | Copy estático del catálogo. |
| `SubagentStop` | No | Copy estático del catálogo. |
| `PreToolUse` (matcher `AskUserQuestion`) | Sí | Formatter: preguntas en `tool_input.questions`. |
| `Stop` | Sí | Formatter: `last_assistant_message`; si falta, catálogo. |
| `StopFailure` | Sí | Formatter: `error` + `last_assistant_message`. |
| `SessionStart` | No | Copy estático del catálogo. |
| `SessionEnd` | No | Copy estático del catálogo. |
| `PermissionRequest` | Sí | Formatter: `tool_name` y `tool_input`. |
| `TaskCreated` | No | Copy estático del catálogo. |
| `TaskCompleted` | No | Copy estático del catálogo. |

### Override del user-level

Las 6 entradas de UX (`SessionStart`, `SessionEnd`, `PermissionRequest`,
`PreToolUse:AskUserQuestion`, `TaskCreated`, `TaskCompleted`) declaradas
en `.claude/settings.json` del proyecto **sobrescriben** las entradas
equivalentes del user-level (`C:\Users\Cristian\.claude\settings.json`)
para esas claves. Es la regla nativa de merge de Claude Code:
project-level sobrescribe user-level por clave completa, no por comandos
dentro de la clave.

Implicaciones operativas dentro de este repositorio:

1. Las notificaciones de UX pasan a ser responsabilidad del proyecto;
   las del user-level **no se ejecutan** cuando Claude Code corre
   bajo este directorio.
2. La cobertura del ciclo de vida completo de una sesión (arranque,
   permission prompt, AskUserQuestion, spawn/cierre de subagente,
   creación/completado de tareas, cierre) queda servida desde el
   servicio migrado al repo, sin depender de `C:\AI\claude-code-notifications.ts`.
3. Cuando el script externo se retire el **2026-09-01**, el proyecto
   no pierde notificaciones: ya está autosuficiente. Otros directorios
   del usuario sí dependerán del reemplazo definitivo del user-level
   (fuera del scope de este repo).

El hook `SubagentStart` / `SubagentStop` también pasa a ser
responsabilidad del proyecto (el user-level podría tener un comando de
notificación que ahora se descarta); al pasar de "solo `POST /hooks`" a
"`POST /hooks` + notificación", el proyecto absorbe la responsabilidad
completa del spawn/cierre de subagentes en este directorio.

El hook `PostToolUseFailure` y los 2 hooks de tool (`PreToolUse`
matcher `*`, `PostToolUse` matcher `*`) conservan únicamente el comando
`POST /hooks` (sin segundo comando de notificación).

El script externo `C:\AI\claude-code-notifications.ts` se mantiene
intacto en el sistema de archivos del usuario; la eliminación efectiva
queda fuera del scope de este roadmap (vive fuera del repositorio y no
es versionable aquí). El plazo de deprecación de **3 meses** desde N2
(2026-06-02 → 2026-09-01) da margen para migrar cualquier llamante
externo que aún dependa del script.

## Restricción operativa: `.claude/` está en `.gitignore`

El archivo `.claude/settings.json` del proyecto **no entra en commits**
(línea 29 del `.gitignore`). Esto significa que:

- El archivo se mantiene por instalación local; quien clone el repo
  no recibe la configuración de hooks automáticamente.
- La materialización local debe reproducir el contrato descrito en
  esta página y en la spec `hooks-lifecycle-correlation`.
- Cualquier cambio a la cobertura (añadir/quitar entradas, cambiar
  matchers) se documenta primero en spec y docs; el archivo local
  se sincroniza después.

## Spec canónica

`openspec/specs/desktop-notifications-service/spec.md` — fuente de
verdad del contrato del servicio y de las exclusiones de v1.

`openspec/specs/hooks-lifecycle-correlation/spec.md` — fuente de
verdad del contrato del `.claude/settings.json` del proyecto
(8 entradas del lifecycle + 6 entradas de UX no-lifecycle = 14 entradas
totales).
