---
case_id: 20260609-proxy-concurrent-step-attribution
profile: corrective
phase: 17-conclusion
chain: closure
version: v1.0
timestamp: 2026-06-09T11:15:00Z
status: done
inputs: [02-problem-definition.md, 08-analysis.md, 16-solution-analysis.md]
produces: 17-conclusion.md
links: { previous: 16-solution-analysis.md, next: 18-communication.md }
---

# Conclusion — 20260609-proxy-concurrent-step-attribution

## Route

**(a)** — Causa confirmada (H1) + Solución ganadora (S-A) + `integration_mode: Completo`.

## Verdict

**Pendiente de implementación.** Causa y solución están validadas por análisis estático y evidencia de sesión. La corrección es localizada: egress debe consumir `assignedStepIndex` del `AuditWorkflowContext`.

## Success criterion check

| Criterio | Estado |
|----------|--------|
| Causa raíz identificada | ✓ |
| ≥2 alternativas evaluadas | ✓ (S-A..S-D) |
| Solución ganadora con diff mínimo | ✓ S-A |
| Test regresión definido | ✓ (apply) |
| Implementación | Pendiente (`openspec-apply`) |

## Validated specification

OpenSpec change: **`fix-concurrent-step-attribution`**

### Requirements

1. **`enrichWireStepWithResponseByIndex`**: enriquecer step por índice explícito; fallback a heurística solo si índice no encuentra step abierto.
2. **SSE handler**: `stream_chunk.stepIndex` = `context.assignedStepIndex` (no captura única de `resolveOpenWireStepIndex` al inicio si puede quedar obsoleto — usar siempre `assignedStepIndex`).
3. **Standard handler**: enrich por `context.assignedStepIndex`.
4. **Test**: dos steps abiertos, dos egress, sin cross-wiring.
5. **Delta spec** `gateway-audit-projection`: documentar obligación de índice estable ingress→egress bajo concurrencia.

### Design decisions

- **D1:** Reutilizar `assignedStepIndex` existente (no nuevo UUID).
- **D2:** Mantener `enrichOpenWireStepWithResponse` como wrapper con heurística para edge cases sin contexto.
- **D3:** No serializar egress globalmente — innecesario si índice es correcto.

## Discarded alternatives

Ver `16-solution-analysis.md`.

## Debt / follow-ups

- Validar con sesión real post-fix (`52f8f157` escenario).
- Revisar `total_workflows` drift (fuera de scope).

## Lesson

Ver `.claude/memory/proxy-concurrent-step-attribution-2026-06.md` (escribir en apply).

## Acceptance check

Ruta (a) con spec validada lista para Etapa B.
