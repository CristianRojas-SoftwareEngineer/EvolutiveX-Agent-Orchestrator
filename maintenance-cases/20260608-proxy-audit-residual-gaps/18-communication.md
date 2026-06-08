---
case_id: 20260608-proxy-audit-residual-gaps
profile: corrective
phase: 18-communication
chain: closure
version: v1.0
timestamp: 2026-06-08T23:56:00Z
status: done
case_run: 1
inputs: [17-conclusion.md]
produces: 18-communication.md
links: { previous: 17-conclusion.md, next: "" }
---

# Communication — 20260608-proxy-audit-residual-gaps

## Resumen ejecutivo

Segundo caso correctivo tras validar el fix de auditoría causal: las tools Bash quedaban en `running` y `total_workflows` era 0 porque faltaba el hook `PostToolUse` en la configuración del usuario y el proxy no tenía fallback ni finalize de métricas en cierre wire.

## Cambios aplicados

- **Fallback continuation:** `completeClientToolResultsFromContinuation` completa tools desde `tool_result` en el body HTTP.
- **Métricas wire:** `finalizeWorkflowMetrics` al cierre terminal SSE.
- **Tests:** 595 unitarios verdes.

## Evidencia

- Sesión validación: `c5eb2667-8de6-42ab-8474-ba82877b344c`
- Solución: `16-solution-analysis.md ## Solución ganadora`
- OpenSpec: `fix-proxy-tool-result-metrics`

## Acción requerida del operador

```bash
npm run setup -- --hooks
```

Verificar que `~/.claude/settings.json` contiene clave `PostToolUse` con `matcher: "*"` y `post-hook-event.ts`.

## CHANGELOG

Pendiente de commit con trailer `Case: 20260608-proxy-audit-residual-gaps`.

## Acceptance check

Commit draft con Case trailer; ruta (a) OpenSpec archive pendiente post-commit.
