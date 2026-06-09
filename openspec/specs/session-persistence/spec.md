# session-persistence Specification

## Purpose

Suscriptor del `EventBus` que proyecta eventos del correlador y handlers a disco bajo la estructura `causal-workflows-v1` (`workflows/NN/steps/MM/tools/KK/`). Reemplaza la escritura directa desde handlers de capa 3 (`SessionStoreService`, `WorkflowResultProjector`). P1 (2026-05-30): árbol causal estructural. P2 (2026-06-01): chunks SSE (`streaming/`), `events.ndjson`, `workflow-sequence.json`, vistas coalesced; retiro de `ISseAuditWriter`.
## Requirements
### Requirement: SessionPersistence — suscripción al bus y proyección a disco

El sistema SHALL proveer `SessionPersistence` en `src/2-services/session-persistence.service.ts` como suscriptor del `EventBus` que, al recibir eventos del correlador y handlers, proyecta la estructura de directorios y archivos del layout `causal-workflows-v1` bajo `sessions/`.

`SessionPersistence` SHALL suscribirse a los siguientes eventos en su constructor:

| Evento | Acción |
|---|---|
| `workflow_start` | Crear `workflows/NN/`; escribir `meta.json` inicial (status: `running`). Si `request` presente, escribir `request/body.json`. Actualizar `workflows/workflow-sequence.json`. |
| `workflow_spawn` | Crear `workflows/NN/tools/KK-sub-agent/sub-agent/workflow/`; escribir `meta.json` del sub-workflow |
| `step_request` | Crear `steps/MM/`; si `request` presente, escribir `request/body.json` |
| `step_response` | Escribir `response/body.json`, `response/headers.json`, `response/parsed.md` según campos presentes en payload |
| `tool_call` | Crear `tools/KK-slug/`; escribir `input.json` y `meta.json` |
| `tool_result` | Escribir `result.json` en `tools/KK-slug/`; actualizar `meta.json` del tool |
| `workflow_complete` | Actualizar `meta.json` (status: `completed`); escribir `output/result.json` + `output/result.parsed.md`; actualizar `workflow-sequence.json` |
| `workflow_cancel` | Actualizar `meta.json` (status: `cancelled`, `cancellationReason`); actualizar `workflow-sequence.json` |
| `stream_chunk` | Escribir `steps/MM/response/streaming/NNNN-chunk.ndjson`; al cierre del step con `coalescedDelegationStepIndex`, generar `body.coalesced.json` y `body.coalesced.parsed.md` |
| `*` (wildcard) | Append-only a `sessions/<sessionId>/events.ndjson` por cada evento recibido |

En `workflow_start`, `meta.json` SHALL incluir `workflowKind` (estructural: `main` | `subagent`) y `interactionType` (semántico: `agentic` | `side-request`, desde payload `workflowKind` del correlador). Los valores `session-shell` y `client-preflight` SHALL NOT persistirse como `interactionType`.

Los índices `NN`, `MM`, `KK` en rutas de disco SHALL ser **base 1** (`01`, `02`, …), alineados con `layoutIndex`, `stepIndex` y `toolIndex` de los eventos sin offset oculto.

`workflow-sequence.json` SHALL registrar **una** fila por turno de usuario (un `workflow_start` de turno por ciclo `UserPromptSubmit` → `Stop`).

El evento `step_request` emitido por handlers L3 SHALL transportar el body HTTP parseado completo y `stepKind` cuando aplique. El correlador (`registerStep`) NO SHALL emitir `step_request` con `inferenceRequest` sintético (`messages: []`).

Para un hop HTTP completo, `step_request` y `step_response` del mismo hop SHALL compartir el mismo `stepIndex`, produciendo `steps/MM/request/` y `steps/MM/response/` bajo el mismo directorio `MM` según `docs/session-audit-model.md`.

`SessionPersistence` SHALL NOT mantener un contador `nextWorkflowIndex` independiente del correlador salvo fallback defensivo inicializado en `1` y resincronizado tras `workflow_start` con `layoutIndex` explícito.

#### Scenario: Hop unificado en disco base 1

- **GIVEN** ingress emitió `step_request` con `stepIndex: 1` y egress emitió `step_response` con `stepIndex: 1`
- **WHEN** `SessionPersistence` proyecta ambos eventos
- **THEN** SHALL existir `steps/01/request/body.json` y `steps/01/response/body.json`
- **AND** NO SHALL existir `steps/02/response/` solo para la response de ese hop

#### Scenario: workflow_start persiste interactionType agentic para turno

- **GIVEN** un evento `workflow_start` con `kind: 'main'` y `workflowKind: 'agentic'` (turno de usuario)
- **WHEN** `SessionPersistence` procesa el evento
- **THEN** `meta.json` SHALL contener `workflowKind: 'main'` y `interactionType: 'agentic'`
- **AND** la carpeta SHALL ser `workflows/01/` para el primer turno de la sesión

#### Scenario: workflow-sequence una fila por turno

- **GIVEN** un turno con side-request + agentic fresh + continuation bajo un único workflow
- **WHEN** el turno cierra con `workflow_complete`
- **THEN** `workflow-sequence.json` SHALL contener una sola entrada para ese `layoutIndex`
- **AND** `workflowIndex` SHALL ser base 1

#### Scenario: step_request persiste stepKind

- **GIVEN** un evento `step_request` con `stepKind: 'side-request'`
- **WHEN** `SessionPersistence` escribe el meta del step
- **THEN** el meta del step SHALL incluir `stepKind: 'side-request'`

#### Scenario: step_request de continuación preserva messages con tool_result

- **GIVEN** un handler L3 que emite `step_request` con `request.messages` conteniendo bloques `tool_result`
- **WHEN** `SessionPersistence` escribe `steps/MM/request/body.json`
- **THEN** el archivo SHALL contener el array `messages` completo del body HTTP
- **AND** NO SHALL quedar `messages: []` cuando el body upstream incluye historial

### Requirement: Escritura atómica de archivos de sesión

`SessionPersistence` SHALL escribir todos los archivos JSON de forma atómica: escribir en un archivo temporal y renombrar (write temp + rename). Las escrituras para un mismo archivo SHALL serializarse mediante un `writeQueue` por ruta para evitar condiciones de carrera.

En Windows, `fs.rename` puede fallar con `EPERM` cuando un proceso externo (antivirus, indexador de Windows Search) mantiene abierto el archivo destino durante el rename. Esta condición no ocurre en Linux/macOS donde `rename()` POSIX es atómico sin restricciones de lock sobre el destino. Para manejarla de forma cross-platform, la escritura atómica SHALL reintentar el rename hasta 3 veces con backoff incremental de 50 ms cuando el error es `EPERM`. Si los 3 reintentos fallan, SHALL eliminar el archivo temporal y relanzar el error.

#### Scenario: Escrituras concurrentes a meta.json se serializan

- **GIVEN** dos eventos que afectan el mismo `meta.json` llegan en rápida sucesión
- **WHEN** `SessionPersistence` procesa ambos eventos
- **THEN** las escrituras SHALL ejecutarse secuencialmente (no en paralelo)
- **AND** el archivo final SHALL reflejar el estado del último evento procesado

#### Scenario: rename falla con EPERM (Windows) → retry y éxito

- **GIVEN** el archivo destino está momentáneamente bloqueado por un proceso externo en Windows
- **WHEN** `atomicWrite` intenta el rename y recibe `EPERM`
- **THEN** SHALL reintentar el rename hasta 3 veces con backoff de 50 ms × intento
- **AND** si un reintento tiene éxito, el archivo SHALL quedar escrito correctamente sin error visible

#### Scenario: rename falla con EPERM en todos los reintentos → limpieza y error

- **GIVEN** el rename sigue fallando con `EPERM` tras 3 reintentos
- **WHEN** se agota el límite de reintentos
- **THEN** SHALL eliminarse el archivo temporal
- **AND** SHALL relanzarse el último error para que `enqueue` lo registre en el logger

---

### Requirement: Directorio causal-workflows-v1 con naming correcto

`SessionPersistence` SHALL crear directorios siguiendo la convención de §30:

- `workflows/NN/` — NN = índice de workflow (00, 01, ...)
- `steps/MM/` — MM = índice de step local al workflow (00, 01, ...)
- `tools/KK-slug/` — KK = índice global de tool_use; slug = nombre del tool normalizado
- `sub-agent/workflow/` — anidado bajo `tools/KK-slug/` solo si la tool dispara sub-agente

Los directorios SHALL crearse lazy (§31): solo cuando hay contenido real que justifique su existencia.

#### Scenario: Step sin tools no crea directorio tools/

- **GIVEN** un step que no invoca ninguna tool
- **WHEN** `SessionPersistence` procesa el `step_request`
- **THEN** SHALL crearse `steps/MM/request/`
- **AND** NO SHALL crearse `steps/MM/tools/`

#### Scenario: Sub-agente se anida bajo tool invocador

- **GIVEN** un tool `'tu-1'` de nombre `'Task'` que dispara un sub-agente
- **WHEN** `SessionPersistence` recibe `workflow_spawn` para el sub-workflow
- **THEN** SHALL crearse `tools/00-Task/sub-agent/workflow/` con su propio `meta.json`, `input/`, `output/`, `steps/`

---

### Requirement: SessionPersistence no conoce el correlador

`SessionPersistence` SHALL ser un suscriptor independiente del `EventBus`. NO SHALL tener referencia directa al correlador (`IWorkflowRepository`). Toda la información necesaria para proyectar a disco SHALL provenir exclusivamente del payload de los eventos recibidos.

#### Scenario: SessionPersistence opera sin dependencia del correlador

- **GIVEN** un `EventBus` y un `SessionPersistence` instanciados
- **WHEN** se publican eventos en el bus
- **THEN** `SessionPersistence` SHALL proyectar a disco sin invocar ningún método del correlador

#### Scenario: Suscripciones P2 registradas en constructor

- **GIVEN** un `EventBus` y un `SessionPersistence` instanciados
- **WHEN** se inspeccionan las suscripciones del constructor
- **THEN** SHALL existir handlers para `stream_chunk` y patrón `*`
- **AND** las suscripciones P1 (`workflow_start`, `tool_call`, etc.) SHALL permanecer activas

---

### Requirement: events.ndjson — log cronológico de sesión

`SessionPersistence` SHALL suscribirse al patrón `*` y SHALL appendear cada `TelemetryEvent` como una línea JSON en `sessions/<sessionId>/events.ndjson` sin reescribir el archivo completo.

#### Scenario: workflow_start aparece en events.ndjson

- **GIVEN** una sesión nueva `'sess-p2'`
- **WHEN** se publica `workflow_start` al bus
- **THEN** `sessions/sess-p2/events.ndjson` SHALL contener una línea con `type: 'workflow_start'`

---

### Requirement: stream_chunk — chunks forenses

`SessionPersistence` SHALL persistir cada evento `stream_chunk` como `steps/MM/response/streaming/NNNN-chunk.ndjson` (numeración de 4 dígitos por step). Los eventos SSE de tipo `ping` SHALL NOT persistirse como chunks.

#### Scenario: ping no genera chunk en disco

- **GIVEN** un step con suscripción activa a `stream_chunk`
- **WHEN** llega un chunk cuyo evento SSE es `ping`
- **THEN** NO SHALL crearse un nuevo archivo bajo `response/streaming/`

---

### Requirement: workflow-sequence.json

`SessionPersistence` SHALL mantener `sessions/<sessionId>/workflows/workflow-sequence.json` de forma incremental y atómica, actualizándolo en `workflow_start`, `workflow_complete` y `workflow_cancel` de workflows principales de la sesión.

#### Scenario: Índice actualizado al completar workflow

- **GIVEN** un workflow main en ejecución con entrada en `workflow-sequence.json`
- **WHEN** llega `workflow_complete`
- **THEN** la entrada del workflow SHALL reflejar status `completed`

---

### Requirement: Vistas coalesced desde streaming

Para steps con flujo coalesced (multi-fase SSE), `SessionPersistence` SHALL generar `response/body.coalesced.json` y `response/body.coalesced.parsed.md` al cierre del step a partir de los chunks persistidos, sin depender de `ISseAuditWriter`.

#### Scenario: Step coalesced sin sse.jsonl

- **GIVEN** un step coalesced procesado solo vía `stream_chunk`
- **WHEN** el step se cierra
- **THEN** SHALL existir `body.coalesced.json` bajo `response/`
- **AND** NO SHALL existir `response/sse.jsonl`

### Requirement: tool_result persistido vía fallback de continuation

Para tools con `completionAuthority: continuation`, `SessionPersistence` SHALL recibir el evento `tool_result` **exclusivamente** cuando el correlador complete el tool desde bloques `tool_result` del body HTTP de una continuation. El hook `PostToolUse` NO SHALL ser fuente de `tool_result` para estos tools.

Para tools con `completionAuthority: hook` (`web_search`, `web_fetch`), `SessionPersistence` SHALL seguir recibiendo `tool_result` emitido por `completeToolUse` invocado desde `PostToolUse` / `PostToolUseFailure`.

En ambos casos, `onToolResult` SHALL escribir `tools/KK-slug/result.json` y actualizar `meta.json` del tool.

#### Scenario: result.json client-side escrito desde continuation canónica

- **GIVEN** un tool `Bash` completado por `handleContinuation` con contenido de stdout en el bloque `tool_result`
- **WHEN** `SessionPersistence.onToolResult` procesa el evento `tool_result` emitido por el correlador
- **THEN** SHALL existir `tools/KK-slug/result.json` con el stdout
- **AND** `meta.json` del tool SHALL tener `status: completed`

#### Scenario: PostToolUse ignorado no escribe result.json vacío

- **GIVEN** un tool `Bash` con `completionAuthority: continuation` aún en `status: running`
- **AND** llegó un hook `PostToolUse` que el handler ignoró (sin evento bus)
- **WHEN** no ha llegado aún la continuation HTTP
- **THEN** NO SHALL existir `tools/KK-slug/result.json` con `{ "result": null }`
- **AND** `meta.json` del tool SHALL mantener `status: running`

#### Scenario: result.json hook-authority para WebFetch

- **GIVEN** un evento `tool_result` en el bus para un tool `WebFetch` completado vía `PostToolUse` (`completionAuthority: hook`)
- **WHEN** `SessionPersistence.onToolResult` procesa el evento
- **THEN** SHALL existir `tools/KK-slug/result.json`
- **AND** `meta.json` del tool SHALL tener `status: completed` o `error`

