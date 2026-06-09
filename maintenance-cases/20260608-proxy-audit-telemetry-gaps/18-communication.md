---
case_id: 20260608-proxy-audit-telemetry-gaps
profile: corrective
phase: 18-communication
chain: closure
version: v1.0
timestamp: 2026-06-08T15:20:00Z
status: done
case_run: 1
inputs: [17-conclusion.md, 16-solution-analysis.md]
produces: 18-communication.md
links: { previous: 17-conclusion.md, next: }
---

# Communication — 20260608-proxy-audit-telemetry-gaps

## Route

**(a) investigativo con OpenSpec creado** — spec lista; implementación vía `openspec-apply` pendiente de ejecución.

## Summary

Análisis SM completo de brechas de telemetría detectadas en sesión `dcdf0a15` (post-fix unify step). Causa compuesta confirmada en cuatro puntos. Solución ganadora **SH-α** consolidada en change OpenSpec `fix-proxy-audit-telemetry-gaps`.

## Root cause

1. Hops `tool_use` no cierran `IStep` en correlador.
2. `completeToolUse` re-emite `tool_result`.
3. `finalText` duplicado shell + wire.
4. `interactionType: "main"` no documentado para shell.

## Winning solution

SH-α (ver `16-solution-analysis.md ## Solución ganadora`):

- Cerrar step en `tool_use`
- Idempotencia `completeToolUse`
- `finalText` solo en wire
- `session-shell` en meta

## OpenSpec

| Artefacto | Ruta |
|-----------|------|
| Change | `openspec/changes/fix-proxy-audit-telemetry-gaps/` |
| Proposal | `proposal.md` |
| Design | `design.md` |
| Tasks | `tasks.md` (5 secciones, apply-ready) |
| Deltas | `gateway-audit-projection`, `gateway-workflow-lifecycle`, `session-persistence` |

**Próximo paso:** `/openspec-apply fix-proxy-audit-telemetry-gaps`

## CHANGELOG

`--pending` — entrada se derivará al commit con trailer `Case: 20260608-proxy-audit-telemetry-gaps`.

## Commit draft (no ejecutado)

```
fix(audit): coherencia stepCount, tool_result y finalText en telemetría

Propósito: cerrar brechas de metadatos detectadas al analizar sesión dcdf0a15.
Objetivos: stepCount=N hops, 1 tool_result/tool, finalText único, session-shell.
Resumen: change OpenSpec fix-proxy-audit-telemetry-gaps (SH-α especificada).

(ver 16-solution-analysis.md ## Solución ganadora)

Case: 20260608-proxy-audit-telemetry-gaps
```

## Retention

Conservar: artefactos `01–18`, change OpenSpec, lesson en `.claude/memory/`.
Descartar: N/A.

## Bucle C

No aplica — caso `done` tras apply/verify (o pausa solo si apply falla).

## Acceptance check

Comunicación coherente con ruta (a); cita solución ganadora; change OpenSpec referenciado.
