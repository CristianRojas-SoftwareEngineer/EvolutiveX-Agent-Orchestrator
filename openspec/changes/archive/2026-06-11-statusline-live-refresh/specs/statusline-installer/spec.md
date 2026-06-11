# statusline-installer Specification (delta)

## MODIFIED Requirements

### Requirement: Instalación del statusline en settings global

El sistema SHALL proporcionar un comando CLI (`install-statusline`) ejecutable desde la raíz del repositorio Smart Code Proxy que configure el statusline en `~/.claude/settings.json` sin modificar variables `ANTHROPIC_*` gestionadas por `configure-provider`.

#### Scenario: Instalación exitosa con refreshInterval por defecto

- **GIVEN** el repositorio contiene `scripting/router-status.ts`
- **AND** `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL` no está definida
- **WHEN** el usuario ejecuta el instalador sin `--dry-run` desde la raíz del repo (o con `--root` apuntando a ella)
- **THEN** `settings.statusLine.type` SHALL ser `command`
- **AND** `settings.statusLine.padding` SHALL ser `0`
- **AND** `settings.statusLine.command` SHALL invocar `router-status.ts` mediante `npx` + `tsx` con `--prefix` en la raíz del proxy
- **AND** `settings.statusLine.refreshInterval` SHALL ser el entero `3`
- **AND** `settings.env.SMART_CODE_PROXY_ROOT` SHALL ser la ruta absoluta resuelta del repositorio del proxy

#### Scenario: Instalación con refreshInterval personalizado por variable de entorno

- **GIVEN** `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL="2"` está definida en el entorno del instalador
- **WHEN** el usuario ejecuta el instalador sin `--dry-run`
- **THEN** `settings.statusLine.refreshInterval` SHALL ser el entero `2`

#### Scenario: Instalación con refreshInterval desactivado

- **GIVEN** `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL="0"` está definida en el entorno del instalador
- **WHEN** el usuario ejecuta el instalador sin `--dry-run`
- **THEN** `settings.statusLine` SHALL NO incluir el campo `refreshInterval`

## ADDED Requirements

### Requirement: Modelo `ClaudeSettings` con `statusLine.refreshInterval`

El modelo de datos `ClaudeSettings` SHALL declarar el campo opcional `statusLine.refreshInterval?: number` (entero, en segundos, ≥ 1 cuando presente). Este campo es la representación tipada del valor persistido en `~/.claude/settings.json` y SHALL ser la única vía de comunicación del `refreshInterval` hacia el script del statusline en tiempo de invocación.

#### Scenario: Modelo declara el campo

- **GIVEN** el archivo `scripting/shared/claude-settings.ts` con la interfaz `ClaudeSettings`
- **WHEN** un consumidor importa `ClaudeSettings` y accede a `settings.statusLine.refreshInterval`
- **THEN** TypeScript SHALL aceptar el acceso sin error de compilación
- **AND** el tipo del campo SHALL ser `number | undefined`

### Requirement: Resolución de cadencia live desde variable de entorno

El instalador SHALL resolver la cadencia de `refreshInterval` leyendo `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL` del entorno del proceso del instalador. El valor representa segundos (mínimo `1`, según la API de Claude Code). Comportamiento por caso:

- **Valor ausente** (variable no presente en `process.env`): SHALL usar el default `3`.
- **String vacío** (`process.env[KEY] === ""`): SHALL omitir el campo `refreshInterval` del JSON resultante.
- **Valor numérico entero positivo** (`"1"`, `"2"`, `"3"`, `"5"`): SHALL escribir el entero correspondiente.
- **Valor numérico `0`**: SHALL omitir el campo `refreshInterval` del JSON resultante.
- **Valor no numérico** (e.g., `"off"`): SHALL usar el default `3` y SHALL imprimir un warning por stderr indicando que el valor fue ignorado.

#### Scenario: Variable de entorno con valor entero positivo

- **GIVEN** `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL="3"`
- **WHEN** el instalador construye el bloque `statusLine`
- **THEN** SHALL escribir `refreshInterval: 3` en el JSON resultante

#### Scenario: Variable de entorno con valor cero

- **GIVEN** `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL="0"`
- **WHEN** el instalador construye el bloque `statusLine`
- **THEN** SHALL omitir el campo `refreshInterval` del JSON resultante

#### Scenario: Variable de entorno con string vacío

- **GIVEN** `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL=""`
- **WHEN** el instalador construye el bloque `statusLine`
- **THEN** SHALL omitir el campo `refreshInterval` del JSON resultante (comportamiento idéntico a `="0"`)

#### Scenario: Variable de entorno ausente

- **GIVEN** `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL` no está presente en `process.env`
- **WHEN** el instalador construye el bloque `statusLine`
- **THEN** SHALL escribir `refreshInterval: 3` (default) en el JSON resultante

#### Scenario: Variable de entorno con valor inválido

- **GIVEN** `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL="off"` (no entero)
- **WHEN** el instalador construye el bloque `statusLine`
- **THEN** SHALL usar el default `3` y SHALL imprimir un warning por stderr indicando que el valor fue ignorado
