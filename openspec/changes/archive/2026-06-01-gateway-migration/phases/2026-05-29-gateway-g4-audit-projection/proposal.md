> **Orquestador:** `gateway-migration` | **Fase:** g4 (Refactor gateway)

## Why

Tras G3, el correlador (`IWorkflowRepository`) acumula lifecycle en memoria y el `StepAssembler` ensambla inferencias, pero la ruta wire sigue siendo la fuente principal de verdad en disco: los handlers SSE/standard no invocan `registerStep`/`closeStep`, el `WorkflowResult` producido por `repo.close()` en hooks no se proyecta a `sessions/`, `meta.json` se genera aún como `InteractionMetadata` desde `StepMeta`, y `session-metrics.json` se actualiza con `updateSessionMetrics()` (schema simple, sin desglose por modelo ni `cache_efficiency`). G4 cierra el gap correlador→persistencia sin cambiar el layout flat actual — prerequisito natural de las fases P.

## What Changes

- **Bloque A — Cableado wire→correlador:** `AuditSseResponseHandler` y `AuditStandardResponseHandler` registran y cierran steps en el correlador al completar cada inferencia (`registerStep` con `IStep` construido desde request + resultado ensamblado; `closeStep` cuando el step es terminal `end_turn`, diferido si `tool_use`).
- **Bloque B — `AuditWorkflowClosureHandler` (nuevo, capa 3):** handler que, tras `repo.close()` desde `AuditHookEventHandler`, proyecta el `WorkflowResult` a disco — separa cuándo cerrar (hook) de qué escribir (closure).
- **Bloque C — Proyección `WorkflowResult`→disco (capa 2):** persistencia de `meta.json` equivalente al layout actual pero derivada de `WorkflowResult` (no de `InteractionMetadata` como fuente primaria).
- **Bloque D — `aggregateWorkflowUsageByModel` (capa 1):** función pura que agrupa `step.usage` por `step.inferenceRequest.model`.
- **Bloque E — `SessionMetricsService` (capa 2):** escritura atómica de `session-metrics.json` con desglose por modelo, `session_totals` y `cache_efficiency` (§33.2); invariante G16 — solo workflows `kind: 'main'`.
- **Bloque F — Retiro de legacy:** eliminar `updateSessionMetrics()` y migrar tipos `SessionMetrics`/`SessionModelMetrics` a `ISessionMetrics` en tipos gateway; deprecar `InteractionMetadata` como fuente de `meta.json`; cierre wire-only deja de ser ruta principal (fallback documentado).

## Capabilities

### New Capabilities

- `gateway-audit-projection`: `AuditWorkflowClosureHandler`, proyección de `WorkflowResult` a `meta.json` en el layout flat actual, retiro de `InteractionMetadata` como fuente primaria y degradación del cierre wire-only a fallback.
- `gateway-session-metrics`: `ISessionMetrics`, `SessionMetricsService`, escritura atómica de `session-metrics.json` alineada a §33.2 con invariante G16.

### Modified Capabilities

- `gateway-workflow-lifecycle`: registro y cierre de steps desde handlers wire (`registerStep`/`closeStep` en SSE y standard).
- `gateway-closure-services`: nueva función pura `aggregateWorkflowUsageByModel` para desglose de uso por modelo.
- `gateway-audit-projection` *(absorbido desde rename-interaction-to-workflow)*: `AuditInteractionContext` → `AuditWorkflowContext`; augments Fastify actualizados; nombres canónicos en código; ver §Cambios absorbidos.
- `gateway-domain-types` *(absorbido desde rename-interaction-to-workflow)*: `WorkflowRequestKind` como tipo canónico; `InteractionType`/`InteractionOutcome` eliminados; ver §Cambios absorbidos.

## Impact

**Capas PKA afectadas:**

- 1-domain: `aggregate-workflow-usage-by-model.ts`, `types/gateway/session-metrics.types.ts` (`ISessionMetrics`).
- 2-services: `session-metrics.service.ts`, proyección/mapper `WorkflowResult`; retiro de `updateSessionMetrics` en `audit-writer.service.ts`.
- 3-operations: `audit-workflow-closure.handler.ts` (nuevo), cambios en `audit-sse-response.handler.ts`, `audit-standard-response.handler.ts`, `audit-hook-event.handler.ts`.
- 4-api: composition root — cablear closure handler y `SessionMetricsService`.

**Documentación:** `docs/session-audit-model.md`, `docs/proposals/gateway-design.md` §33.2 y §40.

**Dependencia:** G3 archivada (`gateway-g3-step-assembler`). Decisión orquestador: integración de métricas de tokens G3/G4 en [`openspec/changes/archive/2026-06-01-gateway-migration/design.md`](../../design.md).

## No objetivos

- Migración de layout a `causal-workflows-v1` (fases P0–P2).
- `EventBus` / `SessionPersistence` como bus completo (§28b) — handlers llaman correlador y closure directamente.
- Tracking completo de `ToolUse.status` vía `PreToolUse`/`PostToolUse` (stubs permanecen diferidos).
- Campos `duration_ms` y `outcome` en `session-metrics.json`; `totalCostUsd` en `WorkflowResult`.
- Apertura de workflow/step en `AuditInteractionHandler` al recibir wire-request (§41, diferido).
- Cambio del árbol de directorios bajo `sessions/` (solo cambia la fuente de datos de `meta.json` y el writer de métricas).

Ver [§28b](../../../docs/proposals/gateway-design.md#28b-integración-correlador--bus-de-eventos--persistencia), [§33.2](../../../docs/proposals/gateway-design.md#332-session-metricsjson-raíz-de-sesión), [§40](../../../docs/proposals/gateway-design.md#40-capa-2-objetivo), [§41](../../../docs/proposals/gateway-design.md#41-capa-3-objetivo) y [§43](../../../docs/proposals/gateway-design.md#43-fases-de-implementación) de `docs/proposals/gateway-design.md`.

## Cambios absorbidos

### rename-interaction-to-workflow (2026-06-01)

**Orquestador:** `gateway-migration` | **Fase de absorción:** G4 (`gateway-g4-audit-projection`)

El change standalone `2026-06-01-rename-interaction-to-workflow` completó el item diferido
explícitamente en G1 («Legacy retirado: tipos `Interaction*` reemplazados — diferido a G4/P»):
renombró `AuditInteraction*` → `AuditWorkflow*` y eliminó los tipos `@deprecated`
`InteractionType`/`InteractionOutcome`. Por ser `gateway-audit-projection` la capability primaria
afectada (capability creada en G4), se absorbe en esta fase.

Renombres aplicados: `AuditInteractionHandler` → `AuditWorkflowHandler`; `AuditInteractionContext` →
`AuditWorkflowContext`; `AuditInteractionResult` → `AuditWorkflowResult`; campos `auditInteractionDir`
→ `auditWorkflowDir`, `interactionType` → `workflowKind`; métodos `closeOrphanInteraction()` →
`closeOrphanWorkflow()`, `formatAuditInteractionDirName()` → `formatWorkflowDirName()`,
`resolveWorkflowIdForInteraction()` → `resolveWorkflowId()`. Tipo `WorkflowRequestKind` añadido;
`InteractionType` e `InteractionOutcome` eliminados de `audit.types.ts`.
