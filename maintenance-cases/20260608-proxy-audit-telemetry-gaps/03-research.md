---
case_id: 20260608-proxy-audit-telemetry-gaps
profile: corrective
phase: 03-research
chain: cause
version: v1.0
timestamp: 2026-06-08T14:15:00Z
status: done
inputs: [02-problem-definition.md]
produces: 03-research.md
links: { previous: 02-problem-definition.md, next: 04-hypothesis.md }
---

# Research — 20260608-proxy-audit-telemetry-gaps

## Applied policy

- **acceptance:** recall ejecutado; fuentes citadas

## Recall (knowledge base)

| Lesson | Relevancia |
|--------|------------|
| `proxy-wire-step-unify-request-response-2026-06.md` | Un hop → un `steps/MM/`; `stepCount` debe alinearse con hops, no con steps abiertos sin `closedAt`. |
| `proxy-tool-result-continuation-fallback-2026-06.md` | Fallback continuation completa tools cuando PostToolUse no llega; riesgo de doble completado si ambos caminos activos. |

## Casos SM relacionados (cerrados)

| Case | Hallazgo | Estado |
|------|----------|--------|
| `20260608-proxy-step-request-response-split` | Doble carpeta step por hop; fix `enrichOpenWireStepWithResponse` | done — change archivado |
| `20260608-proxy-audit-residual-gaps` | Fallback continuation + finalize métricas wire | done |
| `20260608-proxy-audit-discrepancies` | Cierre wire, step_request duplicado, assembler text | done |

## Code references

### G1 — stepCount

`gateway-wire-step.util.ts` — `enrichOpenWireStepWithResponse`:

```86:88:src/3-operations/gateway-wire-step.util.ts
  if (stopReason === 'tool_use') {
    return openStep;
  }
```

Hops con `tool_use` **no cierran** el step en correlador. `closeWireWorkflowOnTerminalStop` usa `closedSteps.filter(s => s.closedAt != null).length` → solo el hop terminal cuenta.

### G2 — tool_result duplicado

`completeClientToolResultsFromContinuation` (`audit-workflow.handler.ts:633`) invoca `completeToolUse` en cada continuation.

`handlePostToolUse` (`audit-hook-event.handler.ts:125`) también invoca `completeToolUse`.

`WorkflowRepositoryService.completeToolUse` (`workflow-repository.service.ts:233-253`) **no comprueba** si el tool ya está `completed` antes de `emit('tool_result')`.

### G3 — finalText duplicado

- Wire: `closeWireWorkflowOnTerminalStop` añade `finalText` desde mensaje assistant (`gateway-wire-step.util.ts:184-187`).
- Sesión: `buildWorkflowResult` + hook `Stop` copia `finalText` desde hook (`build-workflow-result.ts:28`).

### G4 — interactionType

`SessionPersistence.onWorkflowStart` (`session-persistence.service.ts:121`):

`interactionType = p.workflowKind ?? structuralKind` → workflow sesión sin `workflowKind` → `"main"`.

`AuditHookEventHandler` abre sesión vía `UserPromptSubmit` sin pasar `workflowKind`.

## Acceptance check

Recall citado; cuatro puntos de código anclados a síntomas O3–O6.
