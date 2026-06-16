## 1. Util wire-step

- [x] 1.1 Añadir `enrichWireStepWithResponseByIndex(repo, workflowId, stepIndex, patch, stopReason)` en `gateway-wire-step.util.ts`
- [x] 1.2 Mantener `enrichOpenWireStepWithResponse` como fallback cuando el índice no encuentra step abierto
- [x] 1.3 Añadir tests unitarios en `gateway-wire-step.util.test.ts` (dos steps abiertos, enrich por índice)

## 2. Handlers egress

- [x] 2.1 `AuditSseResponseHandler`: usar `context.assignedStepIndex` en `stream_chunk` y enrich por índice
- [x] 2.2 `AuditStandardResponseHandler`: enrich por `context.assignedStepIndex`
- [x] 2.3 Añadir test de regresión concurrente en `audit-sse-response.handler.test.ts`

## 3. Verificación

- [x] 3.1 Ejecutar `npm run test:quick` — suite verde
- [x] 3.2 Ejecutar `openspec verify fix-concurrent-step-attribution` sin CRITICALs
