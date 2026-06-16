# Tasks: remove-statusline-refresh-interval

> **Alcance:** retirar timer `refreshInterval`, env var, indicador `● live` y capability `statusline-live-refresh`. **Conservar** cierre temprano y caché `.statusline-state.json`.

## 1. Instalador y modelo de settings

- [x] 1.1 En `scripting/features/statusline.ts`, revertir `buildStatusLineBlock(command)` y `applyStatuslineInstall(settings, proxyRoot, force)` sin parámetro `refreshInterval`.
- [x] 1.2 En `scripting/setup.ts`, eliminar import y llamada a `resolveRefreshInterval`.
- [x] 1.3 En `scripting/shared/claude-settings.ts`, eliminar `STATUSLINE_REFRESH_INTERVAL_KEY`, `resolveRefreshInterval` y el campo `refreshInterval` de `ClaudeSettings.statusLine`.
- [x] 1.4 Eliminar `tests/scripting/shared/claude-settings.test.ts`.

## 2. Runtime del statusline (`router-status.ts`)

- [x] 2.1 Eliminar `readRefreshIntervalFromSettings` y export si solo la usaba el indicador.
- [x] 2.2 Eliminar parámetro `liveIndicator` de `renderTokenTable` y lógica del sufijo `● live (Ns)` en la cabecera de Tabla 2.
- [x] 2.3 En `buildStatuslineOutput`, quitar lectura de `refreshInterval` y paso de `liveIndicator`; **no** modificar `canUseTable2EarlyExit` ni persistencia `lastRendered*`.
- [x] 2.4 Eliminar `tests/scripting/router-status-live-indicator.test.ts`.

## 3. Tests del instalador

- [x] 3.1 En `tests/scripting/features/statusline.test.ts`, actualizar llamadas a `applyStatuslineInstall` (sin cuarto argumento) y eliminar bloques `buildStatusLineBlock` / `resolveRefreshInterval` relacionados con `refreshInterval`.
- [x] 3.2 Añadir o ajustar assertion: `statusLine` instalado **no** contiene `refreshInterval`.
- [x] 3.3 Verificar que tests de cierre temprano en `tests/scripting/router-status-output.test.ts` siguen pasando sin cambios de comportamiento.

## 4. Documentación

- [x] 4.1 En `docs/router-statusline.md` §9: quitar menciones de `refreshInterval: 3` por defecto; añadir nota breve de que Claude Code admite `statusLine.refreshInterval` opcional pero **este proyecto no lo configura** en `setup:install`.
- [x] 4.2 Mover explicación de cierre temprano (`mtime`/`size`) a §4.4 Caché por sesión; eliminar §10.1 «Live refresh (`refreshInterval`)».
- [x] 4.3 En `README.md`, eliminar párrafo de «modo live» y referencia a `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL`.

## 5. Verificación

- [x] 5.1 Ejecutar `npm run test:quick` (lint + typecheck + unit).
- [x] 5.2 Ejecutar `npm run test` si hay dudas en tests de scripting.
- [x] 5.3 `openspec verify remove-statusline-refresh-interval` antes de archivar.
