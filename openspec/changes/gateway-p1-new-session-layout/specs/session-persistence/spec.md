# session-persistence Specification

## Purpose

Suscriptor del `EventBus` que proyecta eventos del correlador a disco bajo la estructura `causal-workflows-v1` (`workflows/NN/steps/MM/tools/KK/`). Reemplaza la escritura directa desde handlers de capa 3 (`AuditWriterService`, `SessionStoreService`, `WorkflowResultProjector`).

## ADDED Requirements

### Requirement: SessionPersistence — suscripción al bus y proyección a disco

El sistema SHALL proveer `SessionPersistence` en `src/2-services/session-persistence.service.ts` como suscriptor del `EventBus` que, al recibir eventos del correlador, proyecta la estructura de directorios y archivos del layout `causal-workflows-v1` bajo `sessions/`.

`SessionPersistence` SHALL suscribirse a los siguientes eventos en su constructor:

| Evento | Acción |
|---|---|
| `workflow_start` | Crear `workflows/NN/`; escribir `meta.json` inicial (status: `running`) |
| `workflow_spawn` | Crear `workflows/NN/tools/KK-sub-agent/sub-agent/workflow/`; escribir `meta.json` del sub-workflow |
| `step_request` | Crear `steps/MM/`; escribir `request/body.json` |
| `tool_call` | Crear `tools/KK-slug/`; escribir `input.json` y `meta.json` |
| `tool_result` | Escribir `result.json` en `tools/KK-slug/`; actualizar `meta.json` del tool |
| `workflow_complete` | Actualizar `meta.json` (status: `completed`); escribir `output/result.json` + `output/result.parsed.md` |
| `workflow_cancel` | Actualizar `meta.json` (status: `cancelled`, `cancellationReason`) |

#### Scenario: workflow_start crea directorio y meta.json inicial

- **GIVEN** una sesión `'sess-1'` sin directorio de workflow
- **WHEN** `SessionPersistence` recibe un evento `{ type: 'workflow_start', sessionId: 'sess-1', payload: { workflowId: 'wf-1', kind: 'main' } }`
- **THEN** SHALL crearse el directorio `sessions/sess-1/workflows/00/`
- **AND** SHALL escribirse `meta.json` con `status: 'running'`, `workflowKind: 'main'`, `layoutVersion: 'causal-workflows-v1'`

#### Scenario: step_request crea directorio y request/body.json

- **GIVEN** un workflow `'wf-1'` en sesión `'sess-1'`
- **WHEN** `SessionPersistence` recibe un evento `{ type: 'step_request', payload: { workflowId: 'wf-1', stepIndex: 0, body: { model: 'claude-sonnet-4-6', messages: [...] } } }`
- **THEN** SHALL crearse el directorio `sessions/sess-1/workflows/00/steps/00/request/`
- **AND** SHALL escribirse `request/body.json` con el contenido del payload

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

### Requirement: Escritura atómica de meta.json

`SessionPersistence` SHALL escribir `meta.json` de forma atómica: escribir en un archivo temporal y renombrar (write temp + rename). Las escrituras de `meta.json` para un mismo workflow SHALL serializarse mediante un `writeQueue` por archivo para evitar condiciones de carrera.

#### Scenario: Escrituras concurrentes a meta.json se serializan

- **GIVEN** dos eventos que afectan el mismo `meta.json` llegan en rápida sucesión
- **WHEN** `SessionPersistence` procesa ambos eventos
- **THEN** las escrituras SHALL ejecutarse secuencialmente (no en paralelo)
- **AND** el archivo final SHALL reflejar el estado del último evento procesado

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
