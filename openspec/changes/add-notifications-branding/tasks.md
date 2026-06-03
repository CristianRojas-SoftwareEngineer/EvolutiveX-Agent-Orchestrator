## 1. Assets y dependencias

- [x] 1.1 Generar `assets/notifications/ai-assistant.png` (256×256, 32-bit RGBA, fondo transparente) desde `assets/AI Assistant Logo.png` (1254×1254) con `sharp` (devDep): `node -e "require('sharp')('assets/AI Assistant Logo.png').resize(256, 256).png().toFile('assets/notifications/ai-assistant.png')"`
- [x] 1.2 Generar `assets/notifications/ai-assistant.ico` (multi-resolución 16/32/48/64/128/256) desde el `.png` 256×256 con `to-ico` (devDep): `node -e "require('to-ico')(require('fs').readFileSync('assets/notifications/ai-assistant.png')).then(buf => require('fs').writeFileSync('assets/notifications/ai-assistant.ico', buf))"`
- [x] 1.3 Verificar visualmente que el `.ico` se ve correcto en cada una de las 6 resoluciones (especialmente 16×16 para que no se vea borroso en el Menú Inicio)
- [x] 1.4 Verificar que `node-notifier` provee `snoretoast-x64.exe` como vendor binary (no se añadió `windows-shortcut`; la creación del `.lnk` usa SnoreToast `-install` + parche binario del `IconLocation`)
- [x] 1.5 Añadir `"notifications:register": "tsx src/2-services/notifications/register.ts"` a `scripts` en `package.json`

## 2. Tipo `NotificationEvent` y adaptador

- [x] 2.1 Modificar `src/2-services/notifications/types.ts`: añadir `appId?: string` e `icon?: string` a `NotificationEvent`; actualizar el comentario inline que lista los campos excluidos (mantener `image`, `contentImage`, `appIdPath`, `subtitle`, `category`, `urgency`, `timeout`, `wait`, `open`, `closeLabel`, `actions`, `heroImage` fuera del tipo)
- [x] 2.2 Modificar `src/2-services/notifications/DesktopNotificationAdapter.ts`: reenviar `event.appId` como `appID` (con mayúsculas, clave que `node-notifier` v10 reconoce en `allowedToosterFlags` para reenviar a SnoreToast como `-appID`) y `event.icon` como `icon` solo si están presentes (preservar el resto del comportamiento: `wait: false`, `silent → sound: false`)

## 3. CLI con defaults y flags de branding

- [x] 3.1 Modificar `src/2-services/notifications/cli.ts`: añadir flags `--app-id <id>` e `--icon <path>` con `.option()` de `commander`
- [x] 3.2 Implementar en `cli.ts` la aplicación de defaults en `buildEvent` (o equivalente):
  - Si `options.appId` ausente → `event.appId = 'AIAssistant.Proxy'`
  - Si `options.icon` ausente → resolver `<repo-root>/assets/notifications/ai-assistant.png` con `path.resolve(fileURLToPath(import.meta.url), '../../..', 'assets/notifications/ai-assistant.png')`; si el archivo existe, `event.icon = <ruta absoluta>`; si no, omitir el campo (degradación con gracia)

## 4. Helper de AUMID (`register.ts`)

- [x] 4.1 Crear `src/2-services/notifications/register.ts` con entry point CLI basado en `commander` y subcomandos `--install`, `--uninstall`, `--status`
- [x] 4.2 Definir constantes en `register.ts` y `asset-paths.ts`: `AUMID = 'AIAssistant.Proxy'`, `DISPLAY_NAME = 'AI Assistant'`, `LNK_FILENAME = 'AI Assistant.lnk'`, `LNK_PATH = path.join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', LNK_FILENAME)`, `STABLE_ICON_PATH` y `STABLE_PNG_PATH` (en `asset-paths.ts`, rutas ASCII-only bajo `%LOCALAPPDATA%\AIAssistant%\`), `ICON_ICO_PATH = <repo-root>/assets/notifications/ai-assistant.ico` (resuelto con `path.resolve(fileURLToPath(import.meta.url), '../../..', 'assets/notifications/ai-assistant.ico')`)
- [x] 4.3 Implementar subcomando `install`: flujo SnoreToast + registro. Pasos: (a) copiar assets desde repo a `%LOCALAPPDATA%\AIAssistant%\` con verificación SHA-256 (idempotente), (b) escribir clave de registro `HKCU\Software\Classes\AppUserModelId\AIAssistant.Proxy` con `DisplayName`, `Icon`, `IconUri`, `IconBackgroundColor`, `ShowInSettings` y `ShortcutEngine=snoretoast` vía `reg.exe` (módulo `registry.ts`), (c) invocar `snoretoast-x64.exe -install <LNK_FILENAME> <snoretoast-path> <AUMID>` (módulo `snoretoast-shortcut.ts`) y luego `patchIconLocation(lnkBytes, buildStableIconLocation())` (módulo `lnk-format.ts`) para apuntar al `.ico` estable ASCII-only con frame 32×32 (`,1`). Verificación de idempotencia granular: si registro + `.lnk` + hash de assets están al día, no-op. Si solo un sitio está mal, repara solo ese.
- [x] 4.4 Implementar subcomando `uninstall`: borrar el `.lnk` con `fs.unlink` (capturar `ENOENT` como no-op) y borrar la clave de registro con `reg.exe delete` vía `deleteRegistry(aumid)` (no-op si no existe). Tras `--uninstall`, SnoreToast volverá a firmar como "SnoreToast" hasta el próximo `--install`.
- [x] 4.5 Implementar subcomando `status`: leer `parseAppUserModelId(lnk)` y `parseIconLocation(lnk)` de `lnk-format.ts` y `readRegistry(aumid)` de `registry.ts`; reportar `registered` (todos OK), `partially registered` (un sitio incorrecto o ausente) o `not registered` (ninguno) con sugerencia de `--install`
- [x] 4.6 Manejar `process.platform !== 'win32'`: imprimir mensaje informativo ("AUMID setup is Windows-only...") y exit 0 para cualquier subcomando
- [x] 4.7 Validar formato del AUMID (override por `AI_ASSISTANT_AUMID` o flag) con regex `/^[A-Za-z0-9.\-]{1,129}$/`; AUMID inválido → exit 1 con mensaje en `stderr`

## 5. Tests

- [x] 5.1 Tests del adaptador en `tests/2-services/notifications/desktop-notification.adapter.test.ts` (modificado):
  - Evento sin `appId`/`icon` → `node-notifier.notify` recibe options sin esas claves
  - Evento con `appId` y `icon` → `node-notifier.notify` recibe options con `appID` (mayúsculas) e `icon`
  - Regresión: evento con `silent: true` sigue forzando `sound: false`
- [x] 5.2 Tests del CLI en `tests/2-services/notifications/cli.test.ts` (modificado):
  - Invocación sin `--app-id`/`--icon` y con icono por defecto presente → evento contiene defaults `AIAssistant.Proxy` + ruta resuelta
  - Invocación con `--app-id Custom.Id` → override
  - Invocación con `--icon /ruta/custom.png` → override
  - Invocación sin `--icon` y con icono por defecto ausente → evento sin `icon` (degradación con gracia)
- [x] 5.3 Tests de `register.ts` y módulos auxiliares en `tests/2-services/notifications/`:
  - `register.test.ts` (NEW): `--install` mockeando `snoretoast-x64.exe` y `reg.exe` → registro + `.lnk` correctos
  - `register.test.ts`: `--install` cuando ambos sitios están OK → no-op
  - `register.test.ts`: `--install` con `IconLocation` obsoleto → solo reescribe el `.lnk` (granular)
  - `register.test.ts`: `--uninstall` con `.lnk` + registro presentes → `fs.unlink` + `reg delete`
  - `register.test.ts`: `--uninstall` sin `.lnk` ni registro → no-op, exit 0
  - `register.test.ts`: `--status` con todo OK → imprime "registered: AppUserModelID=\"...\" DisplayName=\"AI Assistant\" (registro + .lnk SnoreToast OK)"
  - `register.test.ts`: `--status` con uno incorrecto → imprime "partially registered"
  - `register.test.ts`: `--status` sin nada → imprime "not registered"
  - `register.test.ts`: cualquier subcomando en `process.platform !== 'win32'` → mensaje informativo, exit 0
  - `register.test.ts`: AUMID con formato inválido → exit 1 con mensaje en `stderr`
  - `lnk-format.test.ts` (NEW): round-trip de `buildShortcutBytes` + `parseAppUserModelId` + `parseIconLocation` + `patchIconLocation` sobre fixtures MS-SHLLINK
  - `registry.test.ts` (NEW): mockea `child_process.execFile` para verificar que `readRegistry` / `writeRegistry` / `deleteRegistry` invocan `reg.exe` con los args correctos (sin shell)

## 6. Documentación

- [x] 6.1 Modificar `docs/notifications.md`: añadir sección "Branding (icon + appId)" después de "Notificaciones de UX no-lifecycle" cubriendo:
  - Qué es AUMID y por qué Windows lo necesita
  - Defaults aplicados por el CLI (`AIAssistant.Proxy` + `<repo>/assets/notifications/ai-assistant.png`)
  - Comando `npm run notifications:register` con subcomandos `--install` / `--uninstall` / `--status`
  - Limitación documentada de macOS ("node" como fuente — sin bundle `.app`)
  - Comportamiento en Linux (trivial: `appName` se pasa a `notify-send`)
  - Sección "Depurar el icono del header" con checklist de diagnóstico paso a paso
- [x] 6.2 Modificar `README.md`: en la sección de configuración de hooks o notificaciones, añadir 1-2 frases mencionando el comando `npm run notifications:register` y que es opcional (opt-in) en Windows; sin entrar en detalles de implementación

## 7. Verificación end-to-end

- [x] 7.1 `npx openspec validate desktop-notifications-service --strict` → "is valid" (spec destino tras mergear deltas)
- [x] 7.2 `npx openspec validate add-notifications-branding --strict` → "is valid" (change completo)
- [x] 7.3 `npm run test:quick` → lint OK, typecheck OK, **387/387** tests verdes
- [x] 7.4 Smoke test CLI en Mac/Linux con defaults: `node src/2-services/notifications/cli.ts --event-type Stop --message "Test branding"` → exit 0; el evento pasado al adaptador contiene `appId: "AIAssistant.Proxy"` e `icon: "<repo>/assets/notifications/ai-assistant.png"`
- [x] 7.5 Smoke test CLI con overrides: `node src/2-services/notifications/cli.ts --event-type Stop --message "Test" --app-id "Custom.Id" --icon /tmp/custom.png` → exit 0; el evento contiene los overrides
- [x] 7.6 Smoke test CLI con icono por defecto ausente: mover temporalmente `ai-assistant.png`, ejecutar el CLI sin `--icon` → exit 0; el evento contiene `appId` pero NO `icon` (degradación con gracia)
- [x] 7.7 Smoke test `register` en Mac/Linux: `node src/2-services/notifications/register.ts --install` → exit 0 con mensaje informativo; idem `--uninstall` y `--status`
- [x] 7.8 Smoke test `register` en Windows (manual, requiere máquina Windows):
  - `npm run notifications:register -- --install` → exit 0; verificar que `%APPDATA%\Microsoft\Windows\Start Menu\Programs\AI Assistant.lnk` existe con `AppUserModelID` correcta
  - `npm run notifications:register -- --install` (2ª vez) → exit 0, no-op
  - `npm run notifications:register -- --status` → imprime "registered: AppUserModelID=\"AIAssistant.Proxy\" (registro + .lnk SnoreToast OK)"
  - `npm run notifications:register -- --uninstall` → exit 0; el `.lnk` y el registro se borran
- [x] 7.9 Cobertura real end-to-end en Windows: con `register --install` ejecutado, disparar un hook de Claude Code (p. ej. `SessionStart`); el toast debe aparecer con el icono AI Assistant y la fuente "AI Assistant" (no "SnoreToast")
- [x] 7.10 Cobertura real en Mac (manual): disparar un hook → el toast debe mostrar el icono AI Assistant y la fuente "node" (limitación documentada)
- [x] 7.11 Cobertura real en Linux (manual): disparar un hook → el toast debe mostrar el icono AI Assistant y la fuente "AI Assistant"
- [x] 7.12 Grep de coherencia: verificar que ningún doc dice "12 entradas" o "no se admite icon" — debe estar sincronizado con el nuevo estado
- [x] 7.13 Diagnóstico de causa raíz del icono del header: descubrir y documentar que el header depende del `.lnk` IconLocation (no del registro `Icon` ni del `-p` de SnoreToast); el `-p` controla el cuerpo, `Icon` + `IconUri` del registro controlan el header junto con `IconLocation` del `.lnk`. Documentar en `docs/notifications.md` §"Depurar el icono del header" el checklist de diagnóstico.
