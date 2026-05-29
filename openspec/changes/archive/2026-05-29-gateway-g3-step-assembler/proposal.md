> **Orquestador:** `gateway-migration` | **Fase:** g3 (Refactor gateway)

## Why

La lógica de ensamblaje de la respuesta de inferencia (acumular eventos SSE → `assistantMessage`, `usage`, `stopReason`, bloques `tool_use`/`thinking`) vive incrustada dentro del bucle `stream.on('data')` de `AuditSseResponseHandler` (capa 3), mezclada con responsabilidades de disco (`sse.txt`, `sse.jsonl`) y de correlación legacy (`ISessionStore`). El diseño objetivo ([§26](../../../docs/proposals/gateway-design.md#26-streaming-sse-y-stepbuffer), [§40](../../../docs/proposals/gateway-design.md#40-capa-2-objetivo)) define ese ensamblaje como un componente de infraestructura aislado — **StepBuffer / `StepAssembler`** — reutilizable por el correlador unificado. Además, `IWorkflow.languageModelId` existe en el modelo de dominio (G1) pero **nunca se asigna**: ningún punto del lifecycle propaga el modelo observado al workflow, dato que `SessionMetricsService` necesita en G4 para desglosar `session-metrics.json` por modelo.

## What Changes

- **`StepAssembler` (capa 2, nuevo):** se extrae el estado de ensamblaje hoy embebido en `AuditSseResponseHandler` (acumuladores de `usage`, `stopReason`, `anthropicMessageId`, `model`, bloques `text`/`thinking`/`tool_use`) a un servicio de infraestructura en RAM por inferencia. Expone `onEvent(evt)` para alimentar eventos SSE parseados y produce, al `message_stop`, el resultado ensamblado (`assistantMessage`, `usage`, `stopReason`, `model`, bloques `tool_use`).
- **`AuditSseResponseHandler` (capa 3):** delega el ensamblaje en `StepAssembler`. El handler conserva sus responsabilidades de borde sin cambio de comportamiento observable: captura raw (`sse.txt`), `sse.jsonl`, side-effects de correlación legacy (`registerToolUseId`, `registerPendingAgentToolUse`, WebSearch/WebFetch), reconstrucción y `InteractionMetadata`. La extracción es **behavior-preserving** (gate de regresión: la salida en disco no cambia).
- **`IWorkflowRepository` (capa 1, port):** se añade `setWorkflowModel(workflowId, modelId)` — asigna `workflow.languageModelId` con el primer modelo observado (idempotente: no sobrescribe si ya está fijado).
- **`WorkflowRepositoryService` (capa 2, adapter):** implementa `setWorkflowModel`.
- **Propagación del modelo (capa 3):** al completar la inferencia, `AuditSseResponseHandler` resuelve el workflow en el correlador (por `sessionId` para main, `agentId` para subagente) y propaga el modelo del request vía `setWorkflowModel`. No-op defensivo si el workflow aún no fue abierto por hooks (el correlador nuevo corre en paralelo, en memoria, sin impacto en disco).

## Capabilities

### New Capabilities

- `gateway-step-assembly`: ensamblaje en RAM de la respuesta de inferencia por StepBuffer (§26) — `StepAssembler` consume eventos SSE Anthropic y produce `assistantMessage`, `usage` (con fallback de tokens en `message_delta`), `stopReason`, `model` y bloques `tool_use`; ciclo de vida efímero por inferencia (descarta RAM al `message_stop`); el handler SSE delega el ensamblaje preservando el comportamiento observable.

### Modified Capabilities

- `gateway-workflow-lifecycle`: se añade el requisito de **propagación de modelo** — el port `IWorkflowRepository` expone `setWorkflowModel(workflowId, modelId)` que fija `workflow.languageModelId` con el primer modelo observado (idempotente), prerequisito de `SessionMetricsService` en G4.

## Impact

**Capas PKA afectadas:**
- 1-domain: `src/1-domain/repositories/IWorkflowRepository.ts` (nuevo método del port).
- 2-services: `src/2-services/step-assembler.service.ts` (nuevo), `src/2-services/ports/step-assembler.port.ts` (nuevo), `src/2-services/workflow-repository.service.ts` (implementa `setWorkflowModel`).
- 3-operations: `src/3-operations/audit-sse-response.handler.ts` (delega ensamblaje + propaga modelo).
- 4-api: `composition-root` (inyectar `StepAssembler` e `IWorkflowRepository` en el handler SSE).

**No objetivos:**
- Registro/cierre de Steps en el correlador desde la ruta wire (`registerStep`/`closeStep`) — diferido a G4.
- Apertura de workflow/step en `AuditInteractionHandler` (wire-request, §41) — diferido a G4.
- Proyección de `WorkflowResult` / `Step` a disco, `EventBus`, `AuditWorkflowClosureHandler` — G4.
- `aggregateWorkflowUsageByModel` y `SessionMetricsService` — G4.
- Retiro de `ActiveInteraction`, `InteractionMetadata` y del cierre wire-only — G4.

Ver [§26](../../../docs/proposals/gateway-design.md#26-streaming-sse-y-stepbuffer), [§40](../../../docs/proposals/gateway-design.md#40-capa-2-objetivo), [§41](../../../docs/proposals/gateway-design.md#41-capa-3-objetivo) y [§43](../../../docs/proposals/gateway-design.md#43-fases-de-implementación) de `docs/proposals/gateway-design.md`.
