## Why

La implementación actual registra dos `IStep` por hop HTTP (ingress en `registerWireStepRequest`, egress en `registerWireStepInCorrelator`), produciendo carpetas `steps/` alternadas request-only / response-only. Esto contradice `docs/session-audit-model.md`, donde un step agrupa `request/` y `response/` bajo el mismo `steps/MM/`. Evidencia: sesión `d0cce210`, workflow `02` con 6 carpetas pero `stepCount: 3`.

Caso SM: `20260608-proxy-step-request-response-split` (perfil correctivo).

## What Changes

- `enrichOpenWireStepWithResponse`: enriquecer el step abierto en egress en lugar de registrar uno nuevo.
- `resolveOpenWireStepIndex`: corregir índice de `stream_chunk` SSE.
- Paridad en `AuditSseResponseHandler` y `AuditStandardResponseHandler`.
- Tests en `gateway-wire-step.util.test.ts`.

## Capabilities

### Modified Capabilities

- `gateway-audit-projection`: unificación request/response en un `IStep` por hop.
- `gateway-workflow-lifecycle`: correlación ingress/egress sin doble `registerStep`.
- `session-persistence`: proyección coherente `steps/MM/request` + `steps/MM/response`.

## Impact

| Área | Archivos |
|------|----------|
| 3-operations | `gateway-wire-step.util.ts`, `audit-sse-response.handler.ts`, `audit-standard-response.handler.ts` |
| tests | `gateway-wire-step.util.test.ts` |
