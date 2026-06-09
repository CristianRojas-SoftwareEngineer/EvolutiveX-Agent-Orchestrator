---
case_id: 20260609-proxy-concurrent-step-attribution
profile: corrective
phase: 05-experiment-design
chain: cause
version: v1.0
timestamp: 2026-06-09T10:25:00Z
status: done
inputs: [04-hypothesis.md]
produces: 05-experiment-design.md
links: { previous: 04-hypothesis.md, next: 06-experiment-execution.md }
---

# Experiment Design — 20260609-proxy-concurrent-step-attribution

## Applied policy

- **acceptance:** test de reproducción ejecutable
- **risk_controls:** sandbox

## Protocol

### E1 — Reproducción H1 (unit test)

**Setup:**
1. Workflow turno con `steps.length === 0`.
2. Registrar step 1 (side-request) vía `registerWireStepRequest` — `assignedStepIndex: 1`, sin cerrar.
3. Registrar step 2 (agentic) — `assignedStepIndex: 2`, sin cerrar.
4. Simular egress SSE del hop 1 con `context.assignedStepIndex: 1` y respuesta «TITLE_JSON».
5. Simular egress SSE del hop 2 con `context.assignedStepIndex: 2` y respuesta «BASH_TOOL».

**Controles:**
- Código actual (heurística): se espera cross-wiring (step 2 recibe TITLE si completa primero el hop 1 con heurística «último abierto»).
- Código corregido: cada response enriquece step por índice.

**Métricas:**
- `wireStep.index` tras cada `registerWireInference`
- Payload `step_response.stepIndex`
- Contenido `assistantMessage` en `IStep` por índice

**Rollback:** ningún cambio en producción; solo test en sandbox vitest.

### E2 — No-regresión hops secuenciales

Reutilizar `gateway-wire-step.util.test.ts` y `audit-sse-response.handler.test.ts` existentes.

## Acceptance check

Procedimiento ejecutable con métricas binarias.
