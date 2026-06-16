## Why

El servicio `desktop-notifications-service` migrado en N1 es deliberadamente mínimo y rechaza campos de personalización en el tipo `NotificationEvent` (entre ellos `appId` e `icon`). Como consecuencia, en Windows las notificaciones aparecen firmadas por "SnoreToast" (el binario por defecto de `node-notifier`) y sin icono propio; en macOS la fuente visible es "node"; en Linux el `appName` que recibe `notify-send` queda vacío. El proyecto es open source y necesita una UX consistente con la marca "AI Assistant" en los tres sistemas operativos, pero sin acoplar el branding al contrato del dominio.

## What Changes

- Se añaden `appId?: string` e `icon?: string` (ambos opcionales) al tipo `NotificationEvent` y se permite su reenvío a `node-notifier` desde `DesktopNotificationAdapter` solo cuando están presentes en el evento. La clave reenviada a `node-notifier` es `appID` (mayúsculas, no `appId` camelCase) — es la nomenclatura que `node-notifier` v10 reconoce en `allowedToasterFlags` y reenvía a SnoreToast como `-appID`. La traducción `appId → appID` ocurre dentro del adaptador para preservar la API pública idiomática sin acoplar el dominio al quirk de nomenclatura.
- Se añaden al CLI los flags `--app-id <id>` e `--icon <path>` con defaults `AIAssistant.Proxy` y `<repo-root>/assets/notifications/ai-assistant.png`. Si el icono por defecto no existe en disco, el CLI omite `icon` (degradación con gracia) y mantiene `appId`.
- Se crea el entry point `src/2-services/notifications/register.ts` con subcomandos `--install`, `--uninstall` y `--status`. El flujo `--install` es **SnoreToast + registro**: invoca `snoretoast-x64.exe -install` (vendor binary de `node-notifier`, encapsulado en `src/2-services/notifications/snoretoast-shortcut.ts`) para crear el `.lnk` con la metadata AUMID + `ToastActivatorCLSID` que Windows espera; parchea el `IconLocation` del `.lnk` con `patchIconLocation` (`src/2-services/notifications/lnk-format.ts`) para apuntar al `.ico` estable en `%LOCALAPPDATA%\AIAssistant%`; copia los assets desde el repo a esa ruta ASCII-only; y escribe la clave de registro `HKCU\Software\Classes\AppUserModelId\AIAssistant.Proxy` con `Icon`, `IconUri`, `DisplayName`, `IconBackgroundColor`, `ShowInSettings` y `ShortcutEngine=snoretoast` vía `reg.exe` (wrapper en `src/2-services/notifications/registry.ts`). El helper es idempotente (verificación granular por sitio: `.lnk` IconLocation + AUMID, clave de registro, hash de assets), no-op fuera de Windows y accesible vía `npm run notifications:register`.
- Se crean los módulos de soporte: `src/2-services/notifications/lnk-format.ts` (escritor + parsers + `patchIconLocation` del formato MS-SHLLINK, TypeScript puro), `src/2-services/notifications/registry.ts` (wrapper de `reg.exe`), `src/2-services/notifications/asset-paths.ts` (constantes `STABLE_ICON_PATH` / `STABLE_PNG_PATH` / `buildStableIconLocation` para rutas ASCII-only).
- Se añaden los assets `assets/notifications/ai-assistant.png` (256×256, 32-bit RGBA) y `assets/notifications/ai-assistant.ico` (multi-resolución 16/32/48/64/128/256) versionados fuera de `src/`, generados desde `assets/AI Assistant Logo.png` (no versionado) con las devDeps `sharp` y `to-ico`.
- Se añade el script npm `notifications:register` (apunta a `tsx src/2-services/notifications/register.ts`).
- Se actualizan `docs/notifications.md` y `README.md` con la sección "Branding (icon + appId)" y una breve mención al comando opt-in.
- La superficie del puerto `INotificationService` **NO cambia**: el branding se inyecta por configuración externa (composition root del CLI), preservando la pureza del dominio (PKA).

**No hay cambios incompatibles**: los campos añadidos son opcionales, los scenarios existentes que rechazaban `appId`/`icon` se actualizan para reflejar que ahora son válidos, y los scenarios de personalización siguen rechazando el resto de campos excluidos (`contentImage`, `subtitle`, etc.).

## Capabilities

### New Capabilities

- Ninguna. El change añade un nuevo Requirement (`Helper de registro de AUMID`) al spec existente `desktop-notifications-service` en lugar de crear un spec nuevo, manteniendo así la unidad del dominio y evitando fragmentación de la documentación.

### Modified Capabilities

- `desktop-notifications-service`: el tipo `NotificationEvent` admite `appId` e `icon` opcionales; el adaptador reenvía ambos a `node-notifier` solo si están presentes (con la clave `appID` mayúscula que `node-notifier` reconoce para reenviar a SnoreToast como `-appID`); el CLI aplica defaults y expone flags nuevos; el inventario de archivos del directorio incluye `register.ts`, `snoretoast-shortcut.ts`, `lnk-format.ts`, `registry.ts` y `asset-paths.ts`; el spec documenta explícitamente que el branding no entra al puerto; se añade un nuevo Requirement `Helper de registro de AUMID` que cubre el helper de AUMID, el flujo SnoreToast `-install` + parche de `IconLocation`, el wrapper de `reg.exe`, la copia de assets a ruta ASCII-only, los assets de icono versionados, y el script npm `notifications:register`.

## Impact

- **Código afectado** (capa 2 PKA):
  - `src/2-services/notifications/types.ts` (MODIFIED) — añadido `appId?` e `icon?` a `NotificationEvent`.
  - `src/2-services/notifications/DesktopNotificationAdapter.ts` (MODIFIED) — reenvía `appID` (mayúsculas) e `icon` a `node-notifier` solo si están presentes.
  - `src/2-services/notifications/cli.ts` (MODIFIED) — flags `--app-id` / `--icon`, defaults `AIAssistant.Proxy` y `<repo>/assets/notifications/ai-assistant.png`, degradación con gracia.
  - `src/2-services/notifications/register.ts` (NEW) — entry point CLI con `--install` / `--uninstall` / `--status`. Orquesta `snoretoast-shortcut.ts`, `lnk-format.ts`, `registry.ts`, `asset-paths.ts`.
  - `src/2-services/notifications/snoretoast-shortcut.ts` (NEW) — `getSnoreToastPath()`, `installSnoreToastShortcut()`, constante `SHORTCUT_ENGINE_SNORETOAST`. Encapsula `snoretoast-x64.exe -install` + `patchIconLocation`.
  - `src/2-services/notifications/lnk-format.ts` (NEW) — `buildShortcutBytes`, `parseAppUserModelId`, `parseIconLocation`, `patchIconLocation`. TypeScript puro, formato MS-SHLLINK.
  - `src/2-services/notifications/registry.ts` (NEW) — `readRegistry`, `writeRegistry`, `deleteRegistry`. Wrapper de `reg.exe` vía `child_process.execFile` (sin shell).
  - `src/2-services/notifications/asset-paths.ts` (NEW) — `STABLE_ICON_PATH`, `STABLE_PNG_PATH`, `buildStableIconLocation`, `getStableIconUriPath`.
- **Tests** (en `tests/2-services/notifications/`, no `__tests__/`): `cli.test.ts` (MODIFIED), `desktop-notification.adapter.test.ts` (MODIFIED), `register.test.ts` (NEW), `lnk-format.test.ts` (NEW), `registry.test.ts` (NEW). Total: 387 tests pasan (todos verdes, lint y typecheck OK).
- **Assets versionados**: `assets/notifications/ai-assistant.png` y `assets/notifications/ai-assistant.ico` (no se commitea la fuente `AI Assistant Logo.png`).
- **Dependencias**: `node-notifier` ya traía `snoretoast-x64.exe` como vendor binary — no se añade npm dep para `windows-shortcut` ni nada similar. `commander` y `node-notifier` siguen como están. devDeps nuevas: `sharp` (regeneración de `.png` desde el asset personal) y `to-ico` (regeneración del `.ico` multi-resolución).
- **Scripts npm**: `npm run notifications:register` añadido; los 14 comandos de `.claude/settings.json` no se tocan.
- **Documentación**: `docs/notifications.md` (nueva sección) y `README.md` (1-2 frases).
- **Limitación documentada**: macOS sigue mostrando "node" como fuente porque el change no aborda el bundle `.app`; Linux y Windows sí muestran "AI Assistant" tras aplicar los defaults (y, en Windows, tras correr `--install`). En Windows, el **icono del header** del toast depende de tres valores coordinados — `Icon` + `IconUri` en el registro, `IconLocation` del `.lnk` apuntando al `.ico` estable, y copia de assets en `%LOCALAPPDATA%\AIAssistant%` (ruta ASCII-only). El `-p` de SnoreToast controla la imagen del cuerpo, no el header. `--status` reporta los tres valores por separado para diagnosticar desincronizaciones.
- **Sin cambios en**: `.claude/settings.json`, `.gitignore`, `openspec/` que no sea el spec modificado in-place.
