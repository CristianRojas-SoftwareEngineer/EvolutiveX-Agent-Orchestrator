## MODIFIED Requirements

### Requirement: Validación de archivos requeridos de SCP (`validateScpRoot`)

`validateScpRoot` SHALL verificar la existencia de exactamente 2 archivos:
1. `configs/hooks.json`
2. `scripting/post-hook-event.ts`

Los scripts `gateway-hook-notify.ts`, `pre-tool-use-hook-ux.ts`, `task-in-progress-hook-ux.ts` y `src/2-services/notifications/cli.ts` NO SHALL incluirse en la lista de archivos requeridos, ya que han sido eliminados como comandos de hook.

#### Scenario: validateScpRoot falla si falta post-hook-event.ts

- **GIVEN** una raíz de SCP donde `scripting/post-hook-event.ts` no existe
- **WHEN** se invoca `validateScpRoot(scpRoot)`
- **THEN** SHALL lanzar un error indicando que falta `scripting/post-hook-event.ts`

#### Scenario: validateScpRoot tiene éxito con solo hooks.json y post-hook-event.ts presentes

- **GIVEN** una raíz de SCP que contiene `configs/hooks.json` y `scripting/post-hook-event.ts`
- **WHEN** se invoca `validateScpRoot(scpRoot)`
- **THEN** SHALL completar sin error

#### Scenario: validateScpRoot no exige la presencia de scripts eliminados

- **GIVEN** una raíz de SCP que no contiene `gateway-hook-notify.ts`, `pre-tool-use-hook-ux.ts`, `task-in-progress-hook-ux.ts` ni `cli.ts`
- **WHEN** se invoca `validateScpRoot(scpRoot)`
- **THEN** SHALL completar sin error (ausencia de scripts eliminados no es un fallo)

---

### Requirement: Reconocimiento de comandos gestionados por SCP (`isScpManagedCommand`)

`isScpManagedCommand(command, scpRoot)` SHALL devolver `true` únicamente cuando el comando referencie la ruta de `scripting/post-hook-event.ts` bajo `scpRoot`. Los comandos que referencien `gateway-hook-notify.ts`, `pre-tool-use-hook-ux.ts`, `task-in-progress-hook-ux.ts` o `notifications/cli.ts` NO SHALL considerarse gestionados por SCP (ya no existen en el conjunto canónico).

#### Scenario: Comando post-hook-event.ts reconocido como SCP

- **GIVEN** `scpRoot = '/path/to/scp'`
- **WHEN** se evalúa `isScpManagedCommand('npx tsx /path/to/scp/scripting/post-hook-event.ts', scpRoot)`
- **THEN** SHALL devolver `true`

#### Scenario: Comando cli.ts no reconocido como SCP

- **GIVEN** `scpRoot = '/path/to/scp'`
- **WHEN** se evalúa `isScpManagedCommand('npx tsx /path/to/scp/src/2-services/notifications/cli.ts --event-type SessionStart', scpRoot)`
- **THEN** SHALL devolver `false`

#### Scenario: Comando gateway-hook-notify.ts no reconocido como SCP

- **GIVEN** `scpRoot = '/path/to/scp'`
- **WHEN** se evalúa `isScpManagedCommand('npx tsx /path/to/scp/scripting/gateway-hook-notify.ts --event-type UserPromptSubmit', scpRoot)`
- **THEN** SHALL devolver `false`

---

### Requirement: Conjunto canónico de hooks instalados (`--hooks`)

El conjunto instalado por `--hooks` SHALL ser exactamente 13 claves de eventos, cada una con un único comando que referencia `post-hook-event.ts`. No SHALL existir ningún bloque de hook que use un script diferente a `post-hook-event.ts` en las entradas canónicas de SCP.

#### Scenario: Flag --hooks instala el conjunto unificado de 13 claves con relay único

- **WHEN** el usuario ejecuta `npm run setup:install -- --hooks`
- **THEN** el script SHALL instalar las 13 claves de evento (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `Stop`, `StopFailure`, `SessionStart`, `SessionEnd`, `PermissionRequest`, `TaskCreated`, `TaskCompleted`) en `~/.claude/settings.json`
- **AND** cada clave SHALL tener un único comando por bloque referenciando `post-hook-event.ts`
- **AND** SHALL no existir ningún comando adicional por evento referenciando otros scripts de SCP
