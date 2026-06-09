---
case_id: 20260608-proxy-step-request-response-split
profile: corrective
phase: 18-communication
chain: closure
version: v1.0
timestamp: 2026-06-08T13:35:00Z
status: done
case_run: 1
inputs: [17-conclusion.md]
produces: 18-communication.md
links: { previous: 17-conclusion.md, next: "" }
---

# Communication — 20260608-proxy-step-request-response-split

## Resumen ejecutivo

El proxy registraba dos `IStep` por hop HTTP (request en ingress, response en egress), generando carpetas `steps/` alternadas y contradiciendo `session-audit-model.md`. Se unificó enriqueciendo el step abierto en egress.

## Cambios aplicados

- **`enrichOpenWireStepWithResponse`**: un hop → un `IStep` con request y response.
- **`resolveOpenWireStepIndex`**: corrige `stepIndex` de `stream_chunk` SSE.
- Handlers SSE y standard actualizados.
- Tests: `gateway-wire-step.util.test.ts` (599 unitarios verdes).
- OpenSpec archivado: `2026-06-09-align-wire-step-request-response`.

## Evidencia

- Sesión observación: `d0cce210-92e4-4f3a-b838-15716ca5dd05` workflow `02` (6 carpetas, stepCount 3).
- Solución: `16-solution-analysis.md ## Solución ganadora`
- Causa: `08-analysis.md ## Causa confirmada`

## Riesgos

- Sesiones históricas conservan layout dual (sin migración).
- Validar con nueva sesión agentic post-fix.

## Retención

Conservar `tests/3-operations/gateway-wire-step.util.test.ts` como evidencia citada en conclusión.

## Commit draft

```
fix(gateway): unificar request/response en un IStep por hop wire

Propósito: la implementación registraba dos IStep por hop HTTP (ingress
y egress), produciendo carpetas steps/ alternadas request-only/response-only
contradiciendo session-audit-model.md.

Objetivos:
- Un hop → un steps/MM/ con request/ y response/
- stepIndex coherente en stream_chunk y step_response
- Tests de regresión

Resumen de cambios:
- enrichOpenWireStepWithResponse en gateway-wire-step.util.ts
- resolveOpenWireStepIndex para SSE
- Paridad AuditSseResponseHandler y AuditStandardResponseHandler

(ver 16-solution-analysis.md ## Solución ganadora)

Case: 20260608-proxy-step-request-response-split
```

## Acceptance check

Comunicación autocontenida; commit draft con Case trailer y cita a solución ganadora.
