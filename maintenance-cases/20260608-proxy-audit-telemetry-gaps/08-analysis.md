---
case_id: 20260608-proxy-audit-telemetry-gaps
profile: corrective
phase: 08-analysis
chain: cause
version: v1.0
timestamp: 2026-06-08T14:40:00Z
status: done
inputs: [07-data-collection.md]
produces: 08-analysis.md
links: { previous: 07-data-collection.md, next: 11-solution-research.md }
---

# Analysis — 20260608-proxy-audit-telemetry-gaps

## Applied policy

- **acceptance:** ## Causa confirmada presente o refutación explícita

## Verdict per hypothesis

| ID | Resultado | Magnitud |
|----|-----------|----------|
| H1 | Confirmada | Alta — invalida agregación `stepCount` y métricas derivadas |
| H2 | Confirmada | Media — ruido telemetría; disco idempotente en overwrite |
| H3 | Confirmada | Baja — confusión analista; datos redundantes |
| H4 | Confirmada | Baja — taxonomía; no afecta causalidad |

## Causa confirmada

**Causa raíz compuesta (cuatro defectos localizados):**

1. **Cierre de step incompleto en hops `tool_use`:** `enrichOpenWireStepWithResponse` retorna sin `closeStep` cuando `stopReason === 'tool_use'`, dejando hops intermedios sin `closedAt` mientras `SessionPersistence` materializa cada `step_request` en disco.

2. **`completeToolUse` no idempotente:** coexistencia de relay PostToolUse (instalado) y fallback continuation provoca doble emisión `tool_result` al EventBus.

3. **Doble autoridad de `finalText`:** cierre SSE wire (`forceClose` con `finalText`) y cierre hook sesión (`buildWorkflowResult`) replican el mismo texto.

4. **Fallback taxonómico incorrecto:** workflow contenedor (`workflowId === sessionId`) hereda `interactionType: "main"` por ausencia de `workflowKind` semántico.

## Threats to validity

- Sesión en disco no re-verificable en este run (eliminada del workspace).
- Typecheck roto preexistente puede bloquear CI hasta fix aparte.

## Acceptance check

`## Causa confirmada` presente; las cuatro hipótesis confirmadas con evidencia convergente.
