## Context

El servicio `desktop-notifications-service` (capas 1 y 2 PKA) fue migrado al repo en N1 con una decisión explícita: **ninguna personalización**. El tipo `NotificationEvent` rechaza por construcción `appId`, `icon` y compañía, y el adaptador `DesktopNotificationAdapter` reenvía a `node-notifier` solo `title`, `message`, `sound?` y `wait: false`. Esa superficie mínima facilita el testing y mantiene el puerto `INotificationService` libre de dependencias de infraestructura, pero produce una UX visible heterogénea:

- **Windows:** SnoreToast firma la notificación como "SnoreToast" y no usa icono de marca.
- **macOS:** la fuente es "node" (no hay bundle `.app` que provea identidad de app).
- **Linux:** el `appName` que recibe `notify-send` está vacío.

El usuario quiere una marca consistente "AI Assistant" en los tres SO sin acoplar el branding al dominio. El proyecto es open source, así que la portabilidad es requisito. Exploradas las opciones A–D en la fase de planning, la decisión es **opción C**:

- Linux: `appName: "AI Assistant"` ya funciona con `node-notifier` + `notify-send`, cero esfuerzo.
- Windows: requiere registrar un **AUMID** (`AIAssistant.Proxy`) mediante un `.lnk` en `%APPDATA%\Microsoft\Windows\Start Menu\Programs\AI Assistant.lnk`.
- macOS: limitación documentada — sigue mostrando "node" (sin bundle `.app`); el icono sí se muestra.

Setup **híbrido + idempotente** vía `npm run notifications:register --install`/`--uninstall`/`--status`. El CLI principal aplica los defaults sin requerir setup previo; Windows degrada con gracia a "SnoreToast" si el usuario no corre `--install`.

## Goals / Non-Goals

**Goals:**

- Hacer visible la marca "AI Assistant" (icono + nombre de fuente) en las notificaciones de los tres SO soportados por el proyecto.
- Mantener la pureza del dominio (PKA): el puerto `INotificationService` no recibe `appId` ni `icon`; los defaults se aplican en el composition root de la CLI.
- Setup opt-in e idempotente: el helper `--install` no reescribe el `.lnk` si ya tiene el AUMID correcto.
- Degradación con gracia: si el icono por defecto no está en disco, el CLI omite `icon` pero sigue emitiendo la notificación.
- Sincronizar `docs/notifications.md` y `README.md` con la nueva sección de branding.

**Non-Goals:**

- Crear un bundle `.app` en macOS (queda como iteración posterior si se decide invertir en empaquetado).
- Modificar `.claude/settings.json` ni `.gitignore`.
- Archivar el spec actual y crear uno nuevo: el spec se modifica in-place.
- Añadir un campo `brandTitle`/`subtitle` o cualquier otra personalización más allá de `appId` + `icon`.
- Exponer un helper de AUMID invocable desde el CLI `notify`; el helper es una herramienta independiente.

## Decisions

### D1. El branding NO entra al puerto

El puerto `INotificationService` sigue exponiendo únicamente `notify(event: NotificationEvent)`. Los defaults `AIAssistant.Proxy` + icono se inyectan en el **composition root de la CLI** (`cli.ts`), no en el adaptador ni en el dominio.

- **Alternativa A (rechazada):** añadir `appId`/`icon` al puerto. Acopla el branding a la signature de la capa 1 y obliga a todo consumidor (test, script, futuro llamante HTTP) a recordar pasar la marca.
- **Alternativa B (rechazada):** inyectar la marca en el adaptador como opción del constructor. Hace al adaptador menos portable fuera del contexto de la CLI.
- **Decisión:** PKA gana — el dominio no conoce la marca, el delivery sí.

### D2. Defaults en CLI, no en adaptador

El adaptador solo **reenvía** lo que llega en el evento. Si el evento no trae `appId` ni `icon`, el adaptador no añade nada. Esto facilita el testing del adaptador (cada test controla explícitamente qué pasa) y mantiene la responsabilidad de la CLI clara.

### D3. Helper AUMID como entry point separado

`src/2-services/notifications/register.ts` es un binario standalone (vía `npm run notifications:register`), no un módulo importable por `cli.ts`. El CLI **no invoca** `register.ts` automáticamente; el usuario decide cuándo correrlo.

- Razón: separar concerns (emitir notificación ≠ registrar identidad OS) y respetar la decisión de que el setup es opt-in.
- Si el usuario no corre `--install`, Windows degrada con gracia: `node-notifier` usará SnoreToast con icono cosmético (vía el `icon` pasado a node-notifier si está disponible, o sin icono si no).

### D4. Idempotencia por comparación de estado

El helper `--install` lee el `.lnk` existente y la clave de registro antes de reescribir cualquiera de los dos. La condición de no-op exige **ambos**:

- `parseIconLocation(lnk) === <STABLE_ICON_PATH>,1` (frame 32×32 del `.ico` ASCII-only).
- `parseAppUserModelId(lnk) === AUMID`.
- `registry.exists && registry.displayName === DISPLAY_NAME && registry.icon === <STABLE_ICON_PATH> && registry.iconUri === <STABLE_PNG_PATH> && registry.shortcutEngine === 'snoretoast'`.

Si solo uno de los dos sitios está obsoleto (p. ej. el `.lnk` quedó con la ruta del repo porque la copia ASCII-only no existía cuando se hizo el `--install` original), `--install` lo repara granularmente sin tocar el lado correcto. Esto evita "ruido" en el `.lnk` (Windows reescribe el `LastModified` incluso si nada cambia) y permite correr `--install` en `postinstall` o en CI sin efectos colaterales. Los parsers (`parseAppUserModelId`, `parseIconLocation`) viven en `lnk-format.ts` junto al escritor `buildShortcutBytes` y al parcheador `patchIconLocation`, todos TypeScript puro sobre operaciones de `Buffer` bounds-checked.

Si el `.lnk` no existe, se crea directamente vía el flujo SnoreToast `-install` descrito en D5'.

### D5'. Camino de creación del `.lnk` — SnoreToast `-install` + parche binario

El `.lnk` no se genera byte a byte en producción aunque `lnk-format.ts` lo permita. SnoreToast `-install` es la única vía fiable para registrar la metadata que Windows exige para AUMID custom:

- Crea el `.lnk` con `IPropertyStore` (AUMID, DisplayName, ToastActivatorCLSID) — el bloque `System.AppUser.Model.ID` que las Windows shell APIs consultan al resolver el branding.
- Registra el CLSID del activador en `HKCU` — requisito para que `shell:AppsFolder\<AUMID>` se resuelva.
- Sin este setup, SnoreToast entra en modo degradado y el header del toast muestra el icono genérico del binario de SnoreToast, no el de la marca.

El flujo `--install` es:

1. `snoretoast-x64.exe -install <lnk-name> <target-exe> <AUMID>` (módulo `snoretoast-shortcut.ts`, función `installSnoreToastShortcut`) crea el `.lnk` con `IPropertyStore` pero **sin** `IconLocation` (o con `IconLocation` apuntando al target = SnoreToast).
2. `patchIconLocation(lnkBytes, buildStableIconLocation())` (en `lnk-format.ts`) reescribe el bloque `IconLocation` del `.lnk` para apuntar al `.ico` estable ASCII-only (`%LOCALAPPDATA%\AIAssistant%\ai-assistant.ico,1`).
3. `writeFileSync(lnkPath, patched)` persiste el `.lnk` con branding completo.

`snoretoast-shortcut.ts` encapsula los pasos 1-3 (`installSnoreToastShortcut`). El target del `.lnk` es el propio `snoretoast-x64.exe` (mismo criterio que el README de SnoreToast: lo que importa para Windows es que el AUMID esté registrado y haya un target resoluble; el target no se ejecuta).

**Trade-off aceptado:** `node-notifier` (que ya es dependencia del adaptador) trae `snoretoast-x64.exe` como vendor binary, así que no se añade dependencia npm nueva. La alternativa (generar el `.lnk` byte a byte y registrar el CLSID del activador manualmente) requería `IPropertyStore` COM, que es IUnknown-only y no se puede invocar desde Node.js sin una librería nativa. Por eso `lnk-format.ts` se conserva como módulo de tests y como implementación de `parseAppUserModelId` / `parseIconLocation` / `patchIconLocation` (escritor disponible, parser y patch necesarios para idempotencia granular), pero no como vía principal de instalación.

### D6. Validación defensiva del AUMID

Aunque el default `AIAssistant.Proxy` siempre es válido, el helper acepta un override por entorno (`AI_ASSISTANT_AUMID`) y valida con la regex `/^[A-Za-z0-9.\-]{1,129}$/` (longitud máxima Windows). AUMID inválido → exit 1 con mensaje en `stderr`.

### D7. Assets versionados, fuente no

`assets/notifications/ai-assistant.png` y `assets/notifications/ai-assistant.ico` se generan desde `assets/AI Assistant Logo.png` (asset de marca personal del usuario, NO versionado) usando las devDeps `sharp` (PNG) y `to-ico` (ICO multi-resolución). Ejemplo de comandos documentados en el commit de la task 1:

```bash
# PNG 256x256, 32-bit RGBA, fondo transparente
node -e "require('sharp')('assets/AI Assistant Logo.png').resize(256, 256).png().toFile('assets/notifications/ai-assistant.png')"

# ICO multi-resolución (16/32/48/64/128/256) desde el PNG
node -e "require('to-ico')(require('fs').readFileSync('assets/notifications/ai-assistant.png')).then(buf => require('fs').writeFileSync('assets/notifications/ai-assistant.ico', buf))"
```

El `.ico` con multi-resolución (16/32/48/64/128/256) asegura buena apariencia en Menú Inicio, Alt+Tab, Action Center y otros contextos. `sharp` y `to-ico` se usan como devDeps (no se despliegan en producción) — la regeneración de assets queda fuera del flujo de `npm run notifications:register`.

## Risks / Trade-offs

- **[R2] El `.ico` mal generado se ve borroso en 16×16** → Mitigación: la task 1 incluye "verificar visualmente en cada resolución" como criterio de done.
- **[R3] El usuario olvida correr `--install` en Windows** → Mitigación: el README y `docs/notifications.md` lo mencionan explícitamente; el icono cosmético sí aparece (vía `icon` en `node-notifier`), solo la fuente muestra "SnoreToast" hasta que se corra `--install`.
- **[R4] Conflict con AUMID de otra app** → Mitigación: validación regex + AUMID único (no es un namespace global controlado por el usuario, pero `AIAssistant.Proxy` no colisiona con apps conocidas).
- **[R5] macOS sigue mostrando "node"** → Trade-off aceptado: la limitación está documentada en el spec, `docs/notifications.md` y `README.md`. Resolverlo requiere bundle `.app`, fuera de scope.
- **[R6] Overhead del icono por defecto en cada invocación del CLI** → Mitigación: el check `fs.existsSync` se hace una sola vez al cargar el CLI (módulo-level), no en cada notificación.
- **[R7] `tsconfig` y resolución de `import.meta.url`** → Mitigación: usar `fileURLToPath` (no `__dirname`, que no existe en ESM) y `path.resolve(fileURLToPath(import.meta.url), '../../..')` para el repo root; patrón ya usado en otros entry points del repo (verificar antes de duplicar).
- **[R8] Cambio en spec in-place rompe tooling que asume freeze** → Mitigación: confirmado por el usuario que se modifica in-place; `openspec-archive` posterior mergea los deltas.
- **[R9] El icono del header se controla vía el `.lnk` del Menú Inicio, no vía el registro ni vía `-p`** → Aprendizaje de la implementación: el `-p` de SnoreToast controla la imagen del cuerpo, el `Icon` + `IconUri` del registro y el `IconLocation` del `.lnk` controlan el header. Una de las tres puede estar bien y el header seguir roto si las otras dos no. Mitigación: `docs/notifications.md` §"Depurar el icono del header" cubre el checklist de diagnóstico paso a paso; el `--status` reporta los tres valores por separado.
- **[R10] SnoreToast como dependencia implícita (vendor binary de `node-notifier`)** → `getSnoreToastPath` localiza `snoretoast-x64.exe` desde `node_modules/node-notifier/vendor/snoretoast/`. Si `node-notifier` cambia su vendor layout en una major version, `getSnoreToastPath` puede romperse. Mitigación: el helper comprueba `existsSync` y lanza error claro con la ruta esperada (`SnoreToast no encontrado en <path>`); el fallo es detectable en el primer `--install` y no degrada silenciosamente.

## Migration Plan

No hay datos que migrar. El deploy del change es:

1. Mergear el change: el spec se actualiza, los archivos de `src/` se modifican, los assets se generan, `package.json` añade la dep.
2. Tras clonar el repo en Windows, el usuario corre una vez: `npm install && npm run notifications:register -- --install`.
3. El `--install` copia los assets desde el repo a `%LOCALAPPDATA%\AIAssistant\` (ruta ASCII-only), invoca `snoretoast-x64.exe -install` para crear el `.lnk` con la metadata AUMID + ToastActivatorCLSID, parchea el `IconLocation` del `.lnk` con `patchIconLocation` para apuntar al `.ico` estable, y escribe la clave de registro `HKCU\Software\Classes\AppUserModelId\AIAssistant.Proxy` con `Icon`, `IconUri`, `DisplayName`, `IconBackgroundColor`, `ShowInSettings` y `ShortcutEngine=snoretoast` vía `reg.exe`.
4. En Mac/Linux no se requiere ningún paso adicional: el CLI ya aplica los defaults.

**Rollback:** si el helper causa problemas, `npm run notifications:register -- --uninstall` borra el `.lnk` y la clave de registro, y devuelve Windows al estado anterior (SnoreToast con "SnoreToast" como fuente). El resto del cambio es código que se puede revertir commit a commit.
