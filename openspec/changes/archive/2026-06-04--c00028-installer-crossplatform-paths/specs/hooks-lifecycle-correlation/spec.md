## MODIFIED Requirements

### Requirement: Relay unificado del hook `Stop` en el proyecto

El hook `Stop` en `~/.claude/settings.json` SHALL declarar un **único** handler
`type: "command"` que ejecute `scripting/stop-hook-ux.ts` mediante `npx` + `tsx`, con
rutas resueltas con `${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}` en install-time por el instalador universal
(no `${CLAUDE_PROJECT_DIR}`; el comando SHALL ser auto-suficiente independientemente del
proyecto activo). El timeout del handler SHOULD ser ≥ 120 s para cubrir la extracción del
transcript, la llamada al modelo y la escritura en disco.

Ese proceso SHALL leer el payload JSON del hook **una sola vez** por stdin y, en secuencia:

1. Reenviar el cuerpo a `POST /hooks` del proxy (equivalente a `scripting/post-hook-event.ts`, URL vía `ANTHROPIC_BASE_URL`).
2. Extraer el contexto del workflow actual y del turno previo desde `transcript_path` del payload (ver spec `stop-hook-continuity-message`, Requirement «Extracción del contexto del workflow desde el transcript»).
3. Si `transcript_path` no está disponible o falla, usar `last_assistant_message` del payload como texto fuente de fallback.
4. Invocar la API de mensajes con credenciales `ANTHROPIC_API_KEY` o `ANTHROPIC_AUTH_TOKEN` del entorno del hook para generar el mensaje de continuidad (`generateContinuityMessage`); modelo por defecto Haiku (`ANTHROPIC_DEFAULT_HAIKU_MODEL` o fallback documentado en código).
5. Persistir el texto completo en `<EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT>/sessions/.last-continuity-message.txt` (`writeContinuityMessage`). La raíz de SCP SHALL derivarse de la ubicación del propio script (`import.meta.url`), sin depender de ninguna variable de entorno inyectada por Claude Code.
6. Emitir el **único toast** con título `"Stop"` y cuerpo = preview truncado del mensaje de continuidad (o fallback según jerarquía definida en spec `stop-hook-continuity-message`).

El proceso NO SHALL emitir un primer toast de señal de estado separado («Tu turno — El asistente terminó»). El único toast cubre tanto el aviso de fin de turno como el contenido de continuidad.

El repositorio SHALL NOT configurar para `Stop` múltiples comandos en paralelo que lean stdin por separado, porque compiten por stdin (especialmente en Windows).

**Módulos normativos:** orquestador `scripting/stop-hook-ux.ts`; mensaje de continuidad y toast `scripting/stop-work-summary-notification.ts` (función `runContinuityNotification`); builder `buildStopHookUxCommand` en `scripting/shared/gateway-hook-command.ts`. Los prompt hooks (`type: "prompt"`) de Claude Code NO sustituyen este relay: no pueden invocar toasts.

**Documentación operativa (no normativa de comportamiento, referencia):** [`docs/notifications.md`](../../../../../docs/notifications.md) § Hook Stop, [`README.md`](../../../../../README.md) § Configuración de hooks. El directorio `.claude/` está en `.gitignore`; el fragmento JSON canónico vive en la guía de notificaciones.

#### Scenario: `Stop` con payload válido → `POST /hooks` y toast único con continuidad

- **GIVEN** `~/.claude/settings.json` contiene la entrada `Stop` con un único comando a `stop-hook-ux.ts` con rutas POSIX absolutas a SCP
- **AND** el proxy escucha en `ANTHROPIC_BASE_URL`
- **AND** el payload incluye `transcript_path` apuntando a un JSONL legible
- **AND** `ANTHROPIC_API_KEY` o `ANTHROPIC_AUTH_TOKEN` presentes en el entorno
- **WHEN** Claude Code dispara el evento `Stop` desde cualquier proyecto
- **THEN** SHALL llegar una request `POST /hooks` con el payload del evento
- **AND** SHALL emitirse **exactamente un** toast con título `"Stop"` y cuerpo no vacío (mensaje de continuidad)
- **AND** SHALL existir el archivo `<EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT>/sessions/.last-continuity-message.txt` con el texto completo

#### Scenario: `Stop` sin `transcript_path` pero con `last_assistant_message`

- **GIVEN** el payload de `Stop` no incluye `transcript_path` o el archivo no es legible
- **AND** el payload incluye `last_assistant_message` no vacío
- **WHEN** se ejecuta `stop-hook-ux.ts`
- **THEN** SHALL intentarse el mensaje de continuidad (o fallback) a partir de `last_assistant_message`
- **AND** SHALL emitirse **un** toast si se obtiene texto no vacío

#### Scenario: `Stop` con stdin vacío por competencia de hooks → sin toast de continuidad

- **GIVEN** una configuración incorrecta con dos comandos en paralelo que leen stdin
- **AND** el segundo proceso recibe stdin vacío
- **WHEN** se ejecuta solo el script de continuidad sin texto fuente
- **THEN** NO SHALL emitirse el toast de continuidad
- **AND** el proceso SHOULD registrar en stderr un mensaje diagnóstico
