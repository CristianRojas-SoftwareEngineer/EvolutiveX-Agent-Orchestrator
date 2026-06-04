## 1. Constante compartida en claude-settings.ts

- [x] 1.1 Exportar `STATUSLINE_ROUTER_DETAILS_KEY = 'SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS'` en `scripting/shared/claude-settings.ts`, junto a `SMART_CODE_PROXY_ROOT_KEY`

## 2. CLI de toggle (scripting/statusline-router-details.ts)

- [x] 2.1 Crear `scripting/statusline-router-details.ts` con `applyRouterDetails(settings, action: 'on'|'off'|'toggle'): ClaudeSettings` — función pura que devuelve el objeto con la clave actualizada (toggle: `on`→`off`, cualquier otro valor o ausente→`on`)
- [x] 2.2 Implementar `runRouterDetails({ action, dryRun })` que llama a `readClaudeSettings`, `applyRouterDetails` y, si no es dry-run, `writeClaudeSettings`; `--dry-run` imprime el valor resultante sin escribir
- [x] 2.3 Añadir entrada CLI con commander: subcomandos `on`, `off`, `toggle`; opción global `--dry-run`; mensajes de confirmación en español (incluir nota "el statusline refleja el cambio en el siguiente refresh")

## 3. Scripts npm en package.json

- [x] 3.1 Añadir `"statusline:router-details:on": "tsx scripting/statusline-router-details.ts on"` en `package.json`
- [x] 3.2 Añadir `"statusline:router-details:off": "tsx scripting/statusline-router-details.ts off"` en `package.json`
- [x] 3.3 Añadir `"statusline:router-details:toggle": "tsx scripting/statusline-router-details.ts toggle"` en `package.json`

## 4. Visibilidad condicional en router-status.ts

- [x] 4.1 Importar `STATUSLINE_ROUTER_DETAILS_KEY` en `scripting/router-status.ts`
- [x] 4.2 En `buildStatuslineOutput`, leer `const showRouterDetails = settingsEnv[STATUSLINE_ROUTER_DETAILS_KEY]?.trim().toLowerCase() === 'on'`
- [x] 4.3 Envolver el bloque de Tabla 2 (cálculo de `targetWidth`, `renderTokenTable`, `writeStatuslineCache`, `output.push`) en `if (showRouterDetails) { … }` — el bloque superior (Tabla 1 / Tabla 1+Tabla 3) queda intacto

## 5. Tests unitarios

- [x] 5.1 Crear `tests/scripting/statusline-router-details.test.ts`: cubrir `applyRouterDetails` para los tres subcomandos (on/off/toggle desde ausente, desde `on`, desde `off`); verificar que se preservan otras claves de `env`
- [x] 5.2 Añadir casos en `tests/scripting/router-status-output.test.ts`: con `settingsEnv` sin la clave → output sin Tabla 2; con `=on` → output con Tabla 2; con `=off` → sin Tabla 2; bloque superior presente e intacto en los tres casos
- [x] 5.3 Ejecutar `npm run test:quick` y verificar que los 97 tests previos pasan más los nuevos (sin regresiones)

## 6. Documentación

- [x] 6.1 Añadir en `docs/router-statusline.md` (sección de Tabla 2) una nota sobre visibilidad condicional: nombre de la variable, valor por defecto (oculta), comandos npm disponibles y cómo invocarlos con `!` en Claude Code
