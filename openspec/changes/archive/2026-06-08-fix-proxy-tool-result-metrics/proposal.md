## Why

Validación post-fix del caso `20260608-proxy-audit-discrepancies` (sesión `c5eb2667`) muestra brechas residuales: `tool_result` no persiste (tools en `running`), `session-metrics.json` con `total_workflows: 0` pese a workflows wire cerrados, y ausencia de relay `PostToolUse` en `~/.claude/settings.json`.

Caso SM: `20260608-proxy-audit-residual-gaps` (perfil correctivo).

## What Changes

- Fallback en `handleContinuation`: completar tools client-side desde bloques `tool_result` del body HTTP cuando PostToolUse no llegó al proxy.
- `extractToolResultBlocksFromRequestBody` en el clasificador de requests.
- Invocar `finalizeWorkflowMetrics` al cierre terminal SSE de workflows wire.
- Tests de regresión en audit-workflow y request-classifier.

## Capabilities

### Modified Capabilities

- `gateway-audit-projection`: correlación tool_result en continuation.
- `gateway-session-metrics`: finalize métricas en cierre wire SSE.
- `session-persistence`: escenario tool_result vía continuation fallback.

## Impact

| Área | Archivos |
|------|----------|
| 1-domain | `request-classifier.service.ts` |
| 3-operations | `audit-workflow.handler.ts`, `audit-sse-response.handler.ts` |
| tests | `audit-workflow.handler.test.ts`, `request-classifier.test.ts` |

**Operacional:** reinstalar hooks (`npm run setup -- --hooks`) para relay PostToolUse en user-level.
