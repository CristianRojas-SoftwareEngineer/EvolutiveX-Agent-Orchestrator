## MODIFIED Requirements

### Requirement: SessionEnd hook SHALL ejecutarse en modo async

La entrada `SessionEnd` en `configs/hooks.json` SHALL declarar `"async": true` en el
comando que invoca `scripting/detached-session-end-relay.ts` (no
`post-hook-event.ts` directamente). Claude Code cancela hooks síncronos de
`SessionEnd` durante el apagado del proceso en cualquier plataforma soportada; el
modo async (API de Claude Code, agnóstico al SO) permite que el relay padre termine
sin bloquear el cierre de sesión. El relay detached garantiza que el hijo complete el
`POST /hooks` aunque el árbol de Claude Code se cierre.

Las demás claves SCP (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`,
`PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `Stop`, `StopFailure`,
`SessionStart`, `PermissionRequest`, `TaskCreated`, `TaskCompleted`) SHALL NOT
declarar `"async": true` en la plantilla canónica: dependen del comportamiento
síncrono fire-and-forget del relay durante el agentic loop.

El instalador (`mergeHooks` / `readCanonicalHooks`) SHALL preservar el campo `async`
al resolver placeholders y al escribir en `~/.claude/settings.json`.

#### Scenario: Plantilla canónica declara SessionEnd async con relay detached

- **GIVEN** `configs/hooks.json` versionado en el repo SCP
- **WHEN** se inspecciona la entrada bajo la clave `SessionEnd`
- **THEN** el único hook de comando SHALL referenciar `scripting/detached-session-end-relay.ts`
- **AND** SHALL contener `"async": true`
- **AND** SHALL NOT referenciar `post-hook-event.ts` directamente

#### Scenario: Resto de eventos permanecen síncronos

- **GIVEN** `configs/hooks.json`
- **WHEN** se inspeccionan todas las claves distintas de `SessionEnd`
- **THEN** ningún hook de comando SHALL tener `"async": true`

#### Scenario: Instalación propaga async en SessionEnd

- **GIVEN** un `~/.claude/settings.json` con `SessionEnd` scp-only (solo relay SCP)
- **WHEN** el usuario ejecuta `npm run setup:install -- --hooks`
- **THEN** `settings.hooks.SessionEnd[0].hooks[0].async` SHALL ser `true`

## ADDED Requirements

### Requirement: SessionEnd relay SHALL usar spawn detached multiplataforma

El script `scripting/detached-session-end-relay.ts` SHALL leer el payload JSON de
stdin, lanzar `post-hook-event.ts` en un proceso hijo con `spawn({ detached: true })`,
escribir el body en el stdin del hijo, cerrar ese stdin, y llamar `child.unref()` para
desacoplar el hijo del ciclo de vida del padre. El hijo SHALL invocarse con
`process.execPath` (node) y la ruta directa a `node_modules/tsx/dist/cli.mjs` (sin
`npx`) más la ruta absoluta a `scripting/post-hook-event.ts`, usando rutas con `/`
(resueltas vía `resolvePosixAbsolutePath`). El script SHALL ser agnóstico al SO: solo
API de Node (`child_process.spawn`), sin shell ni utilidades específicas de Windows.

#### Scenario: Relay padre termina tras spawn detached

- **GIVEN** un payload JSON válido de `SessionEnd` en stdin
- **WHEN** se ejecuta `detached-session-end-relay.ts`
- **THEN** el proceso padre SHALL terminar con exit code 0 sin esperar la respuesta HTTP
- **AND** el hijo SHALL completar `POST /hooks` de forma independiente

#### Scenario: isScpManagedCommand reconoce el relay detached

- **GIVEN** un comando de hook que referencia `detached-session-end-relay`
- **WHEN** se evalúa `isScpManagedCommand(command, scpRoot)`
- **THEN** SHALL retornar `true`
