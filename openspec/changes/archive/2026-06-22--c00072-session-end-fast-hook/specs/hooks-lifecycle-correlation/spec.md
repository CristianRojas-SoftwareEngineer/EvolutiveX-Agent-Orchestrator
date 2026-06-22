## ADDED Requirements

### Requirement: SessionEnd hook SHALL ejecutarse con `node` directo síncrono

La entrada `SessionEnd` en `configs/hooks.json` SHALL invocar un script TypeScript
autocontenido `scripting/hooks/session-end-hook.ts` mediante `node` directo
(type-stripping nativo de Node), sin `npx`, sin `tsx`, sin paso de build, y **sin**
`"async": true`. El comando SHALL tener la forma
`node "${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}/scripting/hooks/session-end-hook.ts"`.

La motivación es de fiabilidad de entrega: el comando previo (`npx … tsx …
detached-session-end-relay.ts` con `"async": true`) sufría un cold-start de ~1471 ms
de `npx`+`tsx` antes de ejecutar su primera línea; como `async` es fire-and-forget
(Claude Code no espera) y `SessionEnd` no puede bloquear, Claude derribaba el subárbol
del hook antes de que el relay alcanzara el `spawn` detached, por lo que el hijo
detached nunca nacía y el `POST /hooks` no se emitía. Invocar `node` directo sobre el
`.ts` elimina el cold-start (medido ~212 ms wall-clock, `POST` en ~38 ms), de modo que
el trabajo cabe dentro de la ventana de teardown ejecutándose de forma síncrona.

El script `scripting/hooks/session-end-hook.ts` SHALL ser un **cliente HTTP delgado**
del contrato estable `/hooks`: SHALL leer el payload JSON de stdin y hacer un único
`POST /hooks` (URL resuelta vía `ANTHROPIC_BASE_URL`, no acoplada a host:puerto
literal). SHALL ser autocontenido —solo `node:` builtins y `fetch` global— sin imports
relativos (no SHALL importar `scripting/post-hook-event.ts` ni compartir lógica con
otros relays), de modo que `node` lo ejecute sin resolver módulos del repo. SHALL usar
únicamente sintaxis borrable (erasable-only) para que el type-stripping nativo de Node
funcione, y SHALL ser agnóstico al SO (solo API de Node, sin shell ni utilidades
específicas de plataforma).

El entorno SHALL proveer una versión de Node con type-stripping nativo de TypeScript
(≥ 22.18 / 23.6).

#### Scenario: Plantilla canónica invoca SessionEnd con node directo síncrono

- **GIVEN** `configs/hooks.json` versionado en el repo SCP
- **WHEN** se inspecciona la entrada bajo la clave `SessionEnd`
- **THEN** el único hook de comando SHALL invocar `scripting/hooks/session-end-hook.ts` con `node` directo
- **AND** SHALL NOT contener `"async": true`
- **AND** SHALL NOT referenciar `npx`, `tsx`, ni `detached-session-end-relay.ts`

#### Scenario: El hook autocontenido emite POST /hooks desde stdin

- **GIVEN** un payload JSON válido de `SessionEnd` en stdin
- **AND** `ANTHROPIC_BASE_URL` definido con una URL válida
- **WHEN** se ejecuta `node scripting/hooks/session-end-hook.ts`
- **THEN** SHALL llegar una request `POST` al endpoint `/hooks` con el payload del evento
- **AND** el proceso SHALL completar el `POST` de forma síncrona antes de salir (sin spawn detached)

#### Scenario: El hook no depende de npx/tsx ni de imports relativos

- **GIVEN** el archivo `scripting/hooks/session-end-hook.ts`
- **WHEN** se inspeccionan sus imports
- **THEN** SHALL importar únicamente módulos `node:` builtin
- **AND** SHALL NOT contener imports relativos a otros módulos del repo

## MODIFIED Requirements

### Requirement: Todos los eventos de hook ciclan por `POST /hooks`

Todos los **13 eventos** de Claude Code gestionados por SCP SHALL ciclar por el
endpoint `POST /hooks`. Doce eventos SHALL usar `scripting/post-hook-event.ts` como
comando relay en `configs/hooks.json`; el evento `SessionEnd` SHALL usar
`scripting/hooks/session-end-hook.ts` (cliente HTTP autocontenido invocado con `node`
directo). El gateway (`AuditHookEventHandler`) es el único punto de decisión de efectos
(toast, TTS, audit): los scripts relay nunca deciden efectos locales.

Los eventos que antes emitían toast directamente desde scripts (`gateway-hook-notify.ts`, `pre-tool-use-hook-ux.ts`, `task-in-progress-hook-ux.ts`) o desde `notifications/cli.ts` (`SessionStart`, `SessionEnd`, `PermissionRequest`, `TaskCreated`, `TaskCompleted`) ahora ciclan por el gateway: el relay → `POST /hooks` → `AuditHookEventHandler.executeAsync` → `emitToast`.

Los eventos condicionales (`PreToolUse[AskUserQuestion]`, `PostToolUse[TaskUpdate+in_progress]`) también ciclan por el gateway, que aplica el filtro (`toolName === 'AskUserQuestion' && toolInput.questions`; `toolName === 'TaskUpdate' && toolInput.status === 'in_progress'`) antes de emitir el toast.

Ninguna clave SHALL contener un segundo comando en paralelo que lea stdin por separado (race condition de Windows eliminada de raíz: un solo relay por evento).

**Módulos normativos:** `scripting/post-hook-event.ts` (relay de los 12 eventos); `scripting/hooks/session-end-hook.ts` (relay de `SessionEnd`); `src/3-operations/audit-hook-event.handler.ts` (único punto de despacho de efectos).

#### Scenario: Todos los eventos en hooks.json usan el relay canónico como comando

- **GIVEN** `configs/hooks.json` instalado por SCP
- **WHEN** se inspeccionan todos los comandos de hook de todos los eventos
- **THEN** los doce eventos distintos de `SessionEnd` SHALL referenciar únicamente `scripting/post-hook-event.ts`
- **AND** `SessionEnd` SHALL referenciar únicamente `scripting/hooks/session-end-hook.ts`
- **AND** SHALL no existir ningún comando que referencie `scripting/gateway-hook-notify.ts`, `scripting/pre-tool-use-hook-ux.ts`, `scripting/task-in-progress-hook-ux.ts`, ni `src/2-services/notifications/cli.ts`

#### Scenario: PostToolUse tiene una sola entrada de hook (sin duplicado TaskUpdate)

- **GIVEN** `configs/hooks.json`
- **WHEN** se inspeccionan las entradas bajo la clave `PostToolUse`
- **THEN** SHALL existir exactamente una entrada con `matcher: "*"` y comando `post-hook-event.ts`
- **AND** SHALL no existir una segunda entrada separada para el matcher `TaskUpdate`

#### Scenario: SubagentStart tiene una sola entrada de hook (sin cli.ts en paralelo)

- **GIVEN** `configs/hooks.json`
- **WHEN** se inspeccionan las entradas bajo la clave `SubagentStart`
- **THEN** SHALL existir exactamente un comando por bloque de hook
- **AND** el comando SHALL referenciar `post-hook-event.ts`

#### Scenario: PreToolUse → gateway decide toast condicional para AskUserQuestion

- **GIVEN** `configs/hooks.json` con `PreToolUse[matcher=*]` apuntando a `post-hook-event.ts`
- **AND** el gateway recibe un payload `PreToolUse` con `tool_name: 'AskUserQuestion'` y `tool_input.questions`
- **WHEN** el gateway procesa el evento
- **THEN** SHALL emitir toast con preview de la primera pregunta (vía `formatPreToolUseAskMessage`)
- **WHEN** el gateway recibe un payload `PreToolUse` con otra tool o sin `questions`
- **THEN** SHALL ejecutar `POST /hooks` y NO SHALL emitir toast

#### Scenario: PostToolUse → gateway decide toast condicional para TaskUpdate+in_progress

- **GIVEN** `configs/hooks.json` con `PostToolUse[matcher=*]` apuntando a `post-hook-event.ts`
- **AND** el gateway recibe un payload `PostToolUse` con `tool_name: 'TaskUpdate'` y `tool_input.status: 'in_progress'`
- **WHEN** el gateway procesa el evento
- **THEN** SHALL emitir toast con `"Tarea iniciada: <subject>"` (vía `formatTaskInProgressMessage`)
- **WHEN** el gateway recibe `tool_input.status` distinto a `in_progress`
- **THEN** SHALL ejecutar el audit sin emitir toast

#### Scenario: Eventos lifecycle y de sesión llegan al gateway

- **GIVEN** `configs/hooks.json` con entradas para los 13 eventos (12 vía `post-hook-event.ts`, `SessionEnd` vía `scripting/hooks/session-end-hook.ts`)
- **WHEN** Claude Code dispara `SessionStart`, `SessionEnd`, `TaskCreated`, `TaskCompleted` o `PermissionRequest`
- **THEN** SHALL llegar `POST /hooks` al gateway con el payload completo
- **AND** el gateway SHALL emitir el toast correspondiente (texto estático para sesión/tareas; dinámico para `PermissionRequest`)

### Requirement: Distribución de hooks de SCP en `~/.claude/settings.json` (user-level)

El sistema SHALL proporcionar un mecanismo de instalación de las **13 claves** de hooks de SCP en `~/.claude/settings.json` (user-level) mediante el script `setup --hooks` o `setup:hooks`. La instalación SHALL ser **merge selectivo** que preserve configs ajenas a SCP en las mismas claves.

Las 13 claves gestionadas por SCP SHALL ser: `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `Stop`, `StopFailure`, `SessionStart`, `SessionEnd`, `PermissionRequest`, `TaskCreated`, `TaskCompleted`. Cada clave SHALL contener un único comando relay SCP: las doce restantes apuntan a `scripting/post-hook-event.ts`; `SessionEnd` apunta a `scripting/hooks/session-end-hook.ts`.

La entrada `SessionStart` en `configs/hooks.json` SHALL omitir el campo `"matcher"` para que Claude Code despache el hook para todos los valores de `source` (`startup`, `resume`, `clear`, `compact`). **No SHALL existir un campo `"matcher"` en la entrada `SessionStart` de `configs/hooks.json`.**

El merge selectivo SHALL seguir esta política para cada clave:

1. Si la clave NO existe en `~/.claude/settings.json` → crear con versión canónica de SCP.
2. Si la clave existe y TODOS sus comandos son de SCP → reemplazar con versión canónica.
3. Si la clave existe y tiene comandos MIXTOS (SCP + ajenos) → preservar los ajenos, agregar los comandos SCP faltantes.
4. Si la clave existe y TODOS sus comandos son ajenos → preservar intactos (SCP no toca, salvo `--force`).

Un comando se considera "de SCP" si su path normalizado (backslash→forward slash) contiene:
- `post-hook-event`
- `session-end-hook`
- `detached-session-end-relay` (conservado solo para limpiar instalaciones previas en la reinstalación/uninstall)
- La ruta resolved de `EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT`

La plantilla canónica SHALL vivir en `configs/hooks.json` en el repo SCP y SHALL estar versionada. La instalación SHALL escribir `env.EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT` con la ruta absoluta del repo para que el gateway y los hooks la lean. Antes de modificar `settings.json`, SHALL crearse un backup en `~/.claude/settings-backup-<timestamp>.json`.

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

#### Scenario: SessionEnd instalado con comando node-directo

- **GIVEN** `~/.claude/settings.json` no existe o tiene `hooks: {}`
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** la entrada `SessionEnd` en `settings.hooks` SHALL referenciar `scripting/hooks/session-end-hook.ts` invocado con `node` directo
- **AND** SHALL NOT contener `"async": true` ni referenciar `detached-session-end-relay.ts`

#### Scenario: Reinstalación limpia el relay detached previo

- **GIVEN** `~/.claude/settings.json` tiene `hooks.SessionEnd` con un comando que referencia `detached-session-end-relay`
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** el comando previo de `detached-session-end-relay` SHALL reconocerse como de SCP y reemplazarse por el comando canónico de `session-end-hook.ts`

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

## REMOVED Requirements

### Requirement: SessionEnd hook SHALL ejecutarse en modo async

**Reason**: El modo `async` (fire-and-forget) era la causa de la no-entrega: combinado
con el cold-start de `npx`+`tsx`, Claude Code derribaba el subárbol del hook antes de
que el relay completara su arranque, por lo que el `spawn` detached nunca ocurría. Al
eliminar el cold-start (invocación `node` directa sobre `session-end-hook.ts`), el hook
se ejecuta de forma síncrona dentro de la ventana de teardown y `async` deja de ser
necesario.

**Migration**: La entrada `SessionEnd` de `configs/hooks.json` pasa a invocar
`node "${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}/scripting/hooks/session-end-hook.ts"` sin
`"async": true`. Tras mergear, ejecutar `npm run setup:install -- --hooks` y reiniciar
Claude Code para repropagar `~/.claude/settings.json`. Ver el requirement ADDED
«SessionEnd hook SHALL ejecutarse con `node` directo síncrono».

### Requirement: SessionEnd relay SHALL usar spawn detached multiplataforma

**Reason**: El relay detached (`scripting/detached-session-end-relay.ts`) atacaba el
síntoma equivocado. La primitiva detached funcionaba, pero el proceso que la ejecutaría
moría durante su propio cold-start de `npx`+`tsx` antes de alcanzar el `spawn`. Con la
invocación `node` directa el arranque es lo bastante rápido para completar el `POST`
síncrono, por lo que el patrón detached+`unref` es innecesario.

**Migration**: Se retira `scripting/detached-session-end-relay.ts` y su test. La
entrega de `SessionEnd` la cubre `scripting/hooks/session-end-hook.ts` como cliente
HTTP delgado del contrato `/hooks`. El instalador conserva el substring
`detached-session-end-relay` en la detección de comandos SCP únicamente para limpiar
instalaciones previas durante la reinstalación/uninstall.
