## Why

Los `side-request` de tipo `POST /v1/messages/count_tokens` completan con HTTP 200 pero el proxy no proyecta `steps/MM/response/` ni emite `step_response` en el bus. Evidencia: sesión `f33cf423-7712-42a6-8404-aab2ce430224` — `step_request` índice 5 (05:29:16) sin `step_response` correspondiente; disco con `request/body.json` y sin carpeta `response/`.

La causa es que `AuditStandardResponseHandler` aborta cuando el body JSON no incluye campo `usage` (`if (!bodyUsage) return`), mientras `count_tokens` responde `{ "input_tokens": N }`. Esto viola la spec vigente: los `side-request` SHALL cerrar el step en respuesta terminal. El test unitario actual codifica el comportamiento incorrecto («no emite step_response si el body no tiene usage»).

## What Changes

- Separar **proyección de auditoría** de **métricas facturables** en `AuditStandardResponseHandler`: toda respuesta HTTP estándar con body JSON válido SHALL enriquecer el step asignado, emitir `step_response` y permitir proyección a disco.
- `persistBillableStepMetricsIfNeeded` SHALL invocarse solo cuando el step enriquecido tenga `usage` (sin cambio de contrato; ya guarda por `step.usage == null`).
- Añadir escenarios de spec para `count_tokens` y respuestas estándar sin `usage`.
- Sustituir el test que exige silencio sin `usage` por tests que verifiquen proyección sin métricas.
- Añadir test de regresión con forma `count_tokens` (`{ input_tokens }`) y step abierto por ingress.

## Capabilities

### New Capabilities

_(ninguna)_

### Modified Capabilities

- `gateway-audit-projection`: `AuditStandardResponseHandler` SHALL emitir `step_response` y cerrar el step en respuesta terminal aunque el body no tenga `usage`; métricas per-step siguen condicionadas a `usage` presente.

## Impact

| Área | Detalle |
|------|---------|
| **Capa 3** | `audit-standard-response.handler.ts` (lógica egress no-SSE) |
| **Capa 1** | Sin cambios de tipos (`WireStepResponsePatch.usage` ya es opcional) |
| **Tests** | `tests/3-operations/audit-standard-response.handler.test.ts` |
| **Specs** | Delta `gateway-audit-projection` |
| **Sesiones históricas** | Sin migración; sesiones ya grabadas conservan steps huérfanos |
| **Métricas** | Sin impacto: `count_tokens` y hops sin `usage` no incrementan tokens en `session-metrics.json` |

## No objetivos

- Rama específica solo para `/v1/messages/count_tokens` (se resuelve con regla general).
- Normalizar `{ input_tokens }` a `{ usage: { … } }` sintético.
- Excluir `count_tokens` del árbol causal en ingress.
- Corregir drift `total_workflows` (hallazgo 2, change separado).
- Cambiar comportamiento de `AuditSseResponseHandler` (SSE ya ensambla usage desde eventos del stream).
