## 1. Util wire-step

- [x] 1.1 Añadir `enrichOpenWireStepWithResponse` y `resolveOpenWireStepIndex`
- [x] 1.2 Modificar `registerWireStepInCorrelator` para enriquecer step abierto

## 2. Handlers egress

- [x] 2.1 `AuditSseResponseHandler`: `resolveOpenWireStepIndex` + enrich en `registerWireInference`
- [x] 2.2 `AuditStandardResponseHandler`: paridad con camino SSE

## 3. Tests

- [x] 3.1 `tests/3-operations/gateway-wire-step.util.test.ts`
- [x] 3.2 `npm run test:unit` verde
