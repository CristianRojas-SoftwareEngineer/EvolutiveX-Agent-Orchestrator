## Why

`scripting/router-status.ts` ya implementa el statusline de Smart Code Proxy (tablas de sesión, métricas por nivel y rate limits OAuth), pero su activación sigue siendo manual: el usuario debe editar `~/.claude/settings.json` y, sin una raíz del proxy fijada, las rutas `sessions/`, `routing/` y `configs/.env` se resuelven desde `process.cwd()` del subprocess de Claude Code — que suele ser el workspace abierto, no el repositorio del proxy. Eso deja la Tabla 2 vacía o incorrecta cuando se trabaja en otro proyecto.

Se necesita un instalador dedicado, independiente de `configure-provider`, que configure de forma idempotente y multiplataforma el `statusLine` y la raíz del proxy en el settings global de Claude Code.

## What Changes

- Nuevo script CLI `scripting/install-statusline.ts` con instalación, `--dry-run`, `--force` y `--uninstall`.
- Escritura en `~/.claude/settings.json` de `statusLine` (comando `npx --prefix` + `tsx`) y de `env.SMART_CODE_PROXY_ROOT` (ruta absoluta del repo).
- Módulo compartido para lectura/escritura de `settings.json` (extraído o reutilizado desde `configure-provider.ts`).
- `router-status.ts` resuelve `projectRoot` desde `settings.json → env.SMART_CODE_PROXY_ROOT` con fallback a `process.cwd()` y validación mínima del repo.
- Script npm `install:statusline` en `package.json`.
- Tests Vitest para instalador, resolución de rutas y regresión del statusline.
- Documentación breve de uso (enlace desde guía existente; referencia a [`docs/proposals/router-status-redesign.md`](../../../docs/proposals/router-status-redesign.md) sin duplicar el diseño de tablas).

## Capabilities

### New Capabilities

- `statusline-installer`: CLI que instala o desinstala el statusline en el settings global de Claude Code (`statusLine` + `SMART_CODE_PROXY_ROOT`), con política de sobrescritura y soporte Windows/Linux/macOS.
- `statusline-runtime`: Comportamiento de `router-status.ts` al resolver rutas del proxy desde `SMART_CODE_PROXY_ROOT` en lugar de depender del cwd del subprocess.

### Modified Capabilities

- _(ninguna — `openspec/specs/` aún no existe en el repositorio)_

## No objetivos

- Acoplar la instalación del statusline a `configure-provider` o al cambio de proveedor upstream.
- Modificar el layout de tablas, colores ANSI ni la lógica de dispatch OAuth del statusline ya implementado.
- Wrapper permanente en `~/.claude/bin/` o soporte WSL cruzado (proxy en Linux, Claude en Windows).
- Promover o reescribir por completo `docs/proposals/router-status-redesign.md` (queda como referencia de diseño visual).

## Impact

- **Directorios:** `scripting/` (nuevo instalador, `shared/claude-settings.ts`), `scripting/router-status.ts`, `tests/scripting/`, `package.json`, `docs/how-to-start.md` (párrafo de enlace).
- **Capas PKA:** sin cambios en `src/`; el proxy HTTP y la auditoría en `sessions/` no se modifican, solo cómo el statusline las localiza en disco.
- **Sistemas externos:** `~/.claude/settings.json` del usuario; reinicio de Claude Code tras instalar.
- **Dependencias:** ninguna npm nueva; reutiliza `tsx`, `node:path`, `node:fs`.
