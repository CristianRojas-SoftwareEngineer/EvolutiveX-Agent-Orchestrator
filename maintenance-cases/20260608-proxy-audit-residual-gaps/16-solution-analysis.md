---
case_id: 20260608-proxy-audit-residual-gaps
profile: corrective
phase: 16-solution-analysis
chain: solution
version: v1.0
timestamp: 2026-06-08T23:50:00Z
status: done
inputs: [15-solution-data-collection.md]
produces: 16-solution-analysis.md
links: { previous: 15-solution-data-collection.md, next: 17-conclusion.md }
---

# Solution Analysis — 20260608-proxy-audit-residual-gaps

## Applied policy

- **acceptance:** ganadora con justificación; descartadas + razón

## Solución ganadora

**SH1 — S2 + S3 (código):** fallback de `tool_result` en continuation + finalize métricas al cierre wire SSE.

**Diff mínimo citado:**
- `completeClientToolResultsFromContinuation` en `audit-workflow.handler.ts`
- `finalizeWorkflowMetrics` post-`registerWireStepInCorrelator` en `audit-sse-response.handler.ts`
- `extractToolResultBlocksFromRequestBody` en `request-classifier.service.ts`

**Justificación:** 595 tests verdes; SC1 cubierto por test continuation; SC2 cubierto por invocación finalize en wire close; blast radius acotado a 3 archivos fuente.

## Hipótesis descartadas

| ID | Razón |
|----|-------|
| S4 | Deuda documental; `stepCount: 0` en workflow sesión es semántica dual-layer |
| S1 solo | Insuficiente sin fallback; complemento operacional recomendado |

## Complemento operacional (no código)

Ejecutar `npm run setup -- --hooks` para instalar `PostToolUse` ausente en `~/.claude/settings.json`.

## Acceptance check

`## Solución ganadora` presente; descartadas justificadas.
