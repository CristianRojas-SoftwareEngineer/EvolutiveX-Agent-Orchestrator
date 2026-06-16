## Context

El modelo causal (`session-audit-model.md`) define un hop HTTP como ciclo request→response bajo `steps/MM/`. Tras unificar ingress/egress, la persistencia materializa N carpetas `steps/` pero el correlador solo marca `closedAt` en el hop terminal (`end_turn`), dejando hops `tool_use` abiertos. Paralelamente, PostToolUse y el fallback de continuation (`proxy-tool-result-continuation-fallback`) coexisten y ambos llaman `completeToolUse` sin guard.

Evidencia: análisis `/analyze-session` sesión `dcdf0a15-4f0b-4a77-864e-1e481b07315c`.

## Goals / Non-Goals

**Goals:**

- `IWorkflowResult.stepCount` refleja hops cerrados en correlador (= carpetas `steps/` en flujo normal).
- Ratio 1:1 `tool_call`:`tool_result` en EventBus.
- Una sola copia de `finalText` por turno agentic (workflow wire).
- `interactionType` documentado para el shell de sesión.

**Non-Goals:**

- Cambiar semántica de `workflowKind` estructural (`main` | `subagent`).
- Reescribir métricas de sesión más allá de coherencia indirecta vía `stepCount`.

## Decisions

### D1 — Cerrar step en `tool_use` (S-A sobre S-B)

**Decisión:** En `enrichOpenWireStepWithResponse` **y** en la rama fallback de `registerWireStepInCorrelator`, cuando `stopReason === 'tool_use'`, asignar `closedAt` e invocar `repo.closeStep`.

**Rationale:** Un hop que termina pidiendo tools es un hop completo; alinear memoria con disco y con `closeWireWorkflowOnTerminalStop` que cuenta `closedSteps`. El fallback sin step abierto debe tener paridad para no dejar huecos en edge cases.

**Alternativa descartada (S-B):** `stepCount = workflow.steps.length` — frágil si quedan steps abiertos por race.

### D2 — Idempotencia en `completeToolUse` (S-D)

**Decisión:** Si `toolUse.status` es `completed` o `error`, return sin re-emitir.

**Rationale:** PostToolUse y continuation son complementarios; el guard es defensivo y de bajo coste.

### D3 — `finalText` solo en wire (S-G sobre S-F)

**Decisión:** `buildWorkflowResult` omite `finalText` cuando `workflow.id === hook.sessionId`.

**Rationale:** El wire agentic tiene evidencia SSE completa; el shell es contenedor lifecycle (hook Stop).

### D4 — `session-shell` (S-H)

**Decisión:** `UserPromptSubmit` invoca `openWorkflow(sessionId, agentCtx, { workflowKind: 'session-shell' })` (tercer argumento `options`); `SessionPersistence` persiste como `interactionType`.

**Rationale:** Distingue contenedor de turno agentic sin romper `workflowKind: 'main'` estructural.

### D5 — Spec dual para `finalText` (coherencia verify)

**Decisión:** Delta en `gateway-closure-services` además de `gateway-workflow-lifecycle` para que `buildWorkflowResult` y el handler de hooks no contradigan el requisito de omitir `finalText` en shell.

**Rationale:** El spec principal de closure-services exige `finalText` siempre; sin delta, `openspec-verify` podría detectar conflicto post-sync.

## Risks / Trade-offs

- **[Riesgo]** Cerrar en `tool_use` podría afectar lógica que asumía step abierto hasta continuation → **Mitigación:** continuation ya abre nuevo step en ingress; tests multi-hop.
- **[Riesgo]** Consumidores que lean `finalText` del shell → **Mitigación:** documentar wire como fuente; shell conserva `outcome` y `stepCount: 0`.
- **[Riesgo]** Herramientas que filtren `interactionType === 'main'` → **Mitigación:** delta spec + nota en session-audit-model.

## Migration Plan

1. Implementar según `tasks.md`.
2. `npm run test:unit` verde.
3. Validar con sesión agentic live multi-hop (deuda D2).
4. Sin migración de sesiones en disco.

## Open Questions

- ¿Exportar `session-shell` en `WorkflowRequestKind` TypeScript o string literal en meta solamente? → Preferir extender el union type.
