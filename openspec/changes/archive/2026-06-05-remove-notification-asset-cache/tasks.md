# Tasks: remove-notification-asset-cache

- [x] **T1** — Eliminar `src/2-services/notifications/asset-paths.ts`
  - Borrar el archivo completo. No mover ni renombrar.
  - Verificar: `glob src/2-services/notifications/asset-paths.ts` → sin resultado.

- [x] **T2** — Simplificar `event-image-paths.ts`: eliminar `syncEventImageFromRepoIfStale` y la lógica de STABLE_EVENTS_DIR
  - Eliminar el import de `STABLE_EVENTS_DIR` desde `asset-paths.js`.
  - Eliminar los imports de `createHash`, `copyFileSync`, `mkdirSync`, `readFileSync` (usados solo por sync).
  - Eliminar la función `fileSha256`.
  - Eliminar la función `syncEventImageFromRepoIfStale`.
  - Reescribir `resolveEventImagePath(filename)`: `return existsSync(join(getRepoEventsDir(), filename)) ? join(getRepoEventsDir(), filename) : undefined`.
  - Verificar: `grep -n "STABLE_EVENTS_DIR\|syncEventImage\|fileSha256" event-image-paths.ts` → sin resultado.

- [x] **T3** — Simplificar `cli.ts`: eliminar la rama STABLE_PNG_PATH de `resolveGlobalFallbackIconPath`
  - Eliminar el import de `STABLE_PNG_PATH` desde `asset-paths.js`.
  - Reescribir `resolveGlobalFallbackIconPath`: `return existsSync(REPO_GLOBAL_PNG) ? REPO_GLOBAL_PNG : undefined`.
  - Verificar: `grep -n "STABLE_PNG_PATH\|asset-paths" cli.ts` → sin resultado.

- [x] **T4** — Simplificar `register.ts`: eliminar `ensureStableAssets`, `ensureStableEventAssets`, `copyFileIfChanged` y actualizar `installAction`, `checkInstallState`, `statusAction`
  - Eliminar los imports de `asset-paths.js` (`STABLE_ICON_PATH`, `STABLE_PNG_PATH`, `STABLE_EVENTS_DIR`, `buildStableIconLocation`, `getStableIconUriPath`).
  - Eliminar los imports de `createHash`, `copyFileSync`, `mkdirSync`, `readdirSync`, `readFileSync` que quedarán sin uso.
  - Eliminar `copyFileIfChanged`, `ensureStableAssets`, `ensureStableEventAssets`.
  - Añadir función local `buildIconLocation(icoPath: string): string` → `return \`${icoPath},1\``.
  - Actualizar `installAction`:
    - Eliminar el bloque `ensureStableAssets()` / `ensureStableEventAssets()`.
    - Cambiar `stableIcoPath` → `getIconIcoPath()`, `iconUriPath` → `getIconPngPath()`.
    - Pasar `getIconIcoPath()` y `getIconPngPath()` directamente a `writeRegistry` e `installSnoreToastShortcut`.
  - Actualizar `checkInstallState`: la comparación `parseIconLocation(lnkBytes) === buildStableIconLocation(iconIcoPath)` pasa a `=== buildIconLocation(iconIcoPath)`.
  - Actualizar `statusAction`: reemplazar `STABLE_ICON_PATH` y `buildStableIconLocation()` por `getIconIcoPath()` y `buildIconLocation(getIconIcoPath())`, `getStableIconUriPath()` por `getIconPngPath()`.
  - Verificar: `grep -n "STABLE_\|asset-paths\|ensureStable\|copyFileIfChanged" register.ts` → sin resultado.
  - Gap cubierto: `snoretoast-shortcut.ts` también importaba `buildStableIconLocation`; se eliminó el import y se añadió el 5.º parámetro `iconLocation: string` a `installSnoreToastShortcut`.

- [x] **T5** — Actualizar `tests/2-services/notifications/event-image-paths.test.ts`
  - Eliminar todos los casos de `syncEventImageFromRepoIfStale` (función ya no existe).
  - Eliminar los casos de prioridad STABLE→repo (ya no existe esa lógica).
  - Reescribir para cubrir: (a) devuelve ruta del repo cuando el PNG existe, (b) devuelve `undefined` cuando no existe, (c) comportamiento idéntico en todas las plataformas.
  - Verificar: `npm test -- --testPathPattern event-image-paths` → todos los tests pasan.

- [x] **T6** — Actualizar `tests/2-services/notifications/cli.test.ts`
  - Eliminar mocks de `STABLE_PNG_PATH`.
  - Verificar que `resolveGlobalFallbackIconPath` devuelve la ruta del repo cuando el PNG existe.
  - Verificar: `npm test -- --testPathPattern cli.test` → todos los tests pasan.
  - Adicional: actualizar `register.test.ts` para eliminar imports de `asset-paths.js`, actualizar `registeredState()` y mock de `installSnoreToastShortcut` con 5.º parámetro.

- [x] **T7** — Verificar que no quedan referencias a `asset-paths` en el codebase
  - `grep -rn "asset-paths\|STABLE_ICON\|STABLE_PNG\|STABLE_EVENTS\|buildStableIcon\|getStableIcon\|ensureStableAssets\|ensureStableEvent\|syncEventImage\|copyFileIfChanged" src/ tests/`
  - Resultado esperado: sin resultados. ✓

- [x] **T8** — Ejecutar suite completa de tests
  - `npm test`
  - Todos los tests deben pasar. ✓ (66 archivos, 592 tests)

- [x] **T9** — Ejecutar typecheck
  - `npm run typecheck` (o equivalente en el proyecto: `tsc --noEmit`).
  - Sin errores de compilación. ✓

- [x] **T10** — Ejecutar `register --install` para actualizar el registro y el `.lnk` a rutas del repo
  - `npm run notifications:register -- --install`
  - Verificar que imprime `Registrado: ... icono=<ruta-del-repo>` (no LOCALAPPDATA). ✓
  - Verificar con `--status` que reporta "registered". ✓
