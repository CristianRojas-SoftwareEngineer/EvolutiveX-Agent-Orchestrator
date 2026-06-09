---
case_id: 20260609-proxy-concurrent-step-attribution
profile: corrective
phase: 18-communication
chain: closure
version: v1.0
timestamp: 2026-06-09T11:30:00Z
status: done
case_run: 1
inputs: [17-conclusion.md]
produces: 18-communication.md
links: { previous: 17-conclusion.md, next: }
---

# Communication — 20260609-proxy-concurrent-step-attribution

## Applied policy

- **acceptance:** commit con metadatos Case:; cita solución ganadora

## Summary

Caso correctivo que documenta y formaliza la corrección del **cross-wiring** de respuestas HTTP cuando hops concurrentes comparten un workflow de turno (`side-request` + `agentic` fresh). Causa: egress ignora `assignedStepIndex` y usa heurística del último step abierto. Solución ganadora **S-A**: enriquecer y proyectar por índice asignado en ingress.

## Solución ganadora (de 16)

**S-A — Atribución egress por `assignedStepIndex`.** Cambios en `gateway-wire-step.util.ts`, `audit-sse-response.handler.ts`, `audit-standard-response.handler.ts` + test concurrente.

## OpenSpec

| Campo | Valor |
|-------|-------|
| Change | `fix-concurrent-step-attribution` |
| Ruta | `openspec/changes/fix-concurrent-step-attribution/` |
| Estado | **Apply-ready** (proposal, design, specs, tasks) |
| Siguiente paso | `/openspec-apply fix-concurrent-step-attribution` |

## CHANGELOG

`--pending` (commit pendiente de solicitud del usuario)

## Commit draft

```
fix(audit): atribuir respuestas egress por assignedStepIndex

Case: 20260609-proxy-concurrent-step-attribution

Propósito: corregir cross-wiring forense cuando hops concurrentes
comparten un workflow de turno post-unify-turn-workflow.

Solución ganadora: S-A — enrichWireStepWithResponseByIndex +
context.assignedStepIndex en handlers SSE/standard.
```

## Bucle C

No aplica — caso `done` en ruta (a) con OpenSpec formalizado, apply pendiente.

## Acceptance check

Comunicación completa; OpenSpec change creado; commit no ejecutado (no solicitado).
