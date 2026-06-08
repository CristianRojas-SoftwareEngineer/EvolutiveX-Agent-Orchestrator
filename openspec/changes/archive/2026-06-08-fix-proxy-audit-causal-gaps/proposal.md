## Why

En sesiones agentic simples (p. ej. `7dd03f66-5838-474a-b640-409c3e8d49a0`), la auditoría causal del proxy captura SSE crudo con fidelidad pero **falla en tres puntos críticos**: workflows wire permanecen en `running` sin `workflow_complete`, `tool_result` no se proyecta a disco, y `request/body.json` de continuaciones contiene `messages: []`. Además, `body.json` de respuestas SSE omite bloques `text`.

Caso SM: `20260608-proxy-audit-discrepancies` (perfil correctivo).

## What Changes

- Cerrar workflows wire al recibir `stopReason` terminal (`end_turn`, `max_tokens`) emitiendo `workflow_complete` con `outcome: success`.
- Eliminar emisión duplicada de `step_request` desde `registerStep` (solo handlers L3 emiten con body HTTP real); corregir `stepIndex` off-by-one en `registerWireStepRequest`.
- Añadir ensamblaje de bloques `text` en `StepAssemblerService`.
- Persistir `interactionType` en `meta.json` desde payload `workflowKind` del evento `workflow_start`.
- Tests de regresión en assembler, workflow-repository y audit-workflow handler.

## Capabilities

### Modified Capabilities

- `session-persistence`: `interactionType` en meta; `step_request` con body completo.
- `gateway-audit-projection`: cierre wire en stop terminal; assembler con bloques text.

## Impact

| Área | Archivos |
|------|----------|
| 2-services | `workflow-repository.service.ts`, `step-assembler.service.ts`, `session-persistence.service.ts` |
| 3-operations | `gateway-wire-step.util.ts`, `audit-workflow.handler.ts` |
| tests | `step-assembler`, `workflow-repository`, `audit-workflow.handler` |
