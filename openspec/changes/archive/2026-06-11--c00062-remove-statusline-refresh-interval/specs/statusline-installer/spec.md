# statusline-installer Specification (delta)

## MODIFIED Requirements

### Requirement: Instalación del statusline en settings global

El sistema SHALL proporcionar un comando CLI (`install-statusline`) ejecutable desde la raíz del repositorio Smart Code Proxy que configure el statusline en `~/.claude/settings.json` sin modificar variables `ANTHROPIC_*` gestionadas por `configure-provider`.

#### Scenario: Instalación exitosa

- **GIVEN** el repositorio contiene `scripting/router-status.ts`
- **WHEN** el usuario ejecuta el instalador sin `--dry-run` desde la raíz del repo (o con `--root` apuntando a ella)
- **THEN** `settings.statusLine.type` SHALL ser `command`
- **AND** `settings.statusLine.padding` SHALL ser `0`
- **AND** `settings.statusLine.command` SHALL invocar `router-status.ts` mediante `npx` + `tsx` con `--prefix` en la raíz del proxy
- **AND** `settings.statusLine` SHALL NOT incluir el campo `refreshInterval`
- **AND** `settings.env.SMART_CODE_PROXY_ROOT` SHALL ser la ruta absoluta resuelta del repositorio del proxy

#### Scenario: Modo dry-run

- **GIVEN** un entorno donde se puede leer o simular `~/.claude/settings.json`
- **WHEN** el usuario ejecuta el instalador con `--dry-run`
- **THEN** el proceso SHALL mostrar los valores que se escribirían
- **AND** el JSON mostrado para `statusLine` SHALL NOT incluir `refreshInterval`
- **AND** el archivo `settings.json` SHALL permanecer sin cambios

## REMOVED Requirements

### Requirement: Modelo `ClaudeSettings` con `statusLine.refreshInterval`

**Reason**: El proyecto ya no modela ni consume `refreshInterval`. Configurar el timer quedó fuera del alcance tras corregir la causa raíz de la Tabla 2 estática.

**Migration**: Eliminar el campo opcional `refreshInterval` de la interfaz `ClaudeSettings.statusLine` en `scripting/shared/claude-settings.ts`. Si un usuario mantiene el campo en `settings.json`, Claude Code puede honrarlo según su API; el proxy no lo lee.

### Requirement: Resolución de cadencia live desde variable de entorno

**Reason**: `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL` solo existía para controlar el timer del instalador, que se retira.

**Migration**: Eliminar `STATUSLINE_REFRESH_INTERVAL_KEY`, `resolveRefreshInterval` y su uso en `scripting/setup.ts`. Eliminar `tests/scripting/shared/claude-settings.test.ts`.
