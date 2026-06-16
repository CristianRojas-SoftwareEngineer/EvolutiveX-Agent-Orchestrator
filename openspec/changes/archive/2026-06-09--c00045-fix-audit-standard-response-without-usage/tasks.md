## 1. Handler egress estándar

- [x] 1.1 En `audit-standard-response.handler.ts`: eliminar el early return `if (!bodyUsage) return` como condición de proyección; continuar solo si `JSON.parse` del buffer tiene éxito (design D2).
- [x] 1.2 Construir `responsePatch` con `usage` opcional: incluir `usage` en el patch solo cuando `bodyUsage` esté definido; `assistantMessage` y `stopReason` desde el JSON parseado (design D3).
- [x] 1.3 Mantener enrich por `context.assignedStepIndex` → fallback heurístico → fallback `buildWireStep` (sin cambio de orden).
- [x] 1.4 Invocar `persistBillableStepMetricsIfNeeded` solo cuando `bodyUsage` esté definido (o cuando el step enriquecido tenga `usage`); publicar `step_response` siempre que el enrich produzca `wireStep` y exista `parsedBody` válido.
- [x] 1.5 Preservar registro de `tool_use` client-side en content cuando exista (design D5).

## 2. Tests unitarios

- [x] 2.1 Eliminar o reemplazar el test `no emite step_response si el body no tiene usage` por caso positivo: body `{"id":"msg_1","stop_reason":"end_turn"}` → emite `step_response` con índice asignado.
- [x] 2.2 Añadir test `emite step_response para count_tokens sin usage`: step abierto en correlador, body `{"input_tokens": 42444}`, assert `step_response` con `stepIndex` = `assignedStepIndex` y `response.input_tokens`.
- [x] 2.3 Añadir test `no invoca updateFromStep sin usage`: mock `SessionMetricsService.updateFromStep`; respuesta sin `usage` → `updateFromStep` no llamado.
- [x] 2.4 Verificar que el test de buffer truncado (`MAX_RESPONSE_BUFFER_BYTES`) sigue sin emitir `step_response` (regresión D2).
- [x] 2.5 (Opcional) Test con dos steps abiertos: respuesta estándar en índice 5 sin usage no enriquece índice 6 (paridad escenario spec concurrente).

## 3. Verificación y cierre

- [x] 3.1 Ejecutar `npm run test:quick` — suite verde.
- [x] 3.2 Ejecutar `openspec verify fix-audit-standard-response-without-usage` sin CRITICALs.
- [x] 3.3 Validación manual opcional: reproducir hop `count_tokens` y confirmar par `step_request`/`step_response` mismo índice + `response/body.json` en disco.
