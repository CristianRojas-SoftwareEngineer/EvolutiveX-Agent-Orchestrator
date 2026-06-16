## Why

El servicio de notificaciones copia los assets de imagen a `%LOCALAPPDATA%\AIAssistant\` justificándolo en que las Windows Shell APIs fallan con rutas no-ASCII. Esa justificación era incorrecta: "Proyectos" no lleva tilde, y los experimentos empíricos (documentados en `docs/issues/cross-platform-analisys.md`) confirman que Windows maneja correctamente rutas con espacios para `-p`, el registro de AUMID y el `.lnk`. El mecanismo de copia introduce complejidad innecesaria (tres capas de copia idempotente), crea una dependencia en un directorio del sistema operativo que no aporta estabilidad real, y es la única parte del código de notificaciones exclusiva de Windows donde no debería serlo.

## What Changes

- **Eliminación** del mecanismo de copia de assets a `%LOCALAPPDATA%\AIAssistant\` (`ensureStableAssets`, `ensureStableEventAssets`, `copyFileIfChanged`, `syncEventImageFromRepoIfStale`).
- **Eliminación** de `src/2-services/notifications/asset-paths.ts` (abstracción cuya única razón de existir era el cache de LOCALAPPDATA).
- **Simplificación** de `resolveEventImagePath()`: pasa de "prefer stable → fallback repo" a "devuelve repo path directamente".
- **Simplificación** de `resolveGlobalFallbackIconPath()` en `cli.ts`: pasa de "prefer STABLE_PNG_PATH → fallback repo" a "devuelve repo path directamente".
- **Actualización** de `installAction()` en `register.ts`: escribe registro y parcha `.lnk` apuntando directamente a las rutas del repo.
- **Actualización** de `statusAction()` y `checkInstallState()`: comparan contra rutas del repo.
- Los tests que validaban el comportamiento de copia se reescriben para el flujo simplificado.

## No objetivos

- No se cambia el mecanismo de registro de AUMID ni el de creación del `.lnk` vía SnoreToast (eso es genuinamente Windows-only y permanece).
- No se añade soporte para rutas con caracteres no-ASCII (fuera del alcance; los experimentos no cubrieron ese caso).
- No se refactoriza el sistema de notificaciones más allá de eliminar la capa de copia.

## Capabilities

### New Capabilities

_(ninguna — este change es una simplificación, no una nueva capacidad)_

### Modified Capabilities

- `desktop-notifications-service`: cambia el requisito de que los assets deben estar en LOCALAPPDATA; pasan a resolverse directamente desde el repo.
- `unified-installer`: cambia el comportamiento de `--install` respecto a la copia de assets (deja de copiar a LOCALAPPDATA).

## Impact

- **Capas PKA afectadas**: 2-services (notifications), con efecto colateral en el instalador (capa 4/scripts).
- **Archivos eliminados**: `src/2-services/notifications/asset-paths.ts`.
- **Archivos modificados**: `register.ts`, `event-image-paths.ts`, `cli.ts`, tests relacionados.
- **Efectos operativos**: usuarios que ya ejecutaron `--install` con la versión anterior tienen el registro y `.lnk` apuntando a LOCALAPPDATA; necesitarán volver a ejecutar `--install` para actualizar. Como el proyecto no ha sido distribuido aún, sólo existe una instalación (esta), lo que hace el remedio trivial: re-ejecutar `--install` después de aplicar el change.
- **Directorio `%LOCALAPPDATA%\AIAssistant\`**: deja de crearse en nuevas instalaciones. El directorio puede persistir en disco si ya existía; no se borra activamente (no es responsabilidad de este change).
