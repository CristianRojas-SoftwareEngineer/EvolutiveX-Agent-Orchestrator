## ADDED Requirements

### Requirement: Proyección de respuesta estándar sin usage

`AuditStandardResponseHandler` SHALL proyectar respuestas HTTP estándar (no-SSE) al step cuyo índice es `context.assignedStepIndex` cuando el body acumulado sea JSON válido, **independientemente** de que el objeto parseado incluya campo `usage`.

En respuestas sin `usage`, el handler SHALL:

- enriquecer el step abierto en el índice asignado (con fallback heurístico solo si el índice no encuentra step abierto);
- publicar `step_response` con `payload.stepIndex` igual a `context.assignedStepIndex` y `payload.response` igual al body parseado;
- cerrar el step en el correlador (respuesta terminal cuando `stop_reason` es terminal, ausente o vacío);
- **NO** invocar `persistBillableStepMetricsIfNeeded` ni incrementar contadores/tokens en `session-metrics.json`.

Si el body no es JSON válido (p. ej. buffer truncado por `MAX_RESPONSE_BUFFER_BYTES`), el handler SHALL NOT publicar `step_response` (comportamiento sin cambio respecto al límite de buffer).

#### Scenario: count_tokens side-request cierra step con step_response

- **GIVEN** un turno abierto con un step `side-request` registrado en índice 5 vía `step_request`
- **AND** `AuditWorkflowContext.assignedStepIndex` es 5
- **WHEN** `AuditStandardResponseHandler` procesa una respuesta HTTP 200 cuyo body es `{"input_tokens": 42444}` (sin campo `usage`)
- **THEN** SHALL publicarse `step_response` con `payload.stepIndex` 5
- **AND** `payload.response` SHALL contener el objeto parseado con `input_tokens`
- **AND** el step 5 SHALL quedar cerrado en el correlador (`closedAt` definido)
- **AND** `SessionPersistence` SHALL poder escribir `workflows/MM/steps/05/response/body.json`

#### Scenario: Respuesta estándar con stop_reason pero sin usage proyecta auditoría

- **GIVEN** un step abierto en índice 1 con `assignedStepIndex` 1
- **WHEN** el body de respuesta es JSON válido `{"id":"msg_1","stop_reason":"end_turn"}` sin campo `usage`
- **THEN** SHALL publicarse `step_response` para índice 1
- **AND** el step SHALL cerrarse en el correlador

#### Scenario: Respuesta sin usage no incrementa métricas per-step

- **GIVEN** un workflow `kind: main` y un step abierto enriquecido sin `usage`
- **WHEN** `AuditStandardResponseHandler` completa el procesamiento de una respuesta sin campo `usage`
- **THEN** `persistBillableStepMetricsIfNeeded` SHALL NOT invocar `SessionMetricsService.updateFromStep` para ese hop
- **AND** `session-metrics-applied.json` SHALL NOT registrar el `step.id` de ese hop como aplicado por métricas

#### Scenario: Body JSON inválido no emite step_response

- **GIVEN** el buffer acumulado supera `MAX_RESPONSE_BUFFER_BYTES` y el contenido restante no es JSON válido
- **WHEN** `AuditStandardResponseHandler` finaliza el stream
- **THEN** NO SHALL publicarse `step_response`
- **AND** NO SHALL enriquecerse el step en el correlador

#### Scenario: count_tokens concurrente con hop agentic no cruza índices

- **GIVEN** steps 5 (`side-request` count_tokens) y 6 (`agentic`) abiertos en el mismo workflow
- **WHEN** la respuesta estándar de count_tokens llega con `assignedStepIndex` 5
- **AND** la respuesta SSE del hop agentic llega con `assignedStepIndex` 6
- **THEN** `step_response` del hop 5 SHALL usar `stepIndex` 5 únicamente
- **AND** `step_response` del hop 6 SHALL usar `stepIndex` 6 únicamente
- **AND** NO SHALL omitirse `step_response` para índice 5 por ausencia de `usage`
