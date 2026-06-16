## Context

El camino nominal `PostToolUse` → `completeToolUse` → `tool_result` falla cuando la clave `PostToolUse` no está en `~/.claude/settings.json`. El body de continuación ya contiene los bloques `tool_result` (fix previo de `step_request`).

## Decisiones

### D1 — Fallback en continuation (no solo hooks)

`AuditWorkflowHandler.handleContinuation` SHALL invocar `completeToolUse` por cada bloque `tool_result` del último mensaje user antes de registrar el step de continuación.

**Alternativa rechazada:** solo documentar reinstalación de hooks — no restaura trazabilidad si el hook falta en runtime.

### D2 — Finalize métricas en cierre wire SSE

Tras `registerWireStepInCorrelator` cuando `forceClose` cierra el workflow wire, `AuditSseResponseHandler` SHALL invocar `finalizeWorkflowMetrics`.

**Alternativa rechazada:** contar workflows en `workflow-sequence.json` — sistemas distintos (consumo vs causal).

### D3 — stepCount workflow sesión (deuda)

No agregar agregación de steps hijos en `workflows/00/output/result.json` — semántica dual-layer documentada como deuda.

## Riesgos

- Doble `completeToolUse` si PostToolUse y fallback coinciden: `completeToolUse` es idempotente sobre el mismo toolUseId.
