# Delta: hooks-lifecycle-correlation (proxy-hooks-safe-setup)

## ADDED Requirements

### Requirement: Distribución de hooks de SCP en ~/.claude/settings.json

El sistema SHALL proporcionar un mecanismo de instalación de las 14 entradas de hooks de SCP (8 lifecycle + 6 UX) en `~/.claude/settings.json` (user-level) mediante el script `setup --hooks`. La instalación SHALL ser merge selectivo que preserve configs ajenas a SCP en las mismas claves.

Las 14 entradas managed by SCP SHALl ser:

**Lifecycle (8):**
- `UserPromptSubmit` (2 comandos: gateway + notificación con `--stdin-json`)
- `PreToolUse` matcher `*` (1 comando: gateway)
- `PreToolUse` matcher `AskUserQuestion` (1 comando: notificación con `--stdin-json`)
- `PostToolUse` matcher `*` (1 comando: gateway)
- `PostToolUseFailure` (1 comando: gateway)
- `SubagentStart` (2 comandos: gateway + notificación con `--message "Subagente iniciado"`)
- `SubagentStop` (2 comandos: gateway + notificación con `--message "Subagente terminado"`)
- `Stop` (1 comando: `stop-hook-ux.ts` unificado)
- `StopFailure` (2 comandos: gateway + notificación con `--stdin-json`)

**UX (6):**
- `SessionStart` matcher `startup|resume` (1 comando: notificación con `--message "Sesión iniciada"`)
- `SessionEnd` (1 comando: notificación con `--message "Sesión finalizada"`)
- `PermissionRequest` (1 comando: notificación con `--stdin-json`)
- `TaskCreated` (1 comando: notificación con `--message "Tarea creada"`)
- `TaskCompleted` (1 comando: notificación con `--message "Tarea completada"`)

El merge selectivo SHALL seguir esta política para cada clave:

1. Si la clave NO existe en `~/.claude/settings.json` → crear con versión canónica de SCP.
2. Si la clave existe y TODOS sus comandos son de SCP → reemplazar con versión canónica.
3. Si la clave existe y tiene comandos MIXTOS (SCP + ajenos) → preservar los ajenos, agregar los comandos SCP faltantes.
4. Si la clave existe y TODOS sus comandos son ajenos → preservar intactos (SCP no toca).

Un comando se considera "de SCP" si su path normalizado (backslash→forward slash) contiene alguno de estos marcadores:
- `post-hook-event`
- `stop-hook-ux`
- `notifications/cli.ts`
- La ruta resolved de `EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT`

La plantilla canónica SHALl vivir en `configs/hooks.json` en el repo SCP y SHALl estar versionada.

#### Scenario: Instalación en config vacía

- **GIVEN** `~/.claude/settings.json` no existe o tiene `hooks: {}`
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** las 14 entradas de SCP SHALl crearse en `settings.hooks`
- **AND** `settings.env.EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT` SHALL establecerse con la ruta del repo

#### Scenario: Instalación con hooks ajenos existentes

- **GIVEN** `~/.claude/settings.json` tiene `hooks.github-copilot: [{ type: "command", command: "..." }]`
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** `hooks.github-copilot` SHALL preservarse intacto
- **AND** las 14 entradas de SCP SHALl crearse o actualizarse

#### Scenario: Instalación con clave mixta (SCP + ajenos)

- **GIVEN** `hooks.UserPromptSubmit` tiene un comando de SCP y un comando ajeno
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** el comando ajeno SHALL preservarse
- **AND** los comandos de SCP SHALl agregarse a la entrada (no reemplazar los ajenos)

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
- **THEN** solo los comandos de SCP SHALl eliminarse
- **AND** los comandos ajenos SHALL preservarse
- **AND** si la entrada queda vacía tras eliminar comandos SCP, la entrada SHALL eliminarse

#### Scenario: Uninstall con clave solo de SCP elimina la entrada

- **GIVEN** `hooks.Stop` solo tiene comandos de SCP
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --uninstall`
- **THEN** la entrada `Stop` SHALL eliminarse completamente de `settings.hooks`

#### Scenario: Repo movido: EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT se re-resuelve

- **GIVEN** los hooks están instalados con paths pointing a `D:\OldPath\Smart-Code-Proxy`
- **AND** el repo se movió a `D:\NewPath\Smart-Code-Proxy`
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --root D:\NewPath\Smart-Code-Proxy`
- **THEN** todos los paths de comandos SCP SHALl actualizarse a la nueva ruta

#### Scenario: --force sobrescribe hooks ajenos tras backup

- **GIVEN** `hooks.SubagentStart` tiene solo comandos ajenos
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --force`
- **THEN** backup SHALl crearse antes del cambio
- **AND** la entrada SHALl reemplazarse con la versión canónica de SCP (los ajenos se pierden)

> **Nota:** `--force` existe para el caso donde el usuario quiere que SCP tome control total de una clave. Requiere backup para permitir rollback.

---

### Requirement: Modelo de instalación user-level por defecto

Las entradas de hooks de SCP SHALL instalarse en `~/.claude/settings.json` (user-level) como modelo por defecto, no en el `.claude/settings.json` del proyecto. La configuración en el proyecto (`<proyecto>/.claude/settings.json`) es un override opcional que el usuario puede establecer manualmente.

**Justificación:** user-level permite que los hooks de SCP se hereden automáticamente en todos los proyectos del usuario sin duplicación de configuración.

#### Scenario: hooks se instalan en user-level por defecto

- **GIVEN** el usuario ejecuta `npm run setup -- --hooks`
- **WHEN** el script determina el destino de instalación
- **THEN** el destino SHAL ser `~/.claude/settings.json` (no el `.claude/` del proyecto)