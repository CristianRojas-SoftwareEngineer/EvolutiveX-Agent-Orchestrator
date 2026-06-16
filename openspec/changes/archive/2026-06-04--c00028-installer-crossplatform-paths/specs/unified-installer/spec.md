## ADDED Requirements

### Requirement: Rutas POSIX-absolutas en todas las entradas de settings.json (S5-global)

El instalador universal SHALL garantizar que **todas** las rutas escritas en
`~/.claude/settings.json` sean absolutas y usen forward slashes (`/`) en todas las
plataformas (Windows, macOS, Linux). Esta garantía extiende S5 —hasta ahora aplicada
solo al comando del statusline— al resto de las entradas generadas:

- `statusLine.command`: rutas POSIX absolutas (ya garantizado por `buildNpxTsxCommand`).
- `hooks[*][*].command`: rutas POSIX absolutas resueltas en install-time (no variables
  de runtime de Claude Code).
- `env.SMART_CODE_PROXY_ROOT`: valor POSIX absoluto.

El orquestador `scripting/setup.ts` SHALL normalizar la raíz del proxy con
`resolvePosixAbsolutePath` antes de propagarla a cualquier función de feature.

#### Scenario: Install en Windows produce comandos con forward slashes

- **WHEN** el instalador se ejecuta en Windows con una raíz de proxy con backslashes
- **THEN** `settings.json` SHALL contener únicamente forward slashes en todos los valores de `command` y en `env.SMART_CODE_PROXY_ROOT`
- **AND** SHALL NOT contener backslashes en ninguna ruta generada por el instalador

#### Scenario: Los comandos de hooks no contienen variables de runtime de Claude Code

- **WHEN** el instalador escribe los hooks en `settings.json`
- **THEN** ningún valor `command` SHALL contener `${CLAUDE_PROJECT_DIR}` ni ninguna otra variable de runtime de Claude Code
- **AND** todas las rutas SHALL estar resueltas a valores literales POSIX absolutos
