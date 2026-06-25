## ADDED Requirements

### Requirement: División del roadmap en tres fases trazables

El roadmap SHALL dividirse en tres fases trazables 1:1 a los dos problemas identificados: la fase H1 cubre el registro de los hooks faltantes para correlación del gateway; las fases N1 y N2 cubren, respectivamente, la migración del sistema de notificaciones al repositorio y el reapuntamiento de los hooks al entry point del servicio migrado. La suma de las tres fases SHALL cubrir el estado objetivo del roadmap (hooks configurados, notificaciones dentro del repo, sin dependencias externas activas desde `.claude/settings.json`).

#### Scenario: Cobertura 1:1 entre fases y problemas

- **WHEN** se enumeran las fases del phase registry del orquestador
- **THEN** SHALL existir una entrada H1 trazable al problema de los hooks faltantes
- **AND** SHALL existir una entrada N1 trazable a la migración del sistema de notificaciones
- **AND** SHALL existir una entrada N2 trazable al reapuntamiento de los hooks al servicio interno

#### Scenario: Unión de fases cubre el estado objetivo

- **GIVEN** las tres fases del roadmap están `archivada`
- **WHEN** se ejecuta una sesión de Claude Code contra el proxy configurado
- **THEN** SHALL haber cero ocurrencias del warning `[audit] No se encontró workflow padre para continuation` en `server/logs.jsonl`
- **AND** SHALL haber cero referencias activas a `C:\AI\claude-code-notifications.ts` desde `.claude/settings.json`

---

### Requirement: Materialización de cada fase como L2 change independiente

Cada fase SHALL materializarse como un L2 OpenSpec change independiente bajo `openspec/changes/claude-code-hooks-implementation/phases/<phase-name>/`. El `proposal.md` de cada L2 SHALL incluir al inicio la back-reference `> **Orquestador:** \`claude-code-hooks-implementation\` | **Fase:** <h1|n1|n2> (<bloque>)`.

#### Scenario: L2 del H1 incluye back-reference correcta

- **GIVEN** la fase H1 está en curso
- **WHEN** se inspecciona `openspec/changes/claude-code-hooks-implementation/phases/claude-h1-register-missing-hooks/proposal.md`
- **THEN** SHALL existir la línea `> **Orquestador:** \`claude-code-hooks-implementation\` | **Fase:** h1 (H)` en las primeras 5 líneas del archivo

#### Scenario: L2 del N2 bloqueado por dependencias no satisfechas

- **GIVEN** las fases H1 y N1 están en estado `pendiente` o `en-curso` en el registro del orquestador
- **WHEN** se intenta invocar `openspec-propose` para crear `claude-n2-repoint-hooks-to-internal-notifications`
- **THEN** el operador SHALL ser notificado de que las dependencias del DAG (H1, N1) no están `archivada` y el L2 no debe iniciarse

---

### Requirement: Definition of Done verificable por fase

Una fase SHALL considerarse incompleta a menos que satisfaga simultáneamente: (a) el gate técnico de validación definido en el phase registry del orquestador, pasado; (b) los documentos listados en la columna "Docs a actualizar" del registro, actualizados al estado post-fase real; (c) el legacy listado en la columna "Legacy a retirar" de la fila correspondiente, eliminado o marcado `@deprecated` con fecha de retirada prevista.

#### Scenario: Fase H1 satisface DoD antes de archivar

- **GIVEN** la fase H1 ha completado su implementación
- **WHEN** se ejecuta el `phase_gate` sobre `claude-h1-register-missing-hooks`
- **THEN** SHALL haber evidencia de: (a) ausencia del warning `[audit] No se encontró workflow padre para continuation` durante una sesión de prueba; (b) `README.md` §setup refleja la nueva config de hooks; (c) `docs/gateway-architecture.md` §18 (si documenta config) menciona los 3 hooks nuevos

#### Scenario: Fase N1 satisface DoD antes de archivar

- **GIVEN** la fase N1 ha completado su implementación
- **WHEN** se ejecuta el `phase_gate` sobre `claude-n1-migrate-notifications-service`
- **THEN** SHALL haber evidencia de: (a) `npm run test:quick` verde; (b) tests unitarios de `DesktopNotificationAdapter` con `node-notifier` mockeado pasan; (c) `docs/notifications.md` creado con API, entry point CLI y contrato del puerto

#### Scenario: Fase N2 satisface DoD antes de archivar

- **GIVEN** la fase N2 ha completado su implementación
- **WHEN** se ejecuta el `phase_gate` sobre `claude-n2-repoint-hooks-to-internal-notifications`
- **THEN** SHALL haber evidencia de: (a) `npm run test:quick` verde; (b) verificación manual de toasts para los 3 hooks recién registrados; (c) `docs/notifications.md` actualizado con la ruta final del entry point; (d) `C:\AI\claude-code-notifications.ts` documentado como `@deprecated` con fecha

---

### Requirement: DAG de dependencias estricto

La fase H1 SHALL ser un entry point (sin dependencias). La fase N1 SHALL ser un entry point (sin dependencias; puede correr en paralelo con H1). La fase N2 SHALL depender de que H1 y N1 estén ambas en estado `archivada` antes de poder iniciar. Cualquier intento de iniciar N2 antes de que ambas dependencias estén `archivada` SHALL ser bloqueado por el `phase_gate` (Check 3 — dependency gate).

#### Scenario: H1 y N1 pueden correr en paralelo

- **GIVEN** ambas fases H1 y N1 están en estado `pendiente`
- **WHEN** se inicia la fase H1 (creación del L2 con `openspec-propose`)
- **THEN** SHALL ser posible iniciar la fase N1 sin esperar a que H1 termine

#### Scenario: N2 bloqueada hasta archivar H1 y N1

- **GIVEN** la fase H1 está en estado `validada` pero N1 está en `pendiente`
- **WHEN** se intenta crear el L2 `claude-n2-repoint-hooks-to-internal-notifications`
- **THEN** el operador SHALL ser notificado de que N1 no está `archivada` y N2 no puede iniciar

- **GIVEN** las fases H1 y N1 están ambas en estado `archivada`
- **WHEN** se inicia la fase N2
- **THEN** SHALL ser posible crear el L2 y proceder con su implementación

---

### Requirement: Phase registry trazable con estados válidos

El orquestador SHALL mantener un phase registry (en `design.md`) con las 3 fases, donde la columna "Estado" SHALL tomar uno de los cuatro valores válidos: `pendiente`, `en curso`, `validada`, `archivada`. La transición SHALL respetar el orden estricto: `pendiente → en curso → validada → archivada`. Cualquier otro estado SHALL ser rechazado por el `phase_gate`.

#### Scenario: Transición válida pendiente → en curso

- **GIVEN** la fase H1 está en estado `pendiente`
- **WHEN** se crea el L2 `claude-h1-register-missing-hooks` con `openspec-propose`
- **THEN** la columna "Estado" de H1 en el registro SHALL transicionar a `en curso`

#### Scenario: Transición inválida saltea paso

- **GIVEN** la fase H1 está en estado `pendiente`
- **WHEN** se intenta marcar H1 como `validada` directamente (saltando `en curso`)
- **THEN** el `phase_gate` SHALL rechazar la transición con un CRITICAL

#### Scenario: Estado final archivada tras phase gate

- **GIVEN** la fase H1 está en estado `validada` y todos los chequeos del `phase_gate` pasan
- **WHEN** se invoca `openspec-archive` sobre `claude-h1-register-missing-hooks`
- **THEN** la columna "Estado" de H1 en el registro SHALL transicionar a `archivada`

---

### Requirement: Contrato de hooks en `.claude/settings.json` del proyecto

Las 8 entradas del lifecycle (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `Stop`, `StopFailure`) SHALL estar registradas en `.claude/settings.json` del proyecto (no del usuario) con al menos un comando que invoque `POST /hooks` del proxy. El contrato SHALL permitir configurar la ruta del proxy mediante variable de entorno (`ANTHROPIC_BASE_URL`) para que el comando del hook no quede acoplado a `http://127.0.0.1:8787` literal. Las entradas a nivel de proyecto sobrescriben las del user-level para las claves presentes (mecanismo de merge de Claude Code). Los matchers de `PreToolUse` y `PostToolUse` SHALL establecerse en `*` para que el gateway reciba los eventos de todas las tools (no solo de las listadas en matchers estrechos como `AskUserQuestion` o `Write|Edit`).

#### Scenario: Los 8 hooks del lifecycle invocan POST /hooks

- **GIVEN** `.claude/settings.json` del proyecto contiene las 8 entradas del lifecycle
- **WHEN** Claude Code dispara cualquiera de los 8 eventos del lifecycle (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `Stop`, `StopFailure`)
- **THEN** SHALL ejecutarse el comando configurado y SHALL llegar una request `POST /hooks` al proxy con payload JSON del evento

#### Scenario: Hook usa variable de entorno del proxy

- **GIVEN** el comando configurado para el hook `SubagentStop` incluye `$ANTHROPIC_BASE_URL`
- **AND** la variable `ANTHROPIC_BASE_URL` está definida con valor `http://127.0.0.1:8787`
- **WHEN** Claude Code dispara el hook `SubagentStop`
- **THEN** SHALL ejecutarse `curl -X POST $ANTHROPIC_BASE_URL/hooks -d @-` (o equivalente)
- **AND** SHALL llegar una request al endpoint `/hooks` del proxy

#### Scenario: Matcher * en PreToolUse y PostToolUse

- **GIVEN** `.claude/settings.json` del proyecto contiene las entradas para `PreToolUse` y `PostToolUse` con `"matcher": "*"`
- **WHEN** Claude Code dispara `PreToolUse` o `PostToolUse` para cualquier tool (no solo `AskUserQuestion` o `Write|Edit`)
- **THEN** SHALL ejecutarse el comando configurado para esa entrada
- **AND** SHALL llegar una request `POST /hooks` al proxy

#### Scenario: Entradas del proyecto sobrescriben las del user-level

- **GIVEN** `C:\Users\user\.claude\settings.json` (user-level) contiene la entrada `SubagentStart` con un comando de notificación
- **AND** `.claude/settings.json` del proyecto contiene la entrada `SubagentStart` con un comando `POST /hooks`
- **WHEN** Claude Code dispara el hook `SubagentStart`
- **THEN** SHALL ejecutarse únicamente el comando del proyecto, no el del user-level

---

### Requirement: Contrato del servicio de notificaciones (primera versión sin personalización)

El sistema SHALL exponer un puerto `INotificationService` (capa 1, archivo `src/2-services/notifications/INotificationService.ts`) implementado por `DesktopNotificationAdapter` (capa 2, archivo `src/2-services/notifications/DesktopNotificationAdapter.ts`). En esta primera versión el adaptador SHALL limitarse a invocar `node-notifier` con título, mensaje y sonido opcional, **sin** lógica de personalización de imagen, icono, título branding ni comportamiento Windows-specific (sin SnoreToast, AUMID, `.lnk` ni `heroImage`).

#### Scenario: Interfaz INotificationService exporta el contrato

- **GIVEN** el L2 `claude-n1-migrate-notifications-service` está implementado
- **WHEN** se importa `INotificationService` desde `src/2-services/notifications/`
- **THEN** SHALL existir la interfaz con al menos un método `notify(event)` o equivalente que reciba un payload de notificación con `title`, `message` y, opcionalmente, `sound` y `silent`

#### Scenario: DesktopNotificationAdapter delega en node-notifier

- **GIVEN** el L2 `claude-n1-migrate-notifications-service` está implementado
- **WHEN** se instancia `DesktopNotificationAdapter` y se invoca el método de notificación con un payload `{ title: 'X', message: 'Y' }`
- **THEN** SHALL invocarse `node-notifier` con `title: 'X'` y `message: 'Y'`
- **AND** SHALL **no** pasarse `icon` (custom), `sound` se omite si el payload no lo incluye
- **AND** SHALL **no** pasarse ninguna ruta de imagen ni configuración de branding

#### Scenario: Ausencia de dependencias Windows-specific en N1

- **GIVEN** el L2 `claude-n1-migrate-notifications-service` está implementado
- **WHEN** se inspecciona el código de `src/2-services/notifications/`
- **THEN** SHALL **no** existir ningún archivo o módulo relativo a SnoreToast
- **AND** SHALL **no** existir ningún campo `appId`, `shortcutName`, `shortcutTarget` o `heroImage` en la configuración
- **AND** SHALL **no** existir código que registre AUMID ni acceda a `.lnk`

#### Scenario: Comportamiento cross-platform básico

- **GIVEN** una notificación con título y mensaje
- **WHEN** se invoca el servicio migrado en Windows, macOS o Linux
- **THEN** SHALL mostrarse un toast nativo del sistema operativo con el título y mensaje del payload
- **AND** SHALL usar el icono por defecto del sistema (sin icono personalizado)
- **AND** SHALL usar la duración por defecto de `node-notifier` para esa plataforma

---

### Requirement: Reducción de dependencia externa tras N2

Tras archivar la fase N2, los comandos de notificación en `.claude/settings.json` SHALL apuntar al entry point del servicio migrado dentro del repositorio (resuelto relativo a la raíz del proyecto), no a rutas absolutas en `C:\AI\...`. La búsqueda de referencias SHALL ejecutarse como parte del `phase_gate` (Check 6 — legacy/zombie reduction) y SHALL retornar cero coincidencias activas en `.claude/settings.json` antes de archivar la fase.

#### Scenario: Ausencia de referencias a C:\AI\ en settings.json post-N2

- **GIVEN** la fase N2 está `archivada`
- **WHEN** se ejecuta `grep -F 'C:\AI\' .claude/settings.json`
- **THEN** SHALL retornar cero coincidencias

#### Scenario: Entry point del repo referenciado correctamente

- **GIVEN** la fase N2 está `archivada`
- **WHEN** se inspecciona el comando de notificación configurado para el hook `SessionStart`
- **THEN** SHALL apuntar a un script TypeScript del repo (p. ej. `node "node_modules/tsx/dist/cli.mjs" "src/2-services/notifications/cli.ts" --event-type SessionStart`)
- **AND** SHALL resolverse relativo a la raíz del proyecto, no a una ruta absoluta externa

---

### Requirement: Documentación sincronizada al estado real

Tras archivar cada fase, los documentos listados en la columna "Docs a actualizar" del phase registry SHALL reflejar el estado real de la implementación. Cualquier afirmación de "implementado" o "done" en un doc SHALL corresponderse con código o configuración presente en el repositorio al momento de la verificación. Esta invariante SHALL ser chequeada por el `phase_gate` (Check 5 — documentation sync).

#### Scenario: README.md refleja la config de hooks tras H1

- **GIVEN** la fase H1 está `archivada`
- **WHEN** se lee `README.md` §setup
- **THEN** SHALL mencionarse explícitamente el registro de los 3 hooks (`SubagentStart`, `SubagentStop`, `PostToolUseFailure`) en `.claude/settings.json`
- **AND** SHALL coincidir con las entradas reales del archivo

#### Scenario: docs/notifications.md refleja la ruta final tras N2

- **GIVEN** la fase N2 está `archivada`
- **WHEN** se lee `docs/notifications.md`
- **THEN** SHALL indicar la ruta del entry point CLI dentro del repo
- **AND** SHALL marcar `C:\AI\claude-code-notifications.ts` como `@deprecated` con fecha de retirada prevista

#### Scenario: Doc no afirma "done" antes de implementar

- **GIVEN** la fase N1 está en estado `en curso` o `pendiente`
- **WHEN** se ejecuta el `phase_gate` sobre N1
- **THEN** SHALL emitir un CRITICAL si `docs/notifications.md` afirma que el servicio está implementado cuando aún no lo está
