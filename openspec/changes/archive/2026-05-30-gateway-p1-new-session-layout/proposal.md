## Why

> **Orquestador:** `gateway-migration` | **Fase:** p1 (P)

El gateway proyecta datos de auditoría a disco mediante escritura directa desde handlers de capa 3 (`AuditWriterService`, `SessionStoreService`), generando un layout flat (interacciones, pasos, sub-agentes anidados). Este diseño viola §28b.4 regla 1 — los handlers no deben escribir disco directamente — y genera acoplamiento entre lógica de negocio y persistencia.

La fase G4 ya proyecta `WorkflowResult` a disco, pero lo hace a través del layout flat heredado. P1 reemplaza toda la pila de persistencia por la arquitectura EventBus + SessionPersistence (Opción A ratificada, §28b/§40), donde el correlador emite eventos a un bus y `SessionPersistence` los consume como suscriptor independiente para producir el layout `causal-workflows-v1` (`workflows/NN/steps/MM/tools/KK/`).

Adicionalmente, P1 migra los 6 handlers de capa 3 que aún dependen de los tipos legacy (`ActiveInteraction`, `InteractionMetadata`) y los puertos legacy (`ISessionStore`, `IAuditWriter`) a los tipos gateway (`IWorkflow`, `IStep`, `IToolUse`, `IWorkflowResult`) y al patrón EventBus. Esto permite la eliminación completa del modelo `Interaction` legacy.

## What Changes

- **Nueva pila de persistencia (Opción A):** crear `IEventBus` (port L1), `EventBus` (adapter L2), `SessionPersistence` (suscriptor L2) y conectar el correlador al bus para que cada mutación de estado emita el evento §28b.3 correspondiente.
- **Nuevo método `completeToolUse()`** en el correlador: completa `ToolUse` (por timeout §24.1 o por hook `PostToolUse`/`PostToolUseFailure`) y emite `tool_result` al bus.
- **Layout `causal-workflows-v1`:** las sesiones nuevas adoptan la estructura `workflows/NN/steps/MM/tools/KK/` con `meta.json` (identidad+estado fusionado, sin `state.json` separado — decisión D2) y `output/result.json` (IWorkflowResult + steps[] — decisión D1/D3).
- **Corte limpio:** sesiones anteriores al layout se eliminan al arranque; no hay migración de datos en reposo.
- **Migración de handlers L3 a tipos gateway:** los 6 handlers (`audit-interaction`, `audit-standard-response`, `audit-sse-response`, `audit-upstream-error`, `audit-workflow-closure`, `gateway-wire-step`) migran de `ActiveInteraction`/`InteractionMetadata`/`ISessionStore`/`IAuditWriter` a `IWorkflow`/`IStep`/`IToolUse`/`IWorkflowResult`/`IWorkflowRepository`/`EventBus`.
- **Ampliación del catálogo de eventos:** nuevos eventos para escrituras de contenido (`step_request`, `step_response`, `tool_call`, `tool_result`) que `SessionPersistence` consume para escribir a disco.
- **Retiro del modelo legacy (alcance P1):** eliminación de `ISessionStore`, `SessionStoreService`, `IAuditWriter` (puerto completo), `WorkflowResultProjector`, `ActiveInteraction`, constantes flat de `audit-paths.ts` y tipos asociados retirados. `AuditWriterService` **permanece** como implementación del shim `ISseAuditWriter` (`@deprecated-p2`) para SSE hasta P2. Tipos `Interaction*` restantes solo donde el shim o wire metadata los requieren.

## No objetivos

- Artefactos nuevos (`events.ndjson`, streaming chunks, `workflow-sequence.json`) — pertenecen a P2.
- Escritura de `sse.jsonl` (se retira en P2).
- Transformación de sesiones anteriores al nuevo layout.

## Capabilities

### New Capabilities

- `event-bus`: Bus de eventos async in-process (IEventBus port + EventBus adapter) con pattern matching de suscripciones (`*`, `prefix_*`, `*_suffix`).
- `session-persistence`: Suscriptor del bus que proyecta eventos a disco bajo la estructura `causal-workflows-v1` (meta.json, output/result.json, steps/, tools/).
- `session-routing`: Funciones de mapeo de eventos a rutas de directorio (`getWorkflowDir`, `getStepDir`, `getToolsDir`).

### Modified Capabilities

- `gateway-workflow-lifecycle`: El correlador (`WorkflowRepositoryService`) emite eventos al bus en cada mutación de estado; se crea el método `completeToolUse()`; se amplía con métodos de lookup y gestión de pending tool uses.
- `gateway-audit-projection`: La proyección de `WorkflowResult` a disco se delega a `SessionPersistence` en lugar de escritura directa desde handlers. `AuditWorkflowClosureHandler` se conserva como coordinador de métricas. Handlers L3 migran a tipos gateway.
- `gateway-wire-step`: Funciones utilitarias migran de `ActiveInteraction` a `IWorkflow`.
- L3 handlers (`audit-interaction`, `audit-standard-response`, `audit-sse-response`, `audit-upstream-error`): migran a tipos gateway + EventBus.

### Removed Capabilities

- `session-store` (ISessionStore + SessionStoreService): reemplazado por `IWorkflowRepository` ampliado + `EventBus`.
- `audit-writer` (puerto `IAuditWriter` completo): reemplazado por `SessionPersistence` (vía EventBus) para el árbol causal; escrituras SSE vía `ISseAuditWriter` (`AuditWriterService`, `@deprecated-p2`) hasta P2.
- Model types legacy (`ActiveInteraction`, `InteractionMetadata`, `StepMeta`, `InteractionType`, `InteractionState`, `InteractionOutcome`, `ParentContext`, `SideRequestKind`, `PendingAgentToolUse`, `PendingWebSearchToolUse`, `PendingWebFetchToolUse`, `ResolvedInternalTool`): reemplazados por tipos gateway.

## Impact

- **Capas PKA afectadas:** L1 (nuevos ports y tipos), L2 (nuevos adapters + modificación del correlador), L3 (migración de 6 handlers), L4 (cableado en composition root).
- **Archivos nuevos:** `IEventBus.ts`, `telemetry.types.ts`, `event-pattern-match.service.ts`, `event-bus.service.ts`, `session-persistence.service.ts`, `session-routing.ts`, `async.utils.ts`.
- **Archivos modificados:** `workflow-repository.service.ts` (emisión al bus + `completeToolUse()` + métodos de lookup), `audit-hook-event.handler.ts` (completeToolUse en hooks + simplificación de `delegateClosure()`), `audit-interaction.handler.ts`, `audit-standard-response.handler.ts`, `audit-sse-response.handler.ts`, `audit-upstream-error.handler.ts`, `audit-workflow-closure.handler.ts`, `gateway-wire-step.util.ts`, `composition-root.ts` (cableado EventBus).
- **Archivos eliminados:** `session-store.service.ts`, `workflow-result-projector.service.ts`, puertos `ISessionStore` e `IAuditWriter`, constantes flat retiradas de `audit-paths.ts`, tipos `ActiveInteraction` y asociados retirados de `audit.types.ts`.
- **Archivos conservados (shim P1):** `audit-writer.service.ts` implementa `ISseAuditWriter` (`sse-audit-writer.port.ts`), no el puerto `IAuditWriter` histórico.
- **Documentación:** `docs/session-audit-model.md`, `README.md`, `docs/proposals/gateway-design.md` §29, §30, §33, §37b, §40, §46.4.
