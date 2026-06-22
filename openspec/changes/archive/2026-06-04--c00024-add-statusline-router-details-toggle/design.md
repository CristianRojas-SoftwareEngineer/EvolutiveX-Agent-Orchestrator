## Context

El statusline de Smart Code Proxy se renderiza en cada refresh de Claude Code invocando `scripting/router-status.ts` como subprocess. Su única fuente de configuración en tiempo de ejecución es el bloque `env` de `~/.claude/settings.json` (leído por `readClaudeSettingsEnv` vía `scripting/shared/claude-settings.ts`): el subprocess no hereda variables del shell del usuario.

La función `buildStatuslineOutput` siempre renderiza las tres tablas (sesión, métricas, rate limits). No existe mecanismo para suprimirlas condicionalmente.

El patrón establecido para persistir configuración del statusline es: un script CLI (`install-statusline.ts`, `install-notifications.ts`) con funciones puras testeables que aplican un merge sobre `ClaudeSettings` y delegan la escritura a `writeClaudeSettings`.

## Goals / Non-Goals

**Goals:**
- Permitir ocultar o mostrar la Tabla 2 entre refreshes sin editar `settings.json` manualmente.
- CLI invocable con `!npm run …` directamente desde la terminal de Claude Code.
- Comportamiento por defecto: Tabla 2 **oculta** (opt-in). Instalaciones previas deberán activar la vista explícitamente.
- Retrocompatibilidad total en la API de `buildStatuslineOutput`: la firma y contratos con tests existentes no cambian; solo se añade una lectura del nuevo key en `settingsEnv`.

**Non-Goals:**
- No se añade un flag de línea de comandos a `router-status.ts`.
- No se crea un hook o automatismo que active/desactive la vista en función de algún evento.
- No se controlan la Tabla 1 ni la Tabla 3.
- No se tocan capas `src/` (proxy HTTP, dominio, services).

## Decisions

### D1: persistir en `settings.env`, no en `process.env` / `configs/.env`

`router-status.ts` es un subprocess de Claude Code; no hereda el entorno del shell del usuario. La única fuente de configuración que el proceso del statusline puede leer en cada invocación es `~/.claude/settings.json → env`. Se sigue el mismo patrón que `EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT` y las variables de proveedor.

Alternativa considerada: escribir en `configs/.env`. Descartada: ese archivo no se lee en `router-status.ts` (y cargarlo añadiría una dependencia nueva).

### D2: default oculto (opt-in)

La variable ausente = oculta (no `on`). Esto favorece un statusline más limpio en el caso base y hace la activación explícita e intencional. La implementación es una sola condición: `value?.trim().toLowerCase() === 'on'`.

Alternativa considerada: default visible (opt-out, mantiene comportamiento actual). Descartada por el usuario: se prefiere que la Tabla 2 sea una vista activable a demanda.

### D3: subcomandos `on` / `off` / `toggle` (no flag `--action`)

Coherente con `session-manager/cli.ts` (usa subcomandos como primer argumento posicional). Cada subcomando es un command de commander; `toggle` lee el estado actual y escribe el opuesto (`on`→`off`, cualquier otro (incluido ausente)→`on`).

### D4: separar lógica pura de I/O (espejo de `install-statusline.ts`)

`applyRouterDetails(settings, action)` → `ClaudeSettings` pura y testeable sin mocks de fs.
`runRouterDetails({ action, dryRun })` → orquesta lectura, apply y escritura; expone `--dry-run`.

## Risks / Trade-offs

- **Breaking default**: instalaciones existentes verán la Tabla 2 desaparecer tras actualizar el repo. Mitigación: documentar en `docs/router-statusline.md` y en el mensaje de salida de `npm run statusline:router-details:on`.
- **`writeStatuslineCache` se omite cuando Tabla 2 está oculta**: el snapshot de métricas no se actualiza. Al reactivar la Tabla 2 se calculan deltas desde el último snapshot guardado (que puede ser antiguo). Mitigación: comportamiento aceptable — el delta simplemente será mayor; no hay corrupción de datos.
- **Clave con doble guion bajo** (`EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS`): el doble `__` es intencional (lo eligió el usuario) y no entra en conflicto con otras claves del bloque `env`.
