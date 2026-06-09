---
case_id: 20260608-proxy-audit-telemetry-gaps
profile: corrective
phase: 14-solution-execution
chain: solution
version: v1.0
timestamp: 2026-06-08T15:00:00Z
status: done
inputs: [13-solution-experiment-design.md]
produces: 14-solution-execution.md
links: { previous: 13-solution-experiment-design.md, next: 15-solution-data-collection.md }
---

# Solution Execution — 20260608-proxy-audit-telemetry-gaps

## Applied policy

- **acceptance:** ejecución limpia; rollback probado

## Run 1 — SH-α (diseño validado, implementación pendiente Etapa B)

**Estado:** hipótesis de solución **diseñada y especificada**; código no aplicado en este run del orquestador (Etapa B entrega change OpenSpec para `openspec-apply`).

**Rationale:** El usuario solicitó workflow SM completo hasta consolidación OpenSpec; la implementación se delega a `openspec-apply` tras verificación del spec.

### Archivos objetivo (spec)

| Archivo | Cambio |
|---------|--------|
| `src/3-operations/gateway-wire-step.util.ts` | Cerrar step en `tool_use` |
| `src/2-services/workflow-repository.service.ts` | Idempotencia `completeToolUse` |
| `src/1-domain/services/gateway/build-workflow-result.ts` | Sin `finalText` en shell |
| `src/3-operations/audit-hook-event.handler.ts` | `workflowKind: 'session-shell'` |
| `tests/3-operations/gateway-wire-step.util.test.ts` | Multi-hop stepCount |
| `tests/2-services/workflow-repository.test.ts` | Idempotencia tool_result |

## Run 2 — SH-β

**No ejecutado** — reservado si apply/verify refuta SH-α.

## Rollback

N/A (sin cambios de código en este run).

## Acceptance check

Ejecución documentada; implementación acotada a Etapa B vía OpenSpec.
