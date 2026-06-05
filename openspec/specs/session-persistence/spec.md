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

#### Scenario: workflow_start crea directorio y meta.json inicial

- **GIVEN** una sesión `'sess-1'` sin directorio de workflow
- **WHEN** `SessionPersistence` recibe un evento `{ type: 'workflow_start', sessionId: 'sess-1', payload: { workflowId: 'wf-1', kind: 'main' } }`
- **THEN** SHALL crearse el directorio `sessions/sess-1/workflows/00/`
- **AND** SHALL escribirse `meta.json` con `status: 'running'`, `workflowKind: 'main'`, `layoutVersion: 'causal-workflows-v1'`

#### Scenario: workflow_start con request escribe request/body.json

- **GIVEN** una sesión `'sess-1'`
- **WHEN** `SessionPersistence` recibe `{ type: 'workflow_start', sessionId: 'sess-1', payload: { workflowId: 'wf-1', kind: 'main', request: { model: 'claude-sonnet-4-6', messages: [...] } } }`
- **THEN** SHALL escribirse `request/body.json` con el contenido del request

#### Scenario: step_request crea directorio y request/body.json

- **GIVEN** un workflow `'wf-1'` en sesión `'sess-1'`
- **WHEN** `SessionPersistence` recibe un evento `{ type: 'step_request', payload: { workflowId: 'wf-1', stepIndex: 0, step: {...}, request: { model: 'claude-sonnet-4-6', messages: [...] } } }`
- **THEN** SHALL crearse el directorio `sessions/sess-1/workflows/00/steps/00/request/`
- **AND** SHALL escribirse `request/body.json` con el contenido del request

#### Scenario: step_response escribe contenido de respuesta

- **GIVEN** un step en workflow `'wf-1'`
- **WHEN** `SessionPersistence` recibe `{ type: 'step_response', payload: { workflowId: 'wf-1', stepIndex: 0, response: { body: {...} }, headers: { 'content-type': '...' }, markdown: '...' } }`
- **THEN** SHALL escribirse `response/body.json` si `response` está presente
- **AND** SHALL escribirse `response/headers.json` si `headers` está presente
- **AND** SHALL escribirse `response/parsed.md` si `markdown` está presente

#### Scenario: tool_call crea directorio con slug y archivos input/meta

- **GIVEN** un step en workflow `'wf-1'`
- **WHEN** `SessionPersistence` recibe un evento `{ type: 'tool_call', payload: { workflowId: 'wf-1', stepIndex: 0, toolUseId: 'tu-1', toolName: 'Read', input: { file_path: '/tmp/a.ts' } } }`
- **THEN** SHALL crearse el directorio `sessions/sess-1/workflows/00/steps/00/tools/00-Read/`
- **AND** SHALL escribirse `input.json` con el input del tool
- **AND** SHALL escribirse `meta.json` con `toolUseId`, `toolName` y `status: 'running'`

#### Scenario: tool_result escribe result.json y actualiza meta.json

- **GIVEN** un tool `'tu-1'` registrado en el correlador
- **WHEN** `SessionPersistence` recibe un evento `{ type: 'tool_result', payload: { workflowId: 'wf-1', toolUseId: 'tu-1', result: { isError: false, result: 'contenido' } } }`
- **THEN** SHALL escribirse `result.json` con `{ isError: false, result: 'contenido' }`
- **AND** `meta.json` del tool SHALL actualizarse con `status: 'completed'`

#### Scenario: workflow_complete escribe output/result.json y actualiza meta.json

- **GIVEN** un workflow `'wf-1'` con steps cerrados
- **WHEN** `SessionPersistence` recibe un evento `{ type: 'workflow_complete', payload: { workflowId: 'wf-1', result: { outcome: 'success', finalText: 'Listo', usage: {...}, steps: [...] } } }`
- **THEN** SHALL actualizarse `meta.json` con `status: 'completed'` y `completedAt`
- **AND** SHALL escribirse `output/result.json` con el `IWorkflowResult` completo
- **AND** SHALL escribirse `output/result.parsed.md` con la vista Markdown

#### Scenario: workflow_cancel actualiza meta.json con status cancelled

- **GIVEN** un workflow `'wf-1'` activo
- **WHEN** `SessionPersistence` recibe un evento `{ type: 'workflow_cancel', payload: { workflowId: 'wf-1', cancellationReason: 'user_abort' } }`
- **THEN** `meta.json` SHALL actualizarse con `status: 'cancelled'` y `cancellationReason: 'user_abort'`

---

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
