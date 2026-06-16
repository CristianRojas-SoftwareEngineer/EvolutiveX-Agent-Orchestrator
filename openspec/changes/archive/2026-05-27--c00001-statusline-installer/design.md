## Context

`scripting/router-status.ts` (~1050 líneas) renderiza el statusline de Claude Code para Smart Code Proxy: lee stdin (`$ctx`), `~/.claude/settings.json → env`, `configs/.env` (`UPSTREAM_ORIGIN`) y `sessions/<id>/session-metrics.json`. Está cubierto por tests en `tests/scripting/router-status-*.test.ts`.

`configure-provider.ts` ya implementa lectura/escritura de `~/.claude/settings.json` vía `ClaudeSettingsEnvManager`, pero solo gestiona variables `ANTHROPIC_*` y `UPSTREAM_ORIGIN` en el servidor. No escribe `statusLine`.

El diseño visual y de tablas permanece en [`docs/proposals/router-status-redesign.md`](../../../docs/proposals/router-status-redesign.md). Este change solo cubre instalación y resolución de rutas multiplataforma.

## Goals / Non-Goals

**Goals:**

- Script dedicado `install-statusline.ts` independiente del proveedor upstream.
- Persistir `statusLine` y `env.SMART_CODE_PROXY_ROOT` en settings global.
- `router-status` resuelve `projectRoot` desde settings antes que `process.cwd()`.
- Comando `statusLine` portable (Windows/Linux/macOS) sin sintaxis `cd /d` distinta por SO.
- Tests y documentación mínima de uso.

**Non-Goals:**

- Cambios en `src/` (proxy HTTP, handlers de auditoría).
- Integración en `configure-provider`.
- Wrappers en `~/.claude/bin/`, soporte WSL cruzado, o promoción completa de la propuesta de rediseño a docs canónicas.

## Decisions

### 1. Script dedicado vs extensión de configure-provider

**Decisión:** `scripting/install-statusline.ts` como CLI propio (Commander o patrón mínimo alineado con scripts existentes).

**Rationale:** El statusline es capacidad del proxy, no del proveedor; evita reinstalación al cambiar upstream y no mezcla `clean` del proveedor con el statusline.

**Alternativa rechazada:** Hook post-`applyConfig` en `configure-provider` — acoplamiento y riesgo de borrar `statusLine` en flujos de limpieza.

### 2. Módulo compartido `scripting/shared/claude-settings.ts`

**Decisión:** Extraer `readClaudeSettings`, `writeClaudeSettings`, `CLAUDE_SETTINGS_PATH` y tipo `ClaudeSettings` desde `configure-provider.ts`; ambos scripts importan desde ahí.

**Rationale:** Una sola implementación de merge JSON; evita divergencia al escribir `statusLine` y `env`.

**Alternativa rechazada:** Duplicar ~30 líneas en el instalador — deuda de mantenimiento inmediata.

### 3. Comando statusLine: `npx --prefix`

**Decisión:**

```text
npx --prefix "<ROOT>" tsx scripting/router-status.ts
```

con `<ROOT>` = `path.resolve(proxyRoot)` y citado según `process.platform === 'win32'`.

**Rationale:** Una forma de comando en los tres SO; `npx` resuelve `tsx` desde `node_modules` del proxy sin depender del cwd del workspace de Claude Code.

**Alternativas rechazadas:**

- `cd /d` + ruta relativa — sintaxis distinta cmd vs bash.
- Solo ruta absoluta al `.ts` sin `--prefix` — `npx` puede no usar el `tsx` local del proyecto.

### 4. Variable `SMART_CODE_PROXY_ROOT` en `settings.json → env`

**Decisión:** El instalador escribe ruta absoluta nativa (`path.resolve`). `router-status` lee vía `readClaudeSettingsEnv()` existente; nueva función exportada `resolveProjectRoot(settingsEnv, cwd?)`.

**Validación:** Si `join(root, 'routing', 'providers')` no existe, fallback a `cwd`.

**Rationale:** Alineado con el contrato actual del statusline (no `process.env` del shell); permite Tabla 2 correcta con Claude Code abierto en otro repo.

**Prioridad en runtime:** `StatuslineBuildOptions.projectRoot` (tests) > `SMART_CODE_PROXY_ROOT` válido > `process.cwd()`.

### 5. Política de sobrescritura

**Decisión:**

- Sin `--force`: actualizar si no hay `statusLine`, o si `command` incluye `router-status.ts`; en caso contrario abortar con mensaje.
- Con `--force`: siempre escribir.
- `--uninstall`: eliminar solo `statusLine` y `SMART_CODE_PROXY_ROOT`.

**Rationale:** Protege statuslines personalizados; permite reinstalar tras mover el repo.

### 6. CLI flags

| Flag | Efecto |
|------|--------|
| `--root <path>` | Raíz del proxy (default: `process.cwd()`) |
| `--dry-run` | Log sin escribir |
| `--force` | Sobrescribir `statusLine` ajeno |
| `--uninstall` | Quitar entradas del proxy |

### 7. Tests

- `tests/scripting/install-statusline.test.ts`: comando generado, política force, dry-run, uninstall (settings en temp).
- Ampliar tests de `router-status`: `resolveProjectRoot` con ROOT válido/inválido/ausente.
- Regresión: tests existentes de `buildStatuslineOutput` siguen pasando.

### 8. Documentación

- Párrafo en `docs/how-to-start.md`: `npm run install:statusline`, reinicio de Claude Code, enlace a propuesta de rediseño para layout de tablas.

## Risks / Trade-offs

| Riesgo | Mitigación |
|--------|------------|
| Claude Code usa shell distinto al esperado en Windows | `npx --prefix` con comillas dobles; documentar requisito de Node/npx en PATH |
| Usuario mueve repo sin reinstalar | Mensaje post-install: re-ejecutar tras mover; ROOT inválido → fallback cwd (métricas pueden seguir vacías) |
| `openspec/config.yaml` rules de design ignoradas por CLI | Warning conocido; no bloquea el change |
| Extracción de `claude-settings.ts` rompe configure-provider | Refactor mecánico + `npm run test:quick` |

## Migration Plan

1. Implementar módulo compartido y `resolveProjectRoot` en `router-status`.
2. Añadir `install-statusline.ts` y script npm.
3. Usuario ejecuta `npm run install:statusline` desde la raíz del proxy.
4. Reiniciar Claude Code.
5. Rollback: `npm run install:statusline -- --uninstall` (o flag equivalente).

Usuarios con `statusLine` manual previo: si apunta a `router-status.ts`, la reinstalación actualiza rutas; si no, usar `--force` conscientemente.

## Open Questions

- _(ninguna bloqueante)_ — Fallback a `cwd` ante ROOT inválido está acordado en specs; fail-hard queda descartado para v1.
