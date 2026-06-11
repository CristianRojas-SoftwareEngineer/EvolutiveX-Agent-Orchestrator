## Why

El change `2026-06-11-statusline-live-refresh` añadió `refreshInterval` al instalador porque la Tabla 2 del statusline parecía no actualizarse durante el agentic loop. La causa real era otro defecto, ya corregido. El timer periódico ya no aporta valor: impone spawns extra en sesiones idle, añade configuración (`SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL`) y un indicador UI (`● live`) que el proyecto ya no promueve.

El cierre temprano de Tabla 2 (caché `mtime`/`size` en `.statusline-state.json`) sí aporta valor en la cadencia nativa de Claude Code y se conserva.

## What Changes

- Eliminar `refreshInterval` del instalador unificado (`buildStatusLineBlock`, `applyStatuslineInstall`, `setup.ts`).
- Eliminar `resolveRefreshInterval`, `STATUSLINE_REFRESH_INTERVAL_KEY` y el campo tipado `statusLine.refreshInterval` del modelo del repo.
- Eliminar `readRefreshIntervalFromSettings`, el parámetro `liveIndicator` y el sufijo `● live (Ns)` en `router-status.ts`.
- Retirar la capability OpenSpec `statusline-live-refresh`; conservar requirements de cierre temprano en `statusline-runtime`.
- Actualizar `docs/router-statusline.md` y `README.md`: documentar caché/cierre temprano; mencionar que Claude Code admite `refreshInterval` de forma genérica pero **este proyecto no lo configura** en el instalador.
- Eliminar tests dedicados al parser de env var y al indicador live.
- **No** modificar la lógica de cierre temprano ni los campos `lastRendered*` en `.statusline-state.json`.

## No objetivos

- Cambiar la cadencia de triggers nativos de Claude Code.
- Leer, validar ni reaccionar a `refreshInterval` que el usuario añada manualmente en `settings.json` (fuera del alcance del proyecto).
- Implementar pre-compilación Bun (PR-2 del change original; queda obsoleto como follow-up).
- Migrar o borrar `.statusline-state.json` existentes en `sessions/`.

## Capabilities

### New Capabilities

_(ninguna)_

### Modified Capabilities

- `statusline-installer`: el instalador SHALL NOT escribir `refreshInterval` ni exponer `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL`; escenario de instalación sin ese campo.
- `statusline-runtime`: mantener cierre temprano; eliminar indicador `● live` y cualquier lectura de `refreshInterval`; redacción de caché sin referencia a «modo live».

### Removed Capabilities

- `statusline-live-refresh`: capability retirada; sus requirements de timer e indicador desaparecen; los de cierre temprano permanecen en `statusline-runtime`.

## Impact

- **Capas PKA:** `5-user-interfaces` (scripting del statusline e instalador).
- **Directorios clave:** `scripting/shared/claude-settings.ts`, `scripting/features/statusline.ts`, `scripting/setup.ts`, `scripting/router-status.ts`, `docs/router-statusline.md`, `README.md`, tests bajo `tests/scripting/`.
- **APIs externas:** `~/.claude/settings.json` deja de recibir `refreshInterval` al reinstalar; usuarios con el campo previo lo pierden en la próxima `setup:install --statusline` (sin breaking change en proxy ni métricas).
- **Dependencias:** ninguna nueva ni eliminada.
- **Documentación:** ver [`docs/router-statusline.md`](../../../docs/router-statusline.md) (§4.4 caché, §9 integración).
