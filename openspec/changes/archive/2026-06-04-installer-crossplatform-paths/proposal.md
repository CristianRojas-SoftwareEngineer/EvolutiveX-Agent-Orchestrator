## Why

El instalador universal (`setup.ts`) escribe `~/.claude/settings.json` global con rutas
que en Windows llevan backslashes y con una variable de runtime (`${CLAUDE_PROJECT_DIR}`)
que solo expande Claude Code al directorio del proyecto activo —no al repo de SCP—, lo
que hace fallar el hook `Stop` en cualquier proyecto que no sea SCP mismo.

## What Changes

- **`configs/hooks.json`**: el hook `Stop` reemplaza `${CLAUDE_PROJECT_DIR}` (×2) por
  `${SMART_CODE_PROXY_ROOT}`, de modo que el instalador resuelva la ruta a SCP en
  install-time igual que el resto de los hooks.
- **`scripting/stop-hook-ux.ts`**: en lugar de pasar `process.env.CLAUDE_PROJECT_DIR` a
  `runContinuityNotification`, deriva la raíz de SCP de `import.meta.url`
  (`dirname(fileURLToPath(import.meta.url)) + '/..`). El archivo
  `.last-continuity-message.txt` siempre se escribe en `<SCP>/sessions/`.
- **`scripting/setup.ts`**: normaliza `proxyRoot` con `resolvePosixAbsolutePath`
  (ya existente en `scripting/shared/npx-tsx-command.ts`) antes de pasarlo a las features.
  Un solo cambio garantiza que los 14 comandos de hooks y `env.SMART_CODE_PROXY_ROOT`
  lleguen con forward slashes.
- **`scripting/features/statusline.ts`**: `env.SMART_CODE_PROXY_ROOT` escrito con
  `resolvePosixAbsolutePath(proxyRoot)` en lugar de `resolve(proxyRoot)`.
- **Tests**: `setup.test.ts` (reconstrucción manual) y `stop-hook-ux.test.ts` (ya no
  verifica `CLAUDE_PROJECT_DIR`; verifica raíz SCP auto-derivada).
- **Docs**: `docs/notifications.md` alinea snippet y nota del hook `Stop`.

## Capabilities

### New Capabilities

_(ninguna)_

### Modified Capabilities

- `hooks-lifecycle-correlation`: el hook `Stop` SHALL resolver rutas con
  `${SMART_CODE_PROXY_ROOT}` (no `${CLAUDE_PROJECT_DIR}`); el mensaje de continuidad
  SHALL persistirse en `<SMART_CODE_PROXY_ROOT>/sessions/.last-continuity-message.txt`.
- `unified-installer`: nueva cláusula S5-global — todas las rutas escritas en
  `settings.json` (hooks command, `statusLine.command`, `env.SMART_CODE_PROXY_ROOT`)
  SHALL ser POSIX-absolutas, resueltas en install-time vía `resolvePosixAbsolutePath`.

## Impact

- **Capas afectadas**: ninguna capa PKA del proxy (`src/`) — el cambio es puramente de
  scripting (`scripting/`, `configs/`, `tests/scripting/`).
- **`~/.claude/settings.json` de usuarios con instalación previa**: los hooks existentes
  del `Stop` siguen con `${CLAUDE_PROJECT_DIR}` hasta que el usuario ejecute
  `npm run setup:install` nuevamente.
- **`sessions/.last-continuity-message.txt`**: pasa de escribirse en el proyecto activo a
  siempre escribirse en `<SCP>/sessions/`. Si algún consumidor (p. ej. TTS) leía desde
  el proyecto activo, deberá ajustarse.
- Sin cambios en la API HTTP del proxy, en `routing/`, ni en `src/`.
