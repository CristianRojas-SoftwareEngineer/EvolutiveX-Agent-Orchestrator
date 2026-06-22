## ADDED Requirements

### Requirement: SessionEnd hook SHALL ejecutarse en modo async

La entrada `SessionEnd` en `configs/hooks.json` SHALL declarar `"async": true` en el
comando que invoca `scripting/post-hook-event.ts`. Claude Code cancela hooks síncronos
de `SessionEnd` durante el apagado del proceso en cualquier plataforma soportada; el
modo async (API de Claude Code, agnóstico al SO) permite que el relay complete el
`POST /hooks` sin bloquear el cierre de sesión ni ser cancelado prematuramente.

Las demás claves SCP (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`,
`PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `Stop`, `StopFailure`,
`SessionStart`, `PermissionRequest`, `TaskCreated`, `TaskCompleted`) SHALL NOT
declarar `"async": true` en la plantilla canónica: dependen del comportamiento
síncrono fire-and-forget del relay durante el agentic loop.

El instalador (`mergeHooks` / `readCanonicalHooks`) SHALL preservar el campo `async`
al resolver placeholders y al escribir en `~/.claude/settings.json`.

#### Scenario: Plantilla canónica declara SessionEnd async

- **GIVEN** `configs/hooks.json` versionado en el repo SCP
- **WHEN** se inspecciona la entrada bajo la clave `SessionEnd`
- **THEN** el único hook de comando SHALL referenciar `scripting/post-hook-event.ts`
- **AND** SHALL contener `"async": true`

#### Scenario: Resto de eventos permanecen síncronos

- **GIVEN** `configs/hooks.json`
- **WHEN** se inspeccionan todas las claves distintas de `SessionEnd`
- **THEN** ningún hook de comando SHALL tener `"async": true`

#### Scenario: Instalación propaga async en SessionEnd

- **GIVEN** un `~/.claude/settings.json` con `SessionEnd` scp-only (solo post-hook-event)
- **WHEN** el usuario ejecuta `npm run setup:install -- --hooks`
- **THEN** `settings.hooks.SessionEnd[0].hooks[0].async` SHALL ser `true`
