# Design: remove-notification-asset-cache

## Componentes afectados

| Archivo | Rol actual | Acción |
|---|---|---|
| `src/2-services/notifications/asset-paths.ts` | Constantes STABLE_* (ruta LOCALAPPDATA) | **ELIMINAR** |
| `src/2-services/notifications/register.ts` | `ensureStableAssets`, `ensureStableEventAssets`, `copyFileIfChanged` | **SIMPLIFICAR** |
| `src/2-services/notifications/event-image-paths.ts` | `syncEventImageFromRepoIfStale`, lógica stable→repo | **SIMPLIFICAR** |
| `src/2-services/notifications/cli.ts` | `resolveGlobalFallbackIconPath` con STABLE_PNG_PATH | **SIMPLIFICAR** |
| Tests de los cuatro módulos anteriores | Cubren comportamiento de copia/sync | **ACTUALIZAR** |

## Decisiones de diseño

### 1. El módulo `asset-paths.ts` se elimina completo

`asset-paths.ts` existe únicamente para abstraer las rutas de LOCALAPPDATA. Al eliminar el cache, todo su contenido queda sin uso. Se elimina el archivo en lugar de dejarlo vacío.

Los módulos que importan de `asset-paths.ts` pasan a resolver su propia ruta del repo usando el mismo patrón ya presente en `register.ts`: `resolvePath(fileURLToPath(import.meta.url), '..', '../../..', 'assets/notifications/...')`.

### 2. Las rutas del repo se resuelven localmente en cada módulo (sin módulo central)

No se introduce un módulo centralizado de rutas. Cada módulo que necesita una ruta del repo la construye con su propio `import.meta.url`. Este patrón ya existe en `register.ts` (`getIconIcoPath`, `getIconPngPath`) y en `cli.ts` (`REPO_GLOBAL_PNG`). La duplicación es aceptable: son dos líneas por módulo y el número de módulos afectados es pequeño.

### 3. `installAction` en `register.ts` escribe registro y `.lnk` con rutas del repo directamente

Antes: `installAction` → `ensureStableAssets()` → copia a LOCALAPPDATA → usa `STABLE_ICON_PATH` para registro y `.lnk`.

Después: `installAction` usa `getIconIcoPath()` y `getIconPngPath()` directamente para `writeRegistry` e `installSnoreToastShortcut`. No hay paso intermedio de copia.

La función `buildStableIconLocation` (de `asset-paths.ts`) que construía el string `<path>,1` se reemplaza por una función local `buildIconLocation(icoPath)` en `register.ts` con la misma lógica.

### 4. `checkInstallState` compara contra rutas del repo

El check de idempotencia en `checkInstallState` actualmente compara `parseIconLocation(lnkBytes) === buildStableIconLocation(iconIcoPath)` y `registry.icon === iconIcoPath` donde `iconIcoPath` era la ruta LOCALAPPDATA. Pasa a usar la ruta del repo (`getIconIcoPath()`). La lógica de comparación no cambia.

### 5. `resolveEventImagePath` devuelve la ruta del repo directamente

Antes: prefería la ruta STABLE_EVENTS_DIR (LOCALAPPDATA); el repo era fallback.

Después: devuelve `join(getRepoEventsDir(), filename)` si el archivo existe, `undefined` si no. No hay sync, no hay copia.

La función `syncEventImageFromRepoIfStale` se elimina. El export `repoEventsDirProvider` se mantiene porque los tests lo usan para inyectar un directorio temporal.

### 6. `resolveGlobalFallbackIconPath` en `cli.ts` devuelve la ruta del repo directamente

Antes: `existsSync(STABLE_PNG_PATH) → existsSync(REPO_GLOBAL_PNG)`.

Después: `existsSync(REPO_GLOBAL_PNG) → REPO_GLOBAL_PNG`. La constante `REPO_GLOBAL_PNG` ya existe en `cli.ts`; solo se elimina la rama STABLE_PNG_PATH y el import de `asset-paths.ts`.

### 7. `statusAction` compara contra rutas del repo

Las comparaciones `registry.icon === STABLE_ICON_PATH` y `parseIconLocation(lnkBytes) === buildStableIconLocation()` pasan a comparar contra `getIconIcoPath()` y `getIconPngPath()`. Mismo flujo, diferentes rutas objetivo.

### 8. Sin migración automática del LOCALAPPDATA existente

El directorio `%LOCALAPPDATA%\AIAssistant\` que ya existe no se borra. El registro y el `.lnk` actuales apuntan a ese directorio. Al ejecutar `--install` después del change, se reescriben para apuntar al repo. El directorio LOCALAPPDATA queda huérfano en disco pero no causa errores (SnoreToast no lo lee directamente).

### 9. Tests

- `event-image-paths.test.ts`: reescribir los casos que prueban `syncEventImageFromRepoIfStale` (función eliminada) y la prioridad STABLE→repo. Reemplazar por casos que verifican que `resolveEventImagePath` devuelve la ruta del repo cuando existe y `undefined` cuando no.
- `cli.test.ts`: eliminar los casos que mockan `STABLE_PNG_PATH`. Verificar que `resolveGlobalFallbackIconPath` devuelve la ruta del repo.
- `register.test.ts` (si existe): actualizar cualquier assertion contra STABLE_ICON_PATH.

## Flujo simplificado post-change

```
--install
  ├── writeRegistry(aumid, displayName, getIconIcoPath(), getIconPngPath())
  └── installSnoreToastShortcut(LNK_FILENAME, snoreToast, aumid, lnkPath)
      └── patchIconLocation(lnkBytes, buildIconLocation(getIconIcoPath()))

runtime
  └── resolveEventImagePath(filename)
      └── existsSync(join(getRepoEventsDir(), filename))
              yes → return repoPath
              no  → return undefined
```

## No-cambios explícitos

- El mecanismo de registro de AUMID (registry.ts, snoretoast-shortcut.ts, lnk-format.ts) permanece intacto.
- La lógica de `installSnoreToastShortcut` y `patchIconLocation` no cambia.
- `repoEventsDirProvider` se mantiene para los tests.
- No se añaden ni renombran módulos (excepto la eliminación de `asset-paths.ts`).
