# statusline-installer Specification

## Purpose

CLI dedicado (`install-statusline`) para registrar en `~/.claude/settings.json` el comando del statusline de Smart Code Proxy y la ruta absoluta del repositorio (`SMART_CODE_PROXY_ROOT`), de forma idempotente y multiplataforma, sin alterar las variables `ANTHROPIC_*` gestionadas por `configure-provider`.
## Requirements
### Requirement: Instalación del statusline en settings global

El sistema SHALL proporcionar un comando CLI (`install-statusline`) ejecutable desde la raíz del repositorio Smart Code Proxy que configure el statusline en `~/.claude/settings.json` sin modificar variables `ANTHROPIC_*` gestionadas por `configure-provider`.

#### Scenario: Instalación exitosa

- **GIVEN** el repositorio contiene `scripting/router-status.ts`
- **WHEN** el usuario ejecuta el instalador sin `--dry-run` desde la raíz del repo (o con `--root` apuntando a ella)
- **THEN** `settings.statusLine.type` SHALL ser `command`
- **AND** `settings.statusLine.padding` SHALL ser `0`
- **AND** `settings.statusLine.command` SHALL invocar `router-status.ts` mediante `npx` con `--prefix` en la raíz del proxy
- **AND** `settings.env.SMART_CODE_PROXY_ROOT` SHALL ser la ruta absoluta resuelta del repositorio del proxy

#### Scenario: Modo dry-run

- **GIVEN** un entorno donde se puede leer o simular `~/.claude/settings.json`
- **WHEN** el usuario ejecuta el instalador con `--dry-run`
- **THEN** el proceso SHALL mostrar los valores que se escribirían
- **AND** el archivo `settings.json` SHALL permanecer sin cambios

### Requirement: Política de sobrescritura de statusLine

El instalador SHALL no sobrescribir un bloque `statusLine` existente que no sea de Smart Code Proxy, salvo que el usuario pase `--force`.

#### Scenario: statusLine ajeno sin force

- **GIVEN** `settings.statusLine.command` existe y no referencia `router-status.ts`
- **WHEN** el usuario ejecuta el instalador sin `--force`
- **THEN** el instalador SHALL terminar sin modificar `statusLine`
- **AND** SHALL informar que se requiere `--force` para sobrescribir

#### Scenario: Actualización con force

- **GIVEN** `settings.statusLine` apunta a otro comando
- **WHEN** el usuario ejecuta el instalador con `--force`
- **THEN** `statusLine` SHALL actualizarse al comando de Smart Code Proxy

#### Scenario: Reinstalación idempotente

- **GIVEN** `settings.statusLine.command` ya referencia `router-status.ts`
- **WHEN** el usuario ejecuta el instalador sin `--force`
- **THEN** `statusLine` y `SMART_CODE_PROXY_ROOT` SHALL actualizarse a la raíz y comando actuales del repo

### Requirement: Desinstalación selectiva

El instalador SHALL admitir `--uninstall` que elimine `statusLine` y la clave `env.SMART_CODE_PROXY_ROOT` sin borrar otras claves de `env`.

#### Scenario: Uninstall preserva env del proveedor

- **GIVEN** `settings.env` contiene `ANTHROPIC_BASE_URL` y `SMART_CODE_PROXY_ROOT`
- **WHEN** el usuario ejecuta el instalador con `--uninstall`
- **THEN** `statusLine` SHALL eliminarse
- **AND** `SMART_CODE_PROXY_ROOT` SHALL eliminarse
- **AND** las demás entradas de `settings.env` SHALL conservarse

### Requirement: Validación previa a escribir

El instalador SHALL validar que la raíz del proxy contiene `scripting/router-status.ts` y el directorio `routing/providers` antes de persistir configuración.

#### Scenario: Raíz inválida

- **GIVEN** `--root` o el cwd no contienen `scripting/router-status.ts`
- **WHEN** el usuario ejecuta el instalador
- **THEN** el proceso SHALL fallar con código de salida distinto de cero
- **AND** no SHALL escribir en `settings.json`

### Requirement: Comando multiplataforma

El valor generado para `statusLine.command` SHALL ser ejecutable en Windows, Linux y macOS usando comillas adecuadas para rutas con espacios.

#### Scenario: Ruta con espacios en Windows

- **GIVEN** la raíz del proxy contiene espacios en su ruta
- **WHEN** el instalador genera `statusLine.command` en Windows
- **THEN** la ruta pasada a `npx --prefix` SHALL ir entre comillas dobles escapadas correctamente

#### Scenario: Ruta con espacios en Unix

- **GIVEN** la raíz del proxy contiene espacios en su ruta
- **WHEN** el instalador genera `statusLine.command` en Linux o macOS
- **THEN** la ruta pasada a `npx --prefix` SHALL ir correctamente citada para shell POSIX

