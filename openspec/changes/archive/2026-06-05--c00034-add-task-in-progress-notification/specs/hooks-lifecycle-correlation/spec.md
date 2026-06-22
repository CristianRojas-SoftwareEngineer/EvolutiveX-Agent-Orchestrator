## MODIFIED Requirements

### Requirement: Notificaciones de UX no-lifecycle en `.claude/settings.json` del proyecto

El proyecto SHALL declarar **6 entradas adicionales** en `.claude/settings.json` para notificaciones de UX fuera del lifecycle de correlación del gateway: `SessionStart` (con `matcher: "startup|resume"`), `SessionEnd`, `PermissionRequest`, `TaskCreated`, `TaskCompleted`, y `TaskInProgress`. Cada entrada SHALL contener un **único comando** al CLI de notificaciones (`src/2-services/notifications/cli.ts`) con `--event-type` y `--stdin-json` o `--message` fijo según `docs/notifications.md`.

La entrada de **`TaskInProgress`** SHALL usar `matcher: "TaskUpdate"` y SHALL invocar el relay `scripting/task-in-progress-hook-ux.ts` (no el CLI directamente), porque el relay filtra el `status` del payload (solo notifica cuando `tool_input.status === "in_progress"`; descarta silenciosamente `completed`, `pending`, `deleted`).

La notificación de **`PreToolUse` / `AskUserQuestion`** NO es una entrada UX separada: SHALL cubrirse por `pre-tool-use-hook-ux.ts` en la entrada lifecycle `PreToolUse` con `matcher: "*"`.

> **Nota sobre `TaskCreated` / `TaskCompleted` / `TaskInProgress`:** los hooks `TaskCreated` y `TaskCompleted` no admiten campo `matcher` en `.claude/settings.json` (la documentación oficial indica que el campo es ignorado silenciosamente para esos eventos); las entradas SHALL omitirlo. `TaskInProgress` NO es un hook nativo: se implementa como entrada `PostToolUse` con `matcher: "TaskUpdate"` y filtro de `tool_input.status` dentro del script relay.

**Ninguna** de estas 6 entradas invoca `POST /hooks`: el `AuditHookEventHandler` solo procesa los 8 `eventName` del lifecycle definidos en el requirement de "Mapeo eventos al correlador"; el resto cae en `default:` y se descarta. Enviar `POST /hooks` desde estos hooks sería ancho de banda desperdiciado.

**Trade-off explícito (override del user-level):** declarar estas claves en el proyecto sobrescribe las entradas equivalentes del user-level para la misma clave (regla de merge de Claude Code: project-level sobrescribe user-level por clave, ver Scenario "Las entradas del proyecto sobrescriben las del user-level"). Dentro de este repositorio, las notificaciones de UX pasan a ser responsabilidad del proyecto y no del user-level. El usuario asume este trade-off para que el ciclo de vida completo de una sesión quede cubierto desde el repo (sin depender del script externo `C:\AI\claude-code-notifications.ts`, deprecado con fecha de retirada 2026-09-01).

**Trade-off explícito (frecuencia de `TaskCreated` / `TaskCompleted` / `TaskInProgress`):** estos hooks disparan en cada invocación de la tool `TaskCreate` y en cada `TaskUpdate` (cualquier `status`). En sesiones con planificación activa (p. ej. `/openspec-new`, `/openspec-apply`, generación de listas de tareas), se generan múltiples toasts por turno. No existe mecanismo nativo de matcher/throttling para `TaskCreated`/`TaskCompleted`. Para `TaskInProgress` el filtrado por `status === "in_progress"` dentro del relay reduce el ruido en ~75 % de los `TaskUpdate` (los que pasan a `completed`/`deleted`), pero no elimina las transiciones `pending → in_progress` que se disparan en cascada. El usuario asume este trade-off a cambio de feedback explícito del avance de tareas. Si el ruido resulta excesivo en la práctica, la única mitigación nativa es retirar las entradas (no hay filtrado parcial sin implementar throttling/dedupe en el CLI de notificaciones — fuera del scope de este requirement).

**`--stdin-json` por entrada:**

| Entrada | Usa `--stdin-json` | Razón |
|---|---|---|
| `SessionStart` (matcher `startup|resume`) | No | El `eventName` viene del flag `--event-type`. El CLI exige `--message` cuando no se usa `--stdin-json` (contrato canónico en `desktop-notifications-service`), así que la entrada pasa un texto fijo `--message "Sesión iniciada"`. |
| `SessionEnd` | No | Igual que `SessionStart`; texto fijo `--message "Sesión finalizada"`. |
| `PermissionRequest` | Sí | El payload trae `tool_name` y `tool_input`, útiles para derivar el `message`. |
| `TaskCreated` | No | Texto fijo `--message "Tarea creada"`; los hooks `TaskCreated`/`TaskCompleted` no soportan matcher y el payload no se aprovecha en v1. |
| `TaskCompleted` | No | Texto fijo `--message "Tarea completada"`. |
| `TaskInProgress` (matcher `TaskUpdate` en `PostToolUse`) | Sí (vía relay) | El payload trae `tool_input.subject` para derivar el `message` dinámico. El relay filtra `tool_input.status === "in_progress"` antes de invocar el CLI. |

#### Scenario: Notificación de `SessionStart` ejecutada al arranque

- **GIVEN** `.claude/settings.json` del proyecto contiene una entrada `SessionStart` con `matcher: "startup|resume"` y un único comando que invoca el entry point CLI del servicio de notificaciones migrado con `--event-type SessionStart --message "Sesión iniciada"`
- **WHEN** Claude Code arranca una sesión (evento `SessionStart`)
- **THEN** SHALL ejecutarse el comando del CLI con `--event-type SessionStart` y `--message "Sesión iniciada"`
- **AND** SHALL emitirse un toast nativo del SO con título `SessionStart` y mensaje `Sesión iniciada`

#### Scenario: `PreToolUse:AskUserQuestion` vía relay unificado (no segunda entrada UX)

- **GIVEN** `configs/hooks.json` declara un solo bloque `PreToolUse` con `matcher: "*"` y `pre-tool-use-hook-ux.ts`
- **WHEN** Claude Code dispara `PreToolUse` para `AskUserQuestion` con `tool_input.questions`
- **THEN** SHALL ejecutarse `POST /hooks`
- **AND** SHALL emitirse un toast con preview de la pregunta
- **WHEN** Claude Code dispara `PreToolUse` para otra tool sin `questions`
- **THEN** SHALL ejecutarse `POST /hooks` sin toast

#### Scenario: Notificación de `TaskCreated` ejecutada al crear una tarea

- **GIVEN** `.claude/settings.json` del proyecto contiene una entrada `TaskCreated` (sin `matcher`) con un único comando que invoca el entry point CLI del servicio de notificaciones migrado con `--event-type TaskCreated --message "Tarea creada"`
- **WHEN** Claude Code invoca la tool `TaskCreate` (evento `TaskCreated` emitido)
- **THEN** SHALL ejecutarse el comando del CLI con `--event-type TaskCreated` y `--message "Tarea creada"`
- **AND** SHALL emitirse un toast nativo del SO con título `TaskCreated` y mensaje `Tarea creada`
- **AND** NO SHALL llegar request al endpoint `/hooks` del proxy desde esta entrada (el `AuditHookEventHandler` no procesa `TaskCreated`)

#### Scenario: Notificación de `TaskCompleted` ejecutada al marcar tarea completada

- **GIVEN** `.claude/settings.json` del proyecto contiene una entrada `TaskCompleted` (sin `matcher`) con un único comando que invoca el entry point CLI del servicio de notificaciones migrado con `--event-type TaskCompleted --message "Tarea completada"`
- **WHEN** Claude Code invoca la tool `TaskUpdate` con `status: "completed"` (evento `TaskCompleted` emitido)
- **THEN** SHALL ejecutarse el comando del CLI con `--event-type TaskCompleted` y `--message "Tarea completada"`
- **AND** SHALL emitirse un toast nativo del SO con título `TaskCompleted` y mensaje `Tarea completada`
- **AND** NO SHALL llegar request al endpoint `/hooks` del proxy desde esta entrada (el `AuditHookEventHandler` no procesa `TaskCompleted`)

#### Scenario: Notificación de `TaskInProgress` ejecutada al iniciar una tarea

- **GIVEN** `.claude/settings.json` del proyecto contiene una entrada `PostToolUse` con `matcher: "TaskUpdate"` y un único comando que invoca `scripting/task-in-progress-hook-ux.ts`
- **WHEN** Claude Code invoca la tool `TaskUpdate` con `status: "in_progress"`
- **THEN** SHALL ejecutarse el relay
- **AND** SHALL detectarse que `tool_input.status === "in_progress"` y SHALL invocarse el CLI con `--event-type TaskInProgress --stdin-json`
- **AND** SHALL emitirse un toast nativo del SO con título `TaskInProgress` y mensaje `"Tarea iniciada: <subject>"`
- **AND** NO SHALL llegar request al endpoint `/hooks` del proxy desde esta entrada (el `AuditHookEventHandler` no procesa `TaskUpdate`)

#### Scenario: `TaskUpdate` con `status: "completed"` no dispara el toast de `TaskInProgress`

- **GIVEN** `.claude/settings.json` del proyecto contiene la entrada `PostToolUse[matcher="TaskUpdate"]` con el relay
- **WHEN** Claude Code invoca la tool `TaskUpdate` con `status: "completed"`
- **THEN** SHALL ejecutarse el relay
- **AND** SHALL detectarse que `tool_input.status !== "in_progress"`
- **AND** NO SHALL invocarse el CLI de notificaciones
- **AND** el `TaskCompleted` hook (evento separado) SHALL seguir disparando su propio toast como en el scenario anterior

#### Scenario: Las 6 entradas de UX no invocan `POST /hooks`

- **GIVEN** `.claude/settings.json` del proyecto contiene las 6 entradas de UX (`SessionStart`, `SessionEnd`, `PermissionRequest`, `TaskCreated`, `TaskCompleted`, `TaskInProgress`)
- **WHEN** Claude Code dispara cualquiera de esos eventos
- **THEN** NO SHALL llegar request al endpoint `/hooks` del proxy desde esas entradas
- **AND** SHALL ejecutarse únicamente el comando del CLI de notificaciones (directamente o vía relay)

---

### Requirement: Distribución de hooks de SCP en `~/.claude/settings.json` (user-level)

El sistema SHALL proporcionar un mecanismo de instalación de las **14 claves** de hooks de SCP (8 lifecycle + 6 UX) en `~/.claude/settings.json` (user-level) mediante el script `setup --hooks` o `setup:hooks`. La instalación SHALL ser **merge selectivo** que preserve configs ajenas a SCP en las mismas claves.

Las 14 claves gestionadas por SCP SHALL ser:

**Lifecycle (8):**
- `UserPromptSubmit` (1 comando: `gateway-hook-notify.ts`)
- `PreToolUse` matcher `*` (1 comando: `pre-tool-use-hook-ux.ts`)
- `PostToolUse` matcher `*` (1 comando: `post-hook-event.ts`)
- `PostToolUse` matcher `TaskUpdate` (1 comando: `task-in-progress-hook-ux.ts`) — introducido en `add-task-in-progress-notification`
- `PostToolUseFailure` (1 comando: `post-hook-event.ts`)
- `SubagentStart` (2 comandos: gateway + notificación fija)
- `SubagentStop` (2 comandos: gateway + notificación fija)
- `Stop` (1 comando: `stop-hook-ux.ts`)
- `StopFailure` (1 comando: `gateway-hook-notify.ts`)

**UX (6):**
- `SessionStart` matcher `startup|resume`
- `SessionEnd`
- `PermissionRequest`
- `TaskCreated`
- `TaskCompleted`
- `TaskInProgress` (implementado como `PostToolUse[matcher=TaskUpdate]`, no como hook nativo)

El merge selectivo SHALL seguir esta política para cada clave:

1. Si la clave NO existe en `~/.claude/settings.json` → crear con versión canónica de SCP.
2. Si la clave existe y TODOS sus comandos son de SCP → reemplazar con versión canónica.
3. Si la clave existe y tiene comandos MIXTOS (SCP + ajenos) → preservar los ajenos, agregar los comandos SCP faltantes.
4. Si la clave existe y TODOS sus comandos son ajenos → preservar intactos (SCP no toca, salvo `--force`).

Para `PostToolUse`, la presencia de dos entradas (matcher `*` y matcher `TaskUpdate`) SHALL manejarse como entradas independientes en el array `hooks.PostToolUse`: el merge selectivo preserva ambas si ya existen, o crea solo la canónica nueva si la entrada matcher `TaskUpdate` no existe.

Un comando se considera "de SCP" si su path normalizado (backslash→forward slash) contiene alguno de estos marcadores:
- `post-hook-event`
- `stop-hook-ux`
- `gateway-hook-notify`
- `pre-tool-use-hook-ux`
- `task-in-progress-hook-ux` — introducido en `add-task-in-progress-notification`
- `notifications/cli.ts`
- La ruta resolved de `EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT`

La plantilla canónica SHALL vivir en `configs/hooks.json` en el repo SCP y SHALL estar versionada. La instalación SHALL escribir `env.EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT` con la ruta absoluta del repo para que el gateway y los hooks la lean. Antes de modificar `settings.json`, SHALL crearse un backup en `~/.claude/settings-backup-<timestamp>.json`.

#### Scenario: Instalación en config vacía

- **GIVEN** `~/.claude/settings.json` no existe o tiene `hooks: {}`
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** las 14 claves de SCP SHALL crearse en `settings.hooks`
- **AND** `settings.env.EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT` SHALL establecerse con la ruta del repo

#### Scenario: Instalación con hooks ajenos existentes

- **GIVEN** `~/.claude/settings.json` tiene `hooks.github-copilot: [{ type: "command", command: "..." }]` (clave ajena a las 14 gestionadas)
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** `hooks.github-copilot` SHALL preservarse intacto
- **AND** las 14 claves de SCP SHALL crearse o actualizarse

#### Scenario: Instalación con clave mixta (SCP + ajenos)

- **GIVEN** `hooks.UserPromptSubmit` tiene un comando de SCP y un comando ajeno
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** el comando ajeno SHALL preservarse
- **AND** los comandos de SCP SHALl agregarse a la entrada (no reemplazar los ajenos)

#### Scenario: `PostToolUse` con ambas entradas matcher `*` y `TaskUpdate` coexisten

- **GIVEN** `~/.claude/settings.json` tiene `hooks.PostToolUse[matcher="*"]` con un comando SCP
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** SHALL crearse `hooks.PostToolUse[matcher="TaskUpdate"]` con el comando al relay
- **AND** `hooks.PostToolUse[matcher="*"]` SHALL preservarse intacto
- **AND** SHALL haber **dos** entradas separadas en el array `hooks.PostToolUse` (Claude Code las procesa como hooks independientes con matchers disjuntos)

#### Scenario: --dry-run muestra diff sin escribir

- **GIVEN** `~/.claude/settings.json` tiene config existente
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --dry-run`
- **THEN** el script SHALL mostrar los cambios que se aplicarían
- **AND** `settings.json` SHALL permanecer sin modificar

#### Scenario: Backup automático antes de escribir

- **GIVEN** `~/.claude/settings.json` tiene config existente
- **WHEN** el usuario ejecuta `npm run setup -- --hooks` (sin --dry-run)
- **THEN** un backup SHALl crearse en `~/.claude/settings-backup-<timestamp>.json`
- **AND** el archivo modificado SHALl escribirse después del backup

#### Scenario: Uninstall elimina solo comandos de SCP

- **GIVEN** `~/.claude/settings.json` tiene `hooks.UserPromptSubmit` con comandos SCP y ajenos mezclados
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --uninstall`
- **THEN** solo los comandos de SCP SHALL eliminarse
- **AND** los comandos ajenos SHALL preservarse
- **AND** si la entrada queda vacía tras eliminar comandos SCP, la entrada SHALL eliminarse

#### Scenario: Uninstall con clave solo de SCP elimina la entrada

- **GIVEN** `~/.claude/settings.json` tiene `hooks.Stop` con solo comandos de SCP
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --uninstall`
- **THEN** la entrada `Stop` SHALL eliminarse completamente de `settings.hooks`

#### Scenario: Uninstall elimina entrada `PostToolUse[matcher=TaskUpdate]` introducida por SCP

- **GIVEN** `~/.claude/settings.json` tiene `hooks.PostToolUse` con dos entradas: `matcher="*"` (con comando SCP `post-hook-event.ts`) y `matcher="TaskUpdate"` (con comando SCP `task-in-progress-hook-ux.ts`)
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --uninstall`
- **THEN** SHALL eliminarse la entrada `matcher="TaskUpdate"` (comando SCP)
- **AND** SHALL eliminarse el comando SCP de la entrada `matcher="*"`
- **AND** si tras eliminar, la entrada `matcher="*"` queda con comandos ajenos solamente, SHALL preservarse
- **AND** si tras eliminar, la entrada `matcher="*"` queda vacía, SHALL eliminarse

#### Scenario: --force sobrescribe hooks ajenos tras backup

- **GIVEN** `hooks.SubagentStart` tiene solo comandos ajenos
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --force`
- **THEN** backup SHALl crearse antes del cambio
- **AND** la entrada SHALl reemplazarse con la versión canónica de SCP (los ajenos se pierden)
