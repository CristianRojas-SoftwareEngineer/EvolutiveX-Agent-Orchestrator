---
case_id: 20260608-proxy-audit-residual-gaps
profile: corrective
phase: 03-research
chain: cause
version: v1.0
timestamp: 2026-06-08T23:32:00Z
status: done
inputs: [02-problem-definition.md]
produces: 03-research.md
links: { previous: 02-problem-definition.md, next: 04-hypothesis.md }
---

# Research — 20260608-proxy-audit-residual-gaps

## Applied policy

- **acceptance:** recall ejecutado; fuentes citadas

## Recall (knowledge base)

- **Lesson `proxy-audit-step-request-emit-2026-06`:** no emitir `step_request` sintético; handlers L3 poseen body real. Relacionado con continuaciones, no con PostToolUse.
- **Caso `20260608-proxy-audit-discrepancies`:** H4 asumió que `registerToolUse` + fix H2 desbloquearían `tool_result` vía hook PostToolUse.

## Code paths

| Componente | Rol |
|------------|-----|
| `audit-hook-event.handler.ts` | `PostToolUse` → `completeToolUse` → emite `tool_result` |
| `post-hook-event.ts` | Relay stdin → `POST /hooks` |
| `session-persistence.service.ts` | `onToolResult` escribe `result.json` |
| `audit-workflow.handler.ts` | `handleContinuation` enlaza step; solo `consumePendingToolUse` para agentes |
| `session-metrics.service.ts` | `finalizeWorkflowMetrics` solo desde hook Stop / closure handler |
| `gateway-wire-step.util.ts` | `closeWireWorkflowOnTerminalStop` → `forceClose` sin métricas |
| `mergeHooks` (`features/hooks.ts`) | Añade claves ausentes al instalar hooks |

## Specs

- `openspec/specs/hooks-lifecycle-correlation/spec.md`: PostToolUse matcher `*` obligatorio; 8 claves lifecycle.
- `openspec/specs/session-persistence/spec.md`: escenarios `tool_result`, `workflow_complete`.

## Gap analysis

1. **Config:** `~/.claude/settings.json` sin `PostToolUse` → hook nunca relay al proxy.
2. **Código:** sin fallback en continuation para `completeToolUse` cuando PostToolUse falta.
3. **Métricas:** wire workflows cierran vía SSE `forceClose`; `finalizeWorkflowMetrics` no se invoca.
4. **Hooks vacíos:** origen no identificado en código SCP (posible cliente externo o stdin vacío).

## Acceptance check

Recall citado; 4 gaps documentados con referencias.
