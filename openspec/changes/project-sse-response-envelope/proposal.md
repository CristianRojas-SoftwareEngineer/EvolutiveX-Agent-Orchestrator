## Why

Para steps SSE, el evento `step_response` publica en `payload.response` únicamente `assembled.assistantMessage` (`{role, content}`) — `src/3-operations/audit-sse-response.handler.ts:200` — y `SessionPersistence.onStepResponse` lo vuelca tal cual a `response/body.json` (`src/2-services/session-persistence.service.ts:227`). El body proyectado carece de `id`, `model`, `stop_reason` y `usage`.

El path estándar (no-SSE) publica el body parseado completo (`audit-standard-response.handler.ts:183`), por lo que la paridad SSE/estándar está rota sin justificación: `AssembledInference` ya expone `anthropicMessageId`, `model`, `stopReason` y `usage` (`src/2-services/ports/step-assembler.port.ts:12-21`) — el dato existe y se descarta en el publish.

Impacto forense demostrado: en la investigación de la sesión `b76b465c-5062-4036-b38f-b4e295699b38`, la ausencia de `stop_reason` y `usage` en los `body.json` de steps SSE indujo 7 falsos positivos en el diagnóstico de métricas, porque no era posible distinguir hops `tool_use` de hops terminales sin reconstruir el stream.

## What Changes

- Construir el envelope Message Anthropic completo (`{ id, type: 'message', role: 'assistant', model, content, stop_reason, stop_sequence: null, usage }`) en el publish de `step_response` del handler SSE, desde los campos ya disponibles en `AssembledInference`.
- `SessionPersistence` no cambia: sigue volcando `payload.response` tal cual; el envelope llega completo por el publish.
- Ajustar el escenario de spec de `StepAssembler` que asume bloques en la raíz de `body.json` (ahora viven en `content[]` del envelope).

## Capabilities

### New Capabilities

_(ninguna)_

### Modified Capabilities

- `gateway-audit-projection`: el evento `step_response` de steps SSE SHALL transportar el envelope Message completo; `response/body.json` SHALL ser homólogo al del path estándar.

## Impact

| Área | Detalle |
|------|---------|
| **Capa 3** | `audit-sse-response.handler.ts` (publish de `step_response`, un único punto) |
| **Capa 2** | Sin cambios (`SessionPersistence` es proyector pasivo) |
| **Tests** | `tests/3-operations/audit-sse-response.handler.test.ts` (asserts del shape del payload) |
| **Docs** | `docs/gateway-architecture.md` — sección de estructura de `steps/MM/response/body.json` |
| **events.ndjson** | El evento `step_response` crece marginalmente (envelope en vez de `{role, content}`) |

## No objetivos

- Cambiar eventos `stream_chunk` ni su proyección.
- Cambiar las vistas coalesced (`body.coalesced.json`).
- Modificar `SseReconstructService`.
- Tocar el statusline (`scripting/router-status.ts`).
- Cambiar el path estándar (no-SSE), que ya proyecta el envelope completo.
