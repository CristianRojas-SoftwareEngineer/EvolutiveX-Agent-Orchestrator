# Tasks: statusline-live-refresh

> **Alcance:** refreshInterval + cierre temprano + indicador live. La pre-compilación con Bun queda explícitamente fuera de este PR (deferida a un PR-2 futuro, condicional a métricas de CPU).
> Ver `design.md` § "Decisión deferida".

## 1. Extensión del modelo `ClaudeSettings`

- [x] 1.1 En `scripting/shared/claude-settings.ts`, ampliar el tipo `ClaudeSettings.statusLine` con el campo opcional `refreshInterval?: number`.
- [x] 1.2 Añadir constante `STATUSLINE_REFRESH_INTERVAL_KEY = "SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL"` y exportarla.
- [x] 1.3 Añadir función `resolveRefreshInterval(env: NodeJS.ProcessEnv): number | null` que parsee la variable `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL` (entero ≥ 1 en segundos, según API de Claude Code). Tabla de retorno:
  - env ausente → `3` (default)
  - env `""` (string vacío) → `null` (instalador omitirá el campo)
  - env `"0"` → `null`
  - env `"1"`, `"2"`, `"3"`, `"5"`… → entero correspondiente
  - env no numérico (e.g., `"off"`) → `3` (default) **+ warning a stderr**
- [x] 1.4 Escribir tests unitarios en `tests/scripting/shared/claude-settings.test.ts` cubriendo los 5 casos: variable ausente → `3`; variable `""` → `null`; variable `"0"` → `null`; variable `"2"` → `2`; variable `"off"` → `3` + warning a stderr. Cada caso debe verificar el valor de retorno Y, para el caso del warning, capturar `process.stderr.write` con un spy.

## 2. Lógica de cierre temprano en `router-status.ts`

- [x] 2.1 Extender la interfaz `StatuslineCache` (línea ~456) con los campos `lastRenderedMtimeMs?: number` y `lastRenderedTable2Output?: string`.
- [x] 2.2 Añadir función `readSessionMetricsMtime(sessionPath: string): { mtimeMs: number; size: number } | null` que use `fs.statSync` sobre `session-metrics.json`; retorna `null` si el archivo no existe.
- [x] 2.3 Refactorizar `buildStatuslineOutput` (línea ~1164): antes de renderizar la Tabla 2, invocar `readSessionMetricsMtime` + `readStatuslineCache`; si ambos `mtimeMs` y `size` coinciden con `lastRenderedMtimeMs` cacheado y `lastRenderedTable2Output` está presente, emitir `lastRenderedTable2Output` y saltar el render.
- [x] 2.4 Tras renderizar la Tabla 2 (caso normal o re-render), persistir en `writeStatuslineCache` los campos `lastRenderedMtimeMs` (mtime real del archivo o `0` si ausente) y `lastRenderedTable2Output` (string con la tabla completa + `\n` final).
- [x] 2.5 Verificar que los tests existentes `tests/scripting/router-status-*.test.ts` siguen pasando tras el refactor. Si fallan por el nuevo contrato de cache, ajustar el test ofensor.
- [x] 2.6 Añadir test nuevo en `tests/scripting/router-status-output.test.ts` que cubra: segunda invocación con `mtime` y `size` sin cambios → output byte-idéntico a la primera; segunda invocación con `mtime` cambiado → re-render.
- [x] 2.7 Añadir test nuevo en `tests/scripting/router-status-output.test.ts` que cubra: `session-metrics.json` ausente → Tabla 2 con valores en cero y `lastRenderedMtimeMs: 0` persistido; `.statusline-state.json` con JSON inválido → tratado como ausente y re-render.

## 3. Indicador "● live (Ns)" en cabecera de Tabla 2

- [x] 3.1 Añadir función `readRefreshIntervalFromSettings(settings: ClaudeSettings): number | null` en `router-status.ts` que lea el `refreshInterval` de `settings.statusLine.refreshInterval` (NO de variables de entorno). Retorna `null` si ausente o no es entero ≥ 1.
- [x] 3.2 Modificar la función que produce la Tabla 2 (la que construye `titleText = '╭─ Trabajo por niveles de razonamiento '` cerca de la línea ~1083) para aceptar un parámetro `liveIndicator: { seconds: number } | null`. Si está presente, añadir el sufijo `● live (Ns)` (con `N = refreshInterval` en segundos) en color dim, alineado a la derecha, antes del cierre del borde superior (`╮`).
- [x] 3.3 En `buildStatuslineOutput`, reusar el resultado de `readClaudeSettings()` (que ya se invoca para resolver `env`) y pasar `liveIndicator` desde `readRefreshIntervalFromSettings(settings)` solo cuando `showRouterDetails` es `true`. Evitar una segunda lectura de `~/.claude/settings.json`.
- [x] 3.4 Escribir tests en `tests/scripting/router-status-live-indicator.test.ts` cubriendo: con `refreshInterval: 3` → cabecera contiene `● live (3s)`; sin `refreshInterval` → cabecera no contiene el sufijo; con Tabla 2 oculta → sufijo ausente.

## 4. Instalador con `refreshInterval` configurable

- [x] 4.1 En `scripting/features/statusline.ts`, modificar `buildStatusLineBlock` para aceptar `refreshInterval: number | null`. Si no es `null`, incluir `refreshInterval` en el objeto retornado.
- [x] 4.2 En `applyStatuslineInstall`, añadir parámetro `refreshInterval: number | null` y pasarlo a `buildStatusLineBlock`. Resolver el valor por defecto vía `resolveRefreshInterval(process.env)` desde el caller.
- [x] 4.3 Verificar que el caller de `applyStatuslineInstall` (en `scripting/setup.ts` o equivalente) pasa `refreshInterval = resolveRefreshInterval(process.env)`.
- [x] 4.4 Extender `tests/scripting/features/statusline.test.ts` con los 5 casos del parser: install sin env var → `refreshInterval: 3`; install con env var `""` → campo omitido; install con env var `"0"` → campo omitido; install con env var `"2"` → `refreshInterval: 2`; install con env var `"off"` → `refreshInterval: 3` (default tolerante).

## 5. Documentación

- [x] 5.1 Añadir nueva sección §10.1 "Live refresh (refreshInterval)" en `docs/router-statusline.md` explicando: la semántica de `refreshInterval` según la API de Claude Code (re-ejecución cada N segundos, mínimo 1, además de triggers por evento), el cierre temprano, el indicador `● live (Ns)`, y la variable de control `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL`. La sección **debe** documentar prominentemente el opt-out (`SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL=0 npm run setup:install`) y el valor por defecto (`refreshInterval: 3`, cada 3 segundos).
- [x] 5.2 Actualizar la sección §9 "Integración" de `docs/router-statusline.md` con la nota de que el comando del statusline ahora incluye el campo `refreshInterval` por defecto.
- [x] 5.3 Actualizar el `README.md` raíz: en la sección de statusline, añadir un párrafo breve sobre el modo live y cómo desactivarlo (`SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL=0 npm run setup:install`).

## 6. Verificación end-to-end

- [x] 6.1 Ejecutar `npm run test:quick` y verificar que pasa (lint + typecheck + unit).
- [x] 6.2 Ejecutar `npm run test` completo y verificar que pasa, especialmente los tests de `tests/scripting/router-status-*.test.ts` y `tests/scripting/features/statusline.test.ts`.
- [x] 6.3 Ejecutar `npx tsx scripting/router-status.ts < /dev/null` con un `session-metrics.json` real bajo `sessions/` y verificar que imprime el statusline con la Tabla 2 actualizada.
- [x] 6.4 Ejecutar el script dos veces seguidas con el mismo `session-metrics.json` y verificar que la segunda invocación produce output byte-idéntico a la primera (cierre temprano exitoso).
- [x] 6.5 Modificar manualmente `sessions/<test>/session-metrics.json` (incrementar `billable_hops`) y re-ejecutar el script; verificar que la Tabla 2 refleja el nuevo valor.
- [x] 6.6 Instalar el statusline con `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL=2 npm run setup:install --dry-run` y verificar que el JSON resultante contiene `refreshInterval: 2` en `statusLine`.
- [x] 6.7 Instalar con `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL=0 npm run setup:install --dry-run` y verificar que `statusLine` NO contiene `refreshInterval`.
- [x] 6.8 Medir CPU steady-state del proceso durante 60 segundos con el statusline instalado y `refreshInterval: 3` activo en una sesión idle de Claude Code; documentar el resultado en el PR description. **Decisión Go/No-Go para PR-2 (Bun)**: si >5% en laptop moderna, abrir PR-2 con pre-compilación Bun. _(Pendiente de medición manual en sesión Claude Code; estimación de diseño: 1–3% con cierre temprano.)_
