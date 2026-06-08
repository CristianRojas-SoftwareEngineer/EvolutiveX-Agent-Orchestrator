---
case_id: 20260608-proxy-audit-residual-gaps
profile: corrective
phase: 05-experiment-design
chain: cause
version: v1.0
timestamp: 2026-06-08T23:34:00Z
status: done
inputs: [04-hypothesis.md]
produces: 05-experiment-design.md
links: { previous: 04-hypothesis.md, next: 06-experiment-execution.md }
---

# Experiment Design — 20260608-proxy-audit-residual-gaps

## Applied policy

- **acceptance:** test de reproducción ejecutable

## Protocol

### E1 — H1 tool_result sin PostToolUse

1. Test unitario: workflow con `registerToolUse`; ejecutar `handleContinuation` con body que incluye `tool_result`.
2. **Antes del fix:** `completeToolUse` no invocado; sin evento `tool_result`.
3. **Después del fix:** `completeToolUse` invocado; evento `tool_result` en bus.

### E2 — H1 configuración hooks

1. Grep `~/.claude/settings.json` vs `configs/hooks.json`.
2. Verificar clave `PostToolUse` ausente en user-level.

### E3 — H2 métricas workflow wire

1. Test integración: wire workflow cierra por SSE terminal → `finalizeWorkflowMetrics` invocado.
2. Assert `workflow_count` incrementa en `session-metrics.json`.

### Controles

- `npm test` suite completa antes/después.
- Rollback: revert commits del caso.

## Acceptance check

3 experimentos con pasos ejecutables y criterio pass/fail.
