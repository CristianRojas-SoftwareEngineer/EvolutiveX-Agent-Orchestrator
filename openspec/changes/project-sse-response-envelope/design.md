## Context

**Estado actual**

El publish de `step_response` para steps SSE está en `src/3-operations/audit-sse-response.handler.ts:192-205`:

```typescript
payload: {
  workflowId: workflow.id,
  stepIndex: wireStep.index,
  response: assembled.assistantMessage,   // ← solo {role, content}
  ...
}
```

`AssembledInference` (`src/2-services/ports/step-assembler.port.ts:12-21`) ya expone `anthropicMessageId`, `model`, `stopReason` y `usage` ensamblados desde los eventos `message_start`/`message_delta` del stream — el envelope completo está disponible en el punto del publish y se descarta.

**Suscriptores de `step_response`**

Único suscriptor: `SessionPersistence.onStepResponse` (`src/2-services/session-persistence.service.ts:94,215-228`), que vuelca `payload.response` tal cual a `response/body.json`. No existen otros consumidores de producción que dependan del shape `{role, content}`; el cambio de shape no rompe contratos downstream.

**Evidencia forense**

En la sesión `b76b465c-5062-4036-b38f-b4e295699b38`, la ausencia de `stop_reason`/`usage` en los `body.json` SSE indujo 7 falsos positivos durante el diagnóstico de métricas. El path estándar (`audit-standard-response.handler.ts:183`) publica el body parseado completo: la asimetría es exclusiva del transporte SSE.

## Goals / Non-Goals

**Goals:**

- `payload.response` de `step_response` SSE SHALL ser un envelope Message Anthropic completo.
- Paridad de shape con el path estándar: `body.json` legible forensemente sin distinguir transporte.
- Un único punto de cambio: el publish del handler SSE.

**Non-Goals:**

- Cambiar `stream_chunk`, vistas coalesced (`body.coalesced.json`) o `SseReconstructService`.
- Cambiar `SessionPersistence` (proyector pasivo).
- Cambiar el path estándar ni el statusline.

## Decisions

### D1 — Construir el envelope en el publish del handler SSE desde `assembled`

**Decisión:** En `audit-sse-response.handler.ts`, reemplazar `response: assembled.assistantMessage` por el envelope construido inline con `assembled.anthropicMessageId`, `assembled.model`, `assembled.assistantMessage.content`, `assembled.stopReason` y `assembled.usage` (más los literales `type: 'message'`, `role: 'assistant'`, `stop_sequence: null`).

**Alternativas descartadas:**

| Alternativa | Motivo de descarte |
|-------------|-------------------|
| Enriquecer en `SessionPersistence.onStepResponse` desde el wireStep | La persistencia es proyector pasivo (escribe lo que el bus transporta); re-derivar dominio en capa 2 invierte responsabilidades y duplica estado |
| Usar `SseReconstructService.runReconstruction` para reconstruir el envelope | Duplica el ensamblado que `StepAssemblerService` ya hizo durante el stream; ese método no tiene call sites de producción y reintroducirlo añade un segundo camino de verdad |

### D2 — `payload.response` como envelope completo también en `events.ndjson`

**Decisión:** No introducir un shape distinto para el evento del bus vs. la proyección a disco: el envelope viaja una sola vez en el publish y `events.ndjson` lo registra tal cual (deriva natural del publish único). Mantener dos shapes exigiría transformación en persistencia (violaría D1).

## Risks / Trade-offs

| Riesgo | Mitigación |
|--------|------------|
| Crecimiento marginal de cada evento `step_response` en `events.ndjson` (campos de envelope) | Aceptado: son ~6 campos escalares por hop; el contenido grande (`content[]`) ya viajaba en el payload |
| Tests existentes que asserten `payload.response` como `{role, content}` | Actualizarlos al shape de envelope como parte del change (no hay consumidores de producción del shape viejo) |
| Sesiones históricas con `body.json` sin envelope | Sin migración: proyecto en desarrollo activo, sin consumidores de sesiones grabadas |

## Migration Plan

1. Modificar el publish en `audit-sse-response.handler.ts`.
2. Actualizar asserts en `tests/3-operations/audit-sse-response.handler.test.ts`.
3. `npm run test:quick`.

**Rollback:** revert del change; sin migración de datos.

## Open Questions

_(ninguna — punto de construcción y suscriptores verificados en la investigación previa)_
