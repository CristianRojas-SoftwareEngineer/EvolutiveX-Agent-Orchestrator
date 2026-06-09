---
case_id: 20260608-proxy-audit-telemetry-gaps
profile: corrective
phase: 17-conclusion
chain: closure
version: v1.0
timestamp: 2026-06-08T15:15:00Z
status: done
case_run: 1
inputs: [02-problem-definition.md, 08-analysis.md, 16-solution-analysis.md]
produces: 17-conclusion.md
links: { previous: 16-solution-analysis.md, next: 18-communication.md }
---

# Conclusion — 20260608-proxy-audit-telemetry-gaps

## Route

**(a)** — Causa confirmada (H1–H4) + Solución ganadora (SH-α) + `integration_mode: Completo`.

## Verdict

**Pendiente de implementación** — causa compuesta confirmada; solución SH-α especificada; listo para OpenSpec Etapa B.

## Causa confirmada (resumen)

1. Hops `tool_use` no cierran step en correlador → `stepCount` subreportado.
2. `completeToolUse` no idempotente → doble `tool_result` con PostToolUse + fallback.
3. Doble cierre con `finalText` (wire SSE + hook sesión).
4. Shell sesión sin `workflowKind` semántico → `interactionType: "main"`.

## Solución ganadora

SH-α — ver `16-solution-analysis.md ## Solución ganadora`.

## Validated spec (Etapa B)

### gateway-audit-projection delta

- `enrichOpenWireStepWithResponse` y la rama fallback de `registerWireStepInCorrelator` SHALL cerrar el step (`closedAt` + `closeStep`) cuando `stopReason === 'tool_use'`.
- `completeToolUse` SHALL ser idempotente: si el tool ya está `completed` o `error`, no SHALL re-emitir `tool_result`.
- `closeWireWorkflowOnTerminalStop` SHALL seguir siendo la fuente canónica de `finalText` para workflows wire agentic.

### gateway-closure-services delta

- `buildWorkflowResult` SHALL omitir `finalText` cuando el workflow es el contenedor de sesión (`workflow.id === sessionId`).

### gateway-workflow-lifecycle delta

- `UserPromptSubmit` SHALL abrir el workflow sesión con `workflowKind: 'session-shell'` (tercer argumento `options` de `openWorkflow`).

### session-persistence delta

- `interactionType` SHALL aceptar `session-shell` además de `agentic | client-preflight | side-request`.
- `meta.json` del shell SHALL usar `interactionType: "session-shell"` y `workflowKind: "main"` (estructural).

## Debt

| ID | Item | Prioridad |
|----|------|-----------|
| D1 | Enriquecer `server/logs.jsonl` con `sessionId`/`workflowId` | Media |
| D2 | Validar con sesión live multi-hop post-apply | Alta |
| D3 | Typecheck preexistente `audit-sse-response.handler.ts:262` | Media (fuera de scope) |

## Lesson

> Un hop HTTP completo termina en `tool_use` o stop terminal: **ambos** deben cerrar el `IStep` en correlador. La telemetría `tool_result` debe ser **idempotente** porque PostToolUse y continuation fallback son caminos complementarios, no excluyentes.

## Acceptance check

Veredicto coherente con 08 y 16. Spec validada para Etapa B.
