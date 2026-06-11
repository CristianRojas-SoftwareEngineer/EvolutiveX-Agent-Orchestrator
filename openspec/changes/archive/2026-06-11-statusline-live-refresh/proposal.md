## Why

La Tabla 2 del statusline ("Trabajo por niveles de razonamiento") muestra contadores `# Steps` y `# Workflows` derivados de `session-metrics.json`. El proxy ya escribe ese archivo tras cada step billable (`updateFromStep`), por lo que la información en disco es correcta y granular. Sin embargo, la Tabla 2 solo se re-pinta cuando Claude Code invoca el script del statusline, y esos triggers oficiales (assistant message, `/compact`, permission mode, vim mode) con debounce 300ms colapsan todo el agentic loop en una única actualización al final del turno. El usuario observa el statusline "congelado" mientras los tool calls y bloques de razonamiento se renderizan en tiempo real en la GUI, y luego un único salto a los valores finales.

Esta propuesta implementa actualización visible per-step en la Tabla 2 del statusline oficial de Claude Code, usando la palanca documentada `refreshInterval` combinada con cierre temprano basado en `mtime` para que el coste de invocaciones frecuentes (cada 3s) sea despreciable cuando no hay cambios en las métricas. El value-diferencial es claro: la Tabla 2 refleja incrementalmente el progreso del workflow sin hacks sobre la API de Claude Code.

**Alcance de este PR (PR-1)**: solo la palanca `refreshInterval` + cierre temprano + indicador visual. Se difiere la pre-compilación con Bun a un **PR-2 futuro, condicional a métricas de CPU** (ver `design.md` § Decisión deferida).

## What Changes

- Modificar el instalador (`scripting/features/statusline.ts`) para que `statusLine.refreshInterval` quede configurado a `3` segundos por defecto cuando se instala el statusline.
- Añadir lógica de cierre temprano en `router-status.ts`: `stat()` sobre `session-metrics.json`, comparación con `mtime` y `size` cacheados en `.statusline-state.json`, y reimpresión del último render cacheado cuando no hay cambios.
- Añadir los campos `lastRenderedMtimeMs` y `lastRenderedTable2Output` en `StatuslineCache` (`.statusline-state.json`) para soportar el cierre temprano.
- Exponer una variable de entorno `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL` (en segundos, mínimo `1` según la API de Claude Code; `0` o string vacío desactivan el timer, valor no numérico → default `3` con warning, ausente → default `3`) para permitir configurar o desactivar el `refreshInterval` por sesión/usuario.
- Añadir un indicador visual `● live (3s)` en la cabecera de la Tabla 2 cuando el modo live esté activo, para que el usuario sepa que el render se está refrescando por timer y no por trigger de Claude Code.
- Documentar la nueva cadencia de refresh, el modelo de cierre temprano y la variable de control en `docs/router-statusline.md`.
- Añadir tests que cubran: parsing de la variable de entorno, ciclo completo de cierre temprano, indicador visual bajo distintas condiciones.

## Capabilities

### New Capabilities

- `statusline-live-refresh`: comportamiento de actualización visible per-step de la Tabla 2 mediante `refreshInterval` de Claude Code, cierre temprano con caché de mtime, e indicador visual del modo.

### Modified Capabilities

- `statusline-installer`: el instalador SHALL escribir el campo `refreshInterval` en el bloque `statusLine` de `~/.claude/settings.json` y SHALL permitir configurar la cadencia vía variable de entorno `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL`.
- `statusline-runtime`: el script SHALL aplicar cierre temprano cuando `session-metrics.json` no cambió desde el último render, SHALL persistir `lastRenderedMtimeMs` y `lastRenderedTable2Output` en `.statusline-state.json`, y SHALL mostrar el indicador `● live (Ns)` en la cabecera de la Tabla 2 (donde `N` es el valor de `refreshInterval` en segundos).

## Impact

- **Capas PKA afectadas**: `5-user-interfaces` (scripting del statusline).
- **Directorios clave**:
  - `scripting/router-status.ts` — lógica de cierre temprano y cabecera live.
  - `scripting/features/statusline.ts` — instalador con `refreshInterval` configurable.
  - `scripting/shared/claude-settings.ts` — modelo de `ClaudeSettings` extendido con `refreshInterval`, constante de env var, parser.
  - `docs/router-statusline.md` — nueva sección sobre cadencia live.
  - `README.md` — mención breve al modo live.
- **Tests**:
  - `tests/scripting/shared/claude-settings.test.ts` — nuevo (parsing de env var).
  - `tests/scripting/router-status-live-indicator.test.ts` — nuevo (indicador visual).
  - `tests/scripting/features/statusline.test.ts` — extendido (refreshInterval en install).
  - `tests/scripting/router-status-output.test.ts` — sin cambios esperados; un test nuevo del cierre temprano puede añadirse en el mismo archivo.
- **APIs externas**: `~/.claude/settings.json` gana un campo `statusLine.refreshInterval` (entero, ≥1, en segundos). El campo es opcional para Claude Code; si está ausente, Claude Code usa la cadencia por triggers.
- **Dependencias nuevas**: **ninguna**. Este PR no introduce nuevas dependencias. La pre-compilación con Bun queda deferida a PR-2.
- **Rendimiento esperado (PR-1, sin Bun)**:
  - Sin cambios entre renders: cierre temprano en ~5-10ms.
  - Con cambios: render completo + escritura de caché en ~30-50ms.
  - Cold path (spawn npx+tsx+node): ~100-150ms por invocación. A 0.33Hz con `refreshInterval: 3` el CPU steady-state se estima en ~1-3% en una laptop moderna, dominado por el spawn.
- **Compatibilidad**: si el usuario no quiere el modo live, basta con `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL=0` antes de reinstalar, o el campo `refreshInterval` queda omitido del JSON y se conserva la cadencia por triggers.
- **Rollback**: trivial (un `git revert` + `setup:install` restaura el comportamiento previo; no hay migraciones de estado, no hay hooks de `postinstall` que limpiar).
