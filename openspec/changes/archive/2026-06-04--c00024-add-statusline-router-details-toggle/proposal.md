## Why

La Tabla 2 del statusline ("Steps y consumo de tokens por nivel") ocupa espacio permanente aunque el usuario no la necesite durante la sesión activa. No existe mecanismo para ocultarla ni reactivarla sin editar `settings.json` a mano.

## What Changes

- Se añade la variable `SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS` en `settings.env` para controlar la visibilidad de la Tabla 2: solo se renderiza si el valor es `on`; ausente u otro valor → oculta. **BREAKING**: el comportamiento por defecto cambia (Tabla 2 pasa de visible a oculta en instalaciones previas que no tengan la variable).
- Se añade la CLI `scripting/statusline-router-details.ts` con subcomandos `on`, `off` y `toggle` para escribir/invertir ese valor en `settings.json` sin editarlo manualmente.
- Se añaden tres scripts npm (`statusline:router-details:on/off/toggle`) que invocan la CLI directamente con `!npm run …` desde la terminal de Claude Code.

## Capabilities

### New Capabilities

- `statusline-router-details-toggle`: CLI para activar, desactivar o invertir la visibilidad de la Tabla 2 del statusline, persistiendo el estado en `settings.env`.

### Modified Capabilities

- `statusline-runtime`: se añade el requisito de visibilidad condicional de la Tabla 2 — el comportamiento existente de renderizado se subordina al valor de `SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS`.

## Impact

- **`scripting/router-status.ts`**: `buildStatuslineOutput` lee la nueva clave de `settingsEnv`; omite completamente el bloque de Tabla 2 (cálculo de `targetWidth`, `renderTokenTable`, `writeStatuslineCache`) cuando el valor no es `on`.
- **`scripting/shared/claude-settings.ts`**: nueva constante exportada `STATUSLINE_ROUTER_DETAILS_KEY`.
- **`scripting/statusline-router-details.ts`** (nuevo): CLI commander con funciones puras `applyRouterDetails` + `runRouterDetails`.
- **`package.json`**: tres scripts nuevos en el bloque de statusline.
- **`docs/router-statusline.md`**: nota sobre visibilidad condicional (variable, default, comandos).
- Sin impacto en el proxy HTTP ni en `src/`; afecta solo la capa de scripting y settings.
