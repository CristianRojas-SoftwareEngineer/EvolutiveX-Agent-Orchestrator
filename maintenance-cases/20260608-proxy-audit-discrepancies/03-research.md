---
case_id: 20260608-proxy-audit-discrepancies
profile: corrective
phase: 03-research
chain: cause
version: v1.0
timestamp: 2026-06-08T18:37:00Z
status: done
inputs: [02-problem-definition.md]
produces: 03-research.md
links: { previous: 02-problem-definition.md, next: 04-hypothesis.md }
---

# Research — 20260608-proxy-audit-discrepancies

## Applied policy

- **focus:** regresiones recientes + recall por defect-class
- **evidence:** related_commits, code_refs, recalled_lessons

## Recalled lessons

Consulta MEMORY.md por tags `session-persistence`, `audit`, `wire-workflow`: sin lecciones previas específicas para esta clase de defecto.

## Findings

### F1 — Workflows wire no se cierran en `end_turn`

`registerWireStepInCorrelator` (`gateway-wire-step.util.ts:76-84`) solo llama `closeStep` en stop terminal; **no emite `workflow_complete`** para workflows wire (`workflow.id !== sessionId`). El cierre de workflow principal ocurre solo vía hook `Stop` (`audit-hook-event.handler.ts:34-47`), que resuelve `getWorkflowBySessionId` → workflow sesión, no wire.

### F2 — `step_request` duplicado con body vacío

`WorkflowRepositoryService.registerStep` (`workflow-repository.service.ts:199-208`) emite `step_request` con `request: step.inferenceRequest` donde `buildInferenceRequest` fuerza `messages: []` (`audit-workflow.handler.ts:177-184`).

`registerWireStepRequest` emite un segundo `step_request` con `stepIndex: workflow.steps.length` (off-by-one tras push) y body parseado (`audit-workflow.handler.ts:203-216`). El primer evento escribe `messages: []` al índice correcto; el segundo puede ir al índice erróneo o ser sobrescrito.

`registerWireStepInCorrelator` también invoca `registerStep` al cerrar respuesta SSE, potencialmente **sobrescribiendo** `request/body.json` del step de respuesta con inference vacío.

### F3 — `StepAssemblerService` omite bloques `text`

`step-assembler.service.ts:168-181` solo ensambla `thinking` y `tool_use`. No hay handler para `content_block_start` type `text` ni `text_delta`. Explica body.json con solo thinking.

### F4 — `tool_result` depende de hook PostToolUse + registro previo

`audit-hook-event.handler.ts:109-128` llama `completeToolUse` si encuentra workflow por `toolUseId`. `audit-sse-response.handler.ts:181-186` registra tools client-side con `registerToolUse` al fin del stream SSE.

Si `registerStep` en correlador emite `step_request` antes de `registerToolUse`, el orden en sesión analizada podría indicar que en la versión capturada `registerToolUse` para client-side no existía o el hook no correlacionó. El código actual tiene el registro pero la persistencia falló en la sesión — coherente con F2 (tool en step sin `tool_call` event llegando a persistence) o race hook-antes-SSE-end.

### F5 — `interactionType` no proyectado

`openWorkflow` emite `workflowKind` en payload (`workflow-repository.service.ts:139-146`) pero `SessionPersistence.onWorkflowStart` (`session-persistence.service.ts:119-127`) usa solo `p.kind` (siempre `'main'`) para `meta.workflowKind`.

### F6 — Spec de referencia

`openspec/specs/session-persistence/spec.md` define escenarios para `tool_result`, `workflow_complete`, y `step_request` con body completo.

## Related code

| Archivo | Líneas | Rol |
|---------|--------|-----|
| `gateway-wire-step.util.ts` | 61-84 | Registro step + cierre parcial |
| `audit-workflow.handler.ts` | 186-217 | Proyección request wire |
| `audit-sse-response.handler.ts` | 139-245 | Fin SSE + tool registration |
| `step-assembler.service.ts` | 37-197 | Coalescencia RAM |
| `session-persistence.service.ts` | 109-147, 188-196 | Proyección disco |
| `workflow-repository.service.ts` | 199-256 | Eventos correlador |

## Constraints

- Tests existentes en `tests/2-services/session-persistence.test.ts`, `audit-sse-response.handler.test.ts`, `workflow-repository.test.ts`.
- Cambio debe mantener compatibilidad con subagentes y coalesced agent continuation.

## Acceptance check

Recall ejecutado (sin hits). 6 hallazgos con file:line. Spec citada.
