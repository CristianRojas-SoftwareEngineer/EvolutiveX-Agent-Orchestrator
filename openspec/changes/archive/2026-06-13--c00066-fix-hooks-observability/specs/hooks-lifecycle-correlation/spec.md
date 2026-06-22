## MODIFIED Requirements

### Requirement: Mapeo de eventos al correlador (`AuditHookEventHandler`)

El sistema SHALL implementar un handler `AuditHookEventHandler` en capa 3 (`src/3-operations/`) que reciba un `ClaudeHookEvent` parseado y despache cada uno de los 13 eventos del lifecycle:

| Evento | Acción |
|--------|--------|
| `UserPromptSubmit` | Locución por voz; toast con preview del `prompt`. No crea ni alinea workflows (la apertura del turno corresponde a `ensureTurnWorkflow` en el primer hop HTTP) |
| `SubagentStart` | **`confirmSubagentFromHook(agentId, toolUseId?)`**; toast `"Subagente iniciado"` |
| `Stop` | **`readyToClose` → si true: `close`** (§15.4); voz + toast de continuidad (generado por LLM). Si no se encuentra workflow: **log `warn`** con `sessionId` |
| `SubagentStop` | **`readyToClose` para sub-workflow → si true: `close`** (§15.4); voz; toast `"Subagente terminado"`. Si no se encuentra entrada por `agentId`: **log `warn`**. Si `agentId` existe en índice wire pero no en lifecycle: **log `error`** |
| `StopFailure` | **`close` directamente** (§15.4: siempre cierra en error); voz; toast con detalle del error (vía `formatStopFailureMessage`). Si no se encuentra workflow: **log `warn`** con `sessionId` |
| `PreToolUse` | Log informativo; toast condicional si `toolName === 'AskUserQuestion' && toolInput.questions` (vía `formatPreToolUseAskMessage`) |
| `PostToolUse` | **`completeToolUse` solo si `completionAuthority === 'hook'`**; ignorar para tools `continuation`; toast condicional si `toolName === 'TaskUpdate' && toolInput.status === 'in_progress'` (vía `formatTaskInProgressMessage`) |
| `PostToolUseFailure` | **`completeToolUse` con `isError: true` solo si `completionAuthority === 'hook'`**; ignorar para tools `continuation` |
| `SessionStart` | Toast `"Sesión iniciada"` |
| `SessionEnd` | Toast `"Sesión finalizada"` |
| `PermissionRequest` | Toast dinámico con `tool_name` y preview de `tool_input` (vía `formatPermissionRequestMessage`) |
| `TaskCreated` | Toast `"Tarea creada"` |
| `TaskCompleted` | Toast `"Tarea completada"` |

Los hooks `PostToolUse` / `PostToolUseFailure` siguen recibiéndose en `POST /hooks` (relay activo); la restricción es sobre **mutación de estado**, no sobre recepción del evento.

#### Scenario: `SubagentStart` → `confirmSubagentFromHook` invocado (sin cambio)

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'SubagentStart'`, `agentId: 'agent-child'`, `toolUseId: 'tu-abc'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** SHALL llamarse `workflowRepo.confirmSubagentFromHook('agent-child', 'tu-abc')`

#### Scenario: `Stop` con repo activo → delegado a readyToClose/close

- **GIVEN** un workflow activo identificado por `agentId` en el repo
- **AND** un `ClaudeHookEvent` con `eventName: 'Stop'`, `stopHookActive: false`, `backgroundTasks: 0`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** el handler SHALL invocar `readyToClose` sobre el workflow
- **AND** SHALL invocar `close` ya que `readyToClose` devolvió `true`
- **AND** el workflow SHALL quedar cerrado con `outcome: 'success'`

#### Scenario: `Stop` sin workflow en repo → warn con sessionId

- **GIVEN** no existe un workflow activo para el `sessionId` del evento
- **AND** un `ClaudeHookEvent` con `eventName: 'Stop'`, `sessionId: 's1'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** el handler SHALL logear a nivel `warn` con `{ eventName: 'Stop', sessionId: 's1' }`
- **AND** el handler NO SHALL logear a nivel `info` para este caso

#### Scenario: `StopFailure` → close directo

- **GIVEN** un workflow activo en el repo
- **AND** un `ClaudeHookEvent` con `eventName: 'StopFailure'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** el handler SHALL invocar `close` directamente sin `readyToClose`
- **AND** el workflow SHALL quedar cerrado con `outcome: 'api_error'`

#### Scenario: `StopFailure` sin workflow en repo → warn con sessionId

- **GIVEN** no existe un workflow activo para el `sessionId` del evento
- **AND** un `ClaudeHookEvent` con `eventName: 'StopFailure'`, `sessionId: 's1'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** el handler SHALL logear a nivel `warn` con `{ eventName: 'StopFailure', sessionId: 's1' }`
- **AND** el handler NO SHALL logear a nivel `info` para este caso

#### Scenario: `SubagentStop` sin entrada en índice por agentId → warn

- **GIVEN** no existe entrada en el índice wire para el `agentId` del evento
- **AND** un `ClaudeHookEvent` con `eventName: 'SubagentStop'`, `agentId: 'agent-child'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** el handler SHALL logear a nivel `warn` con `{ eventName: 'SubagentStop', agentId: 'agent-child' }`
- **AND** el handler NO SHALL logear a nivel `info` para este caso

#### Scenario: `SubagentStop` con inconsistencia wire/lifecycle → error

- **GIVEN** existe una entrada en el índice wire para `agentId: 'agent-child'` con `entry.agentId: 'wf-orphan'`
- **AND** no existe workflow con id `'wf-orphan'` en el lifecycle del repositorio
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** el handler SHALL logear a nivel `error` con `{ eventName: 'SubagentStop', agentId: 'agent-child', wfId: 'wf-orphan' }`
- **AND** el handler NO SHALL logear a nivel `info` para este caso

#### Scenario: PostToolUse para Bash client-side no muta el tool

- **GIVEN** un tool `Bash` con `completionAuthority: continuation` y `status: running`
- **WHEN** `AuditHookEventHandler` procesa `PostToolUse` para ese `tool_use_id`
- **THEN** `completeToolUse` NO SHALL invocarse
- **AND** el tool SHALL permanecer `running`

#### Scenario: PostToolUse para WebFetch con autoridad hook completa el tool

- **GIVEN** un tool `WebFetch` con `completionAuthority: hook` y `status: running`
- **WHEN** `AuditHookEventHandler` procesa `PostToolUse` con `lastAssistantMessage: 'summary'`
- **THEN** `completeToolUse` SHALL invocarse con `isError: false` y `result: 'summary'`

#### Scenario: `PreToolUse` → log informativo, sin mutación de estado

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PreToolUse'`, `sessionId: 's1'`, `toolUseId: 'tu-xyz'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** el handler SHALL completar sin lanzar excepción
- **AND** `workflowRepo.close` NO SHALL haberse llamado
- **AND** ningún workflow en el repo SHALL haber cambiado de estado

#### Scenario: `PreToolUse[AskUserQuestion]` → toast con preview de la pregunta

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PreToolUse'`, `toolName: 'AskUserQuestion'` y `toolInput.questions`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** SHALL emitirse un toast con el preview de la primera pregunta (vía `formatPreToolUseAskMessage`)

#### Scenario: `PreToolUse[Bash]` sin `tool_input.questions` → sin toast

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PreToolUse'`, `toolName: 'Bash'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** NO SHALL emitirse toast (filtro condicional no satisfecho)

#### Scenario: `PostToolUse[TaskUpdate+in_progress]` → toast de tarea iniciada

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PostToolUse'`, `toolName: 'TaskUpdate'` y `toolInput.status: 'in_progress'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** SHALL emitirse un toast `"Tarea iniciada: <subject>"` (vía `formatTaskInProgressMessage`)

#### Scenario: `PostToolUse[TaskUpdate+completed]` → sin toast

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PostToolUse'`, `toolName: 'TaskUpdate'` y `toolInput.status: 'completed'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** NO SHALL emitirse toast (filtro `in_progress` no satisfecho)

#### Scenario: `SessionStart` → toast de sesión iniciada

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'SessionStart'`, `sessionId: 's1'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** SHALL emitirse un toast con título `SessionStart` y mensaje `"Sesión iniciada"`

#### Scenario: `PermissionRequest[Bash]` → toast con preview del comando

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PermissionRequest'`, `toolName: 'Bash'`, `toolInput.command: 'rm -rf /tmp/test'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** SHALL emitirse un toast `"Permiso para: Bash\n<command preview>"` (vía `formatPermissionRequestMessage`)

---

## MODIFIED Requirements

### Requirement: Distribución de hooks de SCP en `~/.claude/settings.json` (user-level)

El sistema SHALL proporcionar un mecanismo de instalación de las **13 claves** de hooks de SCP en `~/.claude/settings.json` (user-level) mediante el script `setup --hooks` o `setup:hooks`. La instalación SHALL ser **merge selectivo** que preserve configs ajenas a SCP en las mismas claves.

Las 13 claves gestionadas por SCP SHALL ser: `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `Stop`, `StopFailure`, `SessionStart`, `SessionEnd`, `PermissionRequest`, `TaskCreated`, `TaskCompleted`. Cada clave SHALL contener un único comando que apunte a `scripting/post-hook-event.ts`.

La entrada `SessionStart` en `configs/hooks.json` SHALL omitir el campo `"matcher"` para que Claude Code despache el hook para todos los valores de `source` (`startup`, `resume`, `clear`, `compact`). **No SHALL existir un campo `"matcher"` en la entrada `SessionStart` de `configs/hooks.json`.**

El merge selectivo SHALL seguir esta política para cada clave:

1. Si la clave NO existe en `~/.claude/settings.json` → crear con versión canónica de SCP.
2. Si la clave existe y TODOS sus comandos son de SCP → reemplazar con versión canónica.
3. Si la clave existe y tiene comandos MIXTOS (SCP + ajenos) → preservar los ajenos, agregar los comandos SCP faltantes.
4. Si la clave existe y TODOS sus comandos son ajenos → preservar intactos (SCP no toca, salvo `--force`).

Un comando se considera "de SCP" si su path normalizado (backslash→forward slash) contiene:
- `post-hook-event`
- La ruta resolved de `EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT`

La plantilla canónica SHALL vivir en `configs/hooks.json` en el repo SCP y SHALL estar versionada. La instalación SHALL escribir `env.EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT` con la ruta absoluta del repo. Antes de modificar `settings.json`, SHALL crearse un backup en `~/.claude/settings-backup-<timestamp>.json`.

#### Scenario: Instalación en config vacía

- **GIVEN** `~/.claude/settings.json` no existe o tiene `hooks: {}`
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** las 13 claves de SCP SHALL crearse en `settings.hooks`
- **AND** `settings.env.EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT` SHALL establecerse con la ruta del repo

#### Scenario: SessionStart instalado sin matcher

- **GIVEN** `~/.claude/settings.json` no existe o tiene `hooks: {}`
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** la entrada `SessionStart` en `settings.hooks` NO SHALL tener campo `"matcher"`
- **AND** el comando relay SHALL estar presente en la entrada `SessionStart`

#### Scenario: Instalación con hooks ajenos existentes

- **GIVEN** `~/.claude/settings.json` tiene `hooks.github-copilot: [{ type: "command", command: "..." }]` (clave ajena a las 13 gestionadas)
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** `hooks.github-copilot` SHALL preservarse intacto
- **AND** las 13 claves de SCP SHALL crearse o actualizarse

#### Scenario: Instalación con clave mixta (SCP + ajenos)

- **GIVEN** `hooks.UserPromptSubmit` tiene un comando de SCP y un comando ajeno
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** el comando ajeno SHALL preservarse
- **AND** los comandos de SCP SHALL agregarse a la entrada (no reemplazar los ajenos)

#### Scenario: --dry-run muestra diff sin escribir

- **GIVEN** `~/.claude/settings.json` tiene config existente
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --dry-run`
- **THEN** el script SHALL mostrar los cambios que se aplicarían
- **AND** `settings.json` SHALL permanecer sin modificar

#### Scenario: Backup automático antes de escribir

- **GIVEN** `~/.claude/settings.json` tiene config existente
- **WHEN** el usuario ejecuta `npm run setup -- --hooks` (sin --dry-run)
- **THEN** un backup SHALL crearse en `~/.claude/settings-backup-<timestamp>.json`
- **AND** el archivo modificado SHALL escribirse después del backup

#### Scenario: Uninstall elimina solo comandos de SCP

- **GIVEN** `~/.claude/settings.json` tiene `hooks.UserPromptSubmit` con comandos SCP y ajenos mezclados
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --uninstall`
- **THEN** solo los comandos de SCP SHALL eliminarse
- **AND** los comandos ajenos SHALL preservarse
- **AND** si la entrada queda vacía tras eliminar comandos SCP, la entrada SHALL eliminarse

#### Scenario: Uninstall con clave solo de SCP elimina la entrada

- **GIVEN** `hooks.Stop` solo tiene comandos de SCP
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --uninstall`
- **THEN** la entrada `Stop` SHALL eliminarse completamente de `settings.hooks`

#### Scenario: --force sobrescribe hooks ajenos tras backup

- **GIVEN** `hooks.SubagentStart` tiene solo comandos ajenos
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --force`
- **THEN** backup SHALL crearse antes del cambio
- **AND** la entrada SHALL reemplazarse con la versión canónica de SCP (los ajenos se pierden)
