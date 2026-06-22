## ADDED Requirements

### Requirement: Relay unificado `gateway-hook-notify` (stdin-json + gateway)

Para los hooks de lifecycle que necesitan **`POST /hooks` y toast con mensaje derivado de stdin**, el repositorio SHALL declarar un **único** comando por clave de evento que ejecute `scripting/gateway-hook-notify.ts` con `--event-type <EventName>`, en lugar de dos comandos paralelos (`post-hook-event.ts` + `cli.ts --stdin-json`).

El relay SHALL:

1. Leer el payload JSON del hook **una sola vez** desde stdin como `Buffer` y decodificarlo en UTF-8.
2. Reenviar el cuerpo sin transformar a `POST /hooks` (misma semántica que `post-hook-event.ts`).
3. Parsear el JSON, invocar `buildEvent` con `stdinJson: true` y el `eventType` indicado, y emitir el toast vía `DesktopNotificationAdapter`.

Eventos cubiertos en v1: `UserPromptSubmit`, `StopFailure`.

El repositorio SHALL NOT configurar para esos eventos múltiples comandos en paralelo que lean stdin por separado.

**Módulos normativos:** `scripting/gateway-hook-notify.ts`; builder `buildGatewayHookNotifyCommand` en `scripting/shared/gateway-hook-command.ts`.

#### Scenario: `UserPromptSubmit` con prompt UTF-8 → gateway y toast con tildes

- **GIVEN** `configs/hooks.json` declara un único comando `gateway-hook-notify.ts --event-type UserPromptSubmit`
- **AND** el payload stdin incluye `prompt` con caracteres acentuados del español (p. ej. «sesión», «configuración»)
- **WHEN** Claude Code dispara `UserPromptSubmit`
- **THEN** SHALL llegar `POST /hooks` con el payload completo
- **AND** SHALL emitirse un toast cuyo `message` contenga el preview del `prompt` con las tildes preservadas

#### Scenario: `StopFailure` con error y last_assistant_message

- **GIVEN** un único comando `gateway-hook-notify.ts --event-type StopFailure`
- **WHEN** el payload incluye `error` y `last_assistant_message` con texto UTF-8
- **THEN** SHALL ejecutarse `POST /hooks`
- **AND** el toast SHALL usar el formatter de `StopFailure` (línea de error + preview del asistente)

#### Scenario: Configuración con dos lectores paralelos → anti-patrón documentado

- **GIVEN** una configuración incorrecta con `post-hook-event.ts` y `cli.ts --stdin-json` en paralelo para el mismo evento
- **WHEN** el segundo proceso recibe stdin vacío o JSON inválido
- **THEN** el toast dinámico puede fallar o degradarse (comportamiento incorrecto)
- **AND** la plantilla canónica del repo SHALL NOT usar ese patrón

---

### Requirement: Relay unificado `pre-tool-use-hook-ux` (PreToolUse)

Para `PreToolUse`, el repositorio SHALL declarar **una sola** entrada con `matcher: "*"` que ejecute `scripting/pre-tool-use-hook-ux.ts`, en lugar de separar `post-hook-event.ts` (matcher `*`) y `cli.ts --stdin-json` (matcher `AskUserQuestion`) en paralelo.

El relay SHALL:

1. Leer stdin una vez (UTF-8).
2. Ejecutar siempre `POST /hooks`.
3. Emitir toast **solo** si `resolveHookNotificationMessage('PreToolUse', payload)` devuelve texto (p. ej. `tool_input.questions` en `AskUserQuestion`).

Para tools sin preguntas (p. ej. `Bash`), SHALL NOT emitirse toast.

**Módulo normativo:** `scripting/pre-tool-use-hook-ux.ts`.

#### Scenario: `AskUserQuestion` con pregunta acentuada

- **GIVEN** payload con `tool_input.questions[0].question` en español con tildes
- **WHEN** se ejecuta `pre-tool-use-hook-ux.ts`
- **THEN** SHALL ejecutarse `POST /hooks`
- **AND** el toast SHALL contener el conteo de preguntas y preview con tildes preservadas

#### Scenario: `PreToolUse` para Bash sin questions

- **GIVEN** payload con `tool_name: "Bash"` y sin `tool_input.questions`
- **WHEN** se ejecuta `pre-tool-use-hook-ux.ts`
- **THEN** SHALL ejecutarse `POST /hooks`
- **AND** SHALL NOT emitirse toast

---

## MODIFIED Requirements

### Requirement: Doble comando en los hooks de lifecycle con notificación (excepto `Stop`)

La entrada del proyecto MUST contener, para los **2 hooks de lifecycle con doble comando** (`SubagentStart`, `SubagentStop`), un array `hooks` con dos comandos. El primer comando invoca `POST /hooks`. El segundo invoca el entry point CLI del servicio de notificaciones (`src/2-services/notifications/cli.ts`) con `--event-type` y `--message "<texto fijo>"` según la tabla.

Los hooks **`UserPromptSubmit`** y **`StopFailure`** NO entran en este requirement: SHALL usar el relay unificado `gateway-hook-notify.ts` (un solo comando; ver requirement «Relay unificado `gateway-hook-notify`»).

El hook **`Stop`** NO entra en este requirement: SHALL cumplir el requirement «Relay unificado del hook `Stop`» (`stop-hook-ux.ts`).

El hook **`PreToolUse`** NO entra en este requirement: SHALL cumplir el requirement «Relay unificado `pre-tool-use-hook-ux`».

Los hooks `PostToolUse` (matcher `*`) y `PostToolUseFailure` MUST contener únicamente `POST /hooks`, sin comando de notificación.

**Mensajes fijos por hook de notificación (solo Subagent*):**

| Hook | `--message` |
|---|---|
| `SubagentStart` | `"Subagente iniciado"` |
| `SubagentStop` | `"Subagente terminado"` |

#### Scenario: `SubagentStart` dispara dos comandos en orden

- **GIVEN** `.claude/settings.json` del proyecto contiene la entrada `SubagentStart` con dos comandos en el array `hooks`
- **WHEN** Claude Code dispara el evento `SubagentStart`
- **THEN** SHALL ejecutarse el primer comando (que invoca `POST /hooks`)
- **AND** SHALL ejecutarse el segundo comando (CLI con `--event-type SubagentStart --message "Subagente iniciado"`)

#### Scenario: `UserPromptSubmit` usa un solo relay (no doble comando)

- **GIVEN** la plantilla canónica `configs/hooks.json` para `UserPromptSubmit`
- **WHEN** se inspecciona el array `hooks`
- **THEN** SHALL existir exactamente un comando
- **AND** el comando SHALL invocar `gateway-hook-notify.ts` con `--event-type UserPromptSubmit`
- **AND** SHALL NOT existir un segundo comando paralelo a `post-hook-event.ts` o `cli.ts --stdin-json` para la misma clave

#### Scenario: Los hooks `PostToolUse` / `PostToolUseFailure` disparan un único comando

- **GIVEN** la entrada `PreToolUse` con `matcher: "*"` apunta a `pre-tool-use-hook-ux.ts`
- **WHEN** Claude Code dispara `PreToolUse` para cualquier tool
- **THEN** SHALL ejecutarse un único proceso que invoca `POST /hooks`
- **AND** el toast SHALL emitirse solo cuando el formatter de `PreToolUse` produzca mensaje

---

### Requirement: Notificaciones de UX no-lifecycle en `.claude/settings.json` del proyecto

El proyecto SHALL declarar **5 entradas adicionales** en `.claude/settings.json` para notificaciones de UX que no forman parte del lifecycle de correlación del gateway: `SessionStart` (con `matcher: "startup|resume"`), `SessionEnd`, `PermissionRequest`, `TaskCreated`, y `TaskCompleted`. Cada entrada SHALL contener un **único comando**: el entry point CLI (`src/2-services/notifications/cli.ts`) con `--event-type` y `--stdin-json` o `--message` fijo según la tabla operativa en `docs/notifications.md`.

La notificación de **`PreToolUse` / `AskUserQuestion`** NO es una entrada UX separada: SHALL cubrirse por el relay `pre-tool-use-hook-ux.ts` en la entrada lifecycle `PreToolUse` con `matcher: "*"`.

> **Nota:** `TaskCreated` / `TaskCompleted` omiten `matcher` en settings (comportamiento nativo de Claude Code).

#### Scenario: `PermissionRequest` sigue con CLI único y stdin-json

- **GIVEN** la entrada `PermissionRequest` con un solo comando `cli.ts --event-type PermissionRequest --stdin-json`
- **WHEN** Claude Code dispara `PermissionRequest`
- **THEN** SHALL NOT existir un segundo comando paralelo `post-hook-event.ts` en esa clave
- **AND** el toast SHALL derivarse del formatter con `tool_name` y preview de `tool_input`

#### Scenario: Ya no existe segunda entrada `PreToolUse` / `AskUserQuestion` solo para toast

- **GIVEN** `configs/hooks.json` canónico del repo
- **WHEN** se listan las claves bajo `hooks.PreToolUse`
- **THEN** SHALL existir un solo bloque con `matcher: "*"`
- **AND** SHALL NOT existir un bloque adicional con `matcher: "AskUserQuestion"` solo para `cli.ts`

---

### Requirement: Distribución de hooks de SCP en `~/.claude/settings.json` (user-level)

El sistema SHALL proporcionar un mecanismo de instalación de las **13 claves** de hooks de SCP (8 lifecycle + 5 UX) en `~/.claude/settings.json` mediante `npm run setup:install -- --hooks`. La instalación SHALL ser **merge selectivo** que preserve configs ajenas a SCP.

**Lifecycle (8 claves):**

- `UserPromptSubmit` (1 comando: `gateway-hook-notify.ts --event-type UserPromptSubmit`)
- `PreToolUse` matcher `*` (1 comando: `pre-tool-use-hook-ux.ts`)
- `PostToolUse` matcher `*` (1 comando: `post-hook-event.ts`)
- `PostToolUseFailure` (1 comando: `post-hook-event.ts`)
- `SubagentStart` (2 comandos: gateway + notificación fija)
- `SubagentStop` (2 comandos: gateway + notificación fija)
- `Stop` (1 comando: `stop-hook-ux.ts`)
- `StopFailure` (1 comando: `gateway-hook-notify.ts --event-type StopFailure`)

**UX (5 claves):**

- `SessionStart` matcher `startup|resume` (notificación fija)
- `SessionEnd` (notificación fija)
- `PermissionRequest` (`--stdin-json`)
- `TaskCreated` (notificación fija)
- `TaskCompleted` (notificación fija)

Un comando se considera "de SCP" si su path normalizado contiene alguno de:

- `post-hook-event`
- `stop-hook-ux`
- `gateway-hook-notify`
- `pre-tool-use-hook-ux`
- `notifications/cli.ts`
- La ruta resolved de `EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT`

La plantilla canónica SHALL vivir en `configs/hooks.json`. Antes de modificar `settings.json`, SHALL crearse backup en `~/.claude/settings-backup-<timestamp>.json`.

#### Scenario: Instalación en config vacía crea 13 claves

- **GIVEN** `~/.claude/settings.json` no existe o tiene `hooks: {}`
- **WHEN** el usuario ejecuta `npm run setup:install -- --hooks`
- **THEN** las 13 claves de SCP SHALL crearse en `settings.hooks`
- **AND** `UserPromptSubmit` SHALL tener un solo comando `gateway-hook-notify`

#### Scenario: Marcadores SCP reconocen nuevos relays

- **GIVEN** un comando que contiene `gateway-hook-notify.ts` o `pre-tool-use-hook-ux.ts`
- **WHEN** `isScpManagedCommand` evalúa el comando
- **THEN** SHALL devolver `true`
