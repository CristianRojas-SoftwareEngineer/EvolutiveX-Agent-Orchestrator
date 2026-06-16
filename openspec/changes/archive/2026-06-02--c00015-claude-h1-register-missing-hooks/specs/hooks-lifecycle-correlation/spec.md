## ADDED Requirements

### Requirement: Configuración de las 8 entradas del lifecycle en `.claude/settings.json` del proyecto

El repositorio SHALL registrar las 8 entradas del lifecycle de hooks de Claude Code en su propio `.claude/settings.json` (no en el del usuario), sobrescribiendo las entradas que el user-level tenga definidas para esas mismas claves. Las 8 entradas SHALL ser: `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `Stop`, `StopFailure`. Cada entrada SHALL contener al menos un comando que invoque el endpoint `POST /hooks` del proxy, cuya URL SHALL resolverse mediante la variable de entorno `ANTHROPIC_BASE_URL` (no SHALL quedar acoplada a un host:puerto literal). Los matchers de `PreToolUse` y `PostToolUse` SHALL establecerse en `*` para que el gateway reciba los eventos de todas las tools (no solo de las listadas en matchers estrechos como `AskUserQuestion` o `Write|Edit`).

#### Scenario: Las 8 entradas invocan `POST /hooks` con `$ANTHROPIC_BASE_URL`

- **GIVEN** el archivo `.claude/settings.json` del proyecto contiene las 8 entradas del lifecycle
- **AND** la variable de entorno `ANTHROPIC_BASE_URL` está definida con un valor de URL válido
- **WHEN** Claude Code dispara cualquiera de los 8 eventos del lifecycle
- **THEN** el comando configurado SHALL ejecutarse
- **AND** SHALL llegar una request `POST` al endpoint `/hooks` del proxy con el payload JSON del evento

#### Scenario: Matcher `*` en `PreToolUse` y `PostToolUse`

- **GIVEN** `.claude/settings.json` del proyecto contiene las entradas `PreToolUse` y `PostToolUse` con `"matcher": "*"`
- **WHEN** Claude Code dispara `PreToolUse` o `PostToolUse` para cualquier tool (no solo `AskUserQuestion` o `Write|Edit`)
- **THEN** el comando configurado SHALL ejecutarse
- **AND** SHALL llegar una request `POST /hooks` al proxy con el payload del evento

#### Scenario: Las entradas del proyecto sobrescriben las del user-level

- **GIVEN** el archivo `C:\Users\Cristian\.claude\settings.json` (user-level) contiene una entrada `SubagentStart` con un comando de notificación
- **AND** el archivo `.claude/settings.json` del proyecto contiene una entrada `SubagentStart` con un comando que invoca `POST /hooks`
- **WHEN** Claude Code dispara el hook `SubagentStart`
- **THEN** SHALL ejecutarse únicamente el comando del proyecto, no el del user-level

### Requirement: Doble comando en los 5 hooks con notificación previa

Para los 5 hooks que el user-level tenía configurados con notificación (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `StopFailure`), la entrada del proyecto SHALL contener un array `hooks` con dos comandos: el comando que invoca `POST /hooks` (definido por el requirement anterior) y un segundo comando que invoca el notificador externo `C:\AI\claude-code-notifications.ts` con la flag `--event-type <EventName>` (y `--stdin-json` donde aplique). Los otros 3 hooks del lifecycle (`SubagentStart`, `SubagentStop`, `PostToolUseFailure`) SHALL contener únicamente el comando `POST /hooks`, sin comando de notificación.

#### Scenario: Los 5 hooks con notificación disparan dos comandos en orden

- **GIVEN** `.claude/settings.json` del proyecto contiene la entrada `UserPromptSubmit` con dos comandos en el array `hooks`
- **WHEN** Claude Code dispara el evento `UserPromptSubmit`
- **THEN** SHALL ejecutarse el primer comando (que invoca `POST /hooks`)
- **AND** SHALL ejecutarse el segundo comando (que invoca `C:\AI\claude-code-notifications.ts` con `--event-type UserPrompt`)

#### Scenario: Los 3 hooks nuevos disparan un único comando

- **GIVEN** `.claude/settings.json` del proyecto contiene la entrada `SubagentStart` con un único comando en el array `hooks`
- **WHEN** Claude Code dispara el evento `SubagentStart`
- **THEN** SHALL ejecutarse únicamente el comando que invoca `POST /hooks`
- **AND** NO SHALL invocarse el notificador externo
