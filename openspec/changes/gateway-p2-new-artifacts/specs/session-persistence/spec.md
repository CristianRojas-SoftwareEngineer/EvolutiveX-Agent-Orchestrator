## MODIFIED Requirements

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
| `stream_chunk` | Escribir `steps/MM/response/streaming/NNNN-chunk.ndjson`; al cierre del step reconstruir `response/body.json` y `response/parsed.md` |
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

#### Scenario: Suscripciones P2 registradas en constructor

- **GIVEN** un `EventBus` y un `SessionPersistence` instanciados
- **WHEN** se inspeccionan las suscripciones del constructor
- **THEN** SHALL existir handlers para `stream_chunk` y patrón `*`
- **AND** las suscripciones P1 (`workflow_start`, `tool_call`, etc.) SHALL permanecer activas

## ADDED Requirements

### Requirement: events.ndjson — log cronológico de sesión

`SessionPersistence` SHALL suscribirse al patrón `*` y SHALL appendear cada `TelemetryEvent` como una línea JSON en `sessions/<sessionId>/events.ndjson` sin reescribir el archivo completo.

#### Scenario: workflow_start aparece en events.ndjson

- **GIVEN** una sesión nueva `'sess-p2'`
- **WHEN** se publica `workflow_start` al bus
- **THEN** `sessions/sess-p2/events.ndjson` SHALL contener una línea con `type: 'workflow_start'`

### Requirement: stream_chunk — chunks forenses y reconstrucción de body

`SessionPersistence` SHALL persistir cada evento `stream_chunk` como `steps/MM/response/streaming/NNNN-chunk.ndjson` (numeración de 4 dígitos por step). Los eventos SSE de tipo `ping` SHALL NOT persistirse como chunks.

Al recibir el cierre del step (último chunk que indica `message_stop` o señal equivalente en payload), `SessionPersistence` SHALL reconstruir y escribir `response/body.json` y `response/parsed.md` a partir de los chunks ordenados del step.

#### Scenario: ping no genera chunk en disco

- **GIVEN** un step con suscripción activa a `stream_chunk`
- **WHEN** llega un chunk cuyo evento SSE es `ping`
- **THEN** NO SHALL crearse un nuevo archivo bajo `response/streaming/`

#### Scenario: body reconstruido equivale al body directo

- **GIVEN** un step con chunks persistidos y un body de referencia escrito por `step_response`
- **WHEN** se completa la reconstrucción al cierre del step
- **THEN** el contenido de `response/body.json` reconstruido SHALL ser equivalente al body de referencia (§37b #14)

### Requirement: workflow-sequence.json

`SessionPersistence` SHALL mantener `sessions/<sessionId>/workflows/workflow-sequence.json` de forma incremental y atómica, actualizándolo en `workflow_start`, `workflow_complete` y `workflow_cancel` de workflows principales de la sesión.

#### Scenario: Índice actualizado al completar workflow

- **GIVEN** un workflow main en ejecución con entrada en `workflow-sequence.json`
- **WHEN** llega `workflow_complete`
- **THEN** la entrada del workflow SHALL reflejar status `completed`

### Requirement: Vistas coalesced desde streaming

Para steps con flujo coalesced (multi-fase SSE), `SessionPersistence` SHALL generar `response/body.coalesced.json` y `response/body.coalesced.parsed.md` al cierre del step a partir de los chunks persistidos, integrando sub-agentes según el diseño §37b #18, sin depender de `ISseAuditWriter`.

#### Scenario: Step coalesced sin sse.jsonl

- **GIVEN** un step coalesced procesado solo vía `stream_chunk`
- **WHEN** el step se cierra
- **THEN** SHALL existir `body.coalesced.json` bajo `response/`
- **AND** NO SHALL existir `response/sse.jsonl`
