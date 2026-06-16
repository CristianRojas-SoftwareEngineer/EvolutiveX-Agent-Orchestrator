# Spec delta: hooks-lifecycle-correlation

> **Orquestador:** `claude-code-hooks-implementation` | **Fase:** n2 (N)
>
> Modifica la spec canónica `hooks-lifecycle-correlation` para reflejar
> que el 2º comando de los 5 hooks con doble comando apunta al entry
> point del servicio de notificaciones migrado al repositorio, no al
> script externo `C:\AI\claude-code-notifications.ts`.

## MODIFIED Requirements

### Requirement: Doble comando en los 5 hooks con notificación previa

La entrada del proyecto MUST contener, para los 5 hooks con notificación
previa (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`,
`StopFailure`), un array `hooks` con dos comandos. El primer comando
invoca `POST /hooks` (definido por el requirement anterior). El segundo
comando invoca el entry point CLI del servicio de notificaciones
migrado al repositorio (`src/2-services/notifications/cli.ts`), con
paths **relativos** a la raíz del proyecto y la flag `--event-type
<EventName>` (y `--stdin-json` donde aplique). Los otros 3 hooks del
lifecycle (`SubagentStart`, `SubagentStop`, `PostToolUseFailure`) MUST
contener únicamente el comando `POST /hooks`, sin comando de
notificación.

#### Scenario: Los 5 hooks con notificación disparan dos comandos en orden

- **GIVEN** `.claude/settings.json` del proyecto contiene la entrada
  `UserPromptSubmit` con dos comandos en el array `hooks`
- **WHEN** Claude Code dispara el evento `UserPromptSubmit`
- **THEN** SHALL ejecutarse el primer comando (que invoca `POST /hooks`)
- **AND** SHALL ejecutarse el segundo comando (que invoca el entry
  point CLI del servicio de notificaciones migrado al repositorio,
  `src/2-services/notifications/cli.ts`, con `--event-type
  UserPromptSubmit`)

#### Scenario: Los 3 hooks nuevos disparan un único comando

- **GIVEN** `.claude/settings.json` del proyecto contiene la entrada
  `SubagentStart` con un único comando en el array `hooks`
- **WHEN** Claude Code dispara el evento `SubagentStart`
- **THEN** SHALL ejecutarse únicamente el comando que invoca
  `POST /hooks`
- **AND** NO SHALL invocarse el notificador externo
